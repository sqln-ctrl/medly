from collections.abc import AsyncIterator
from pathlib import Path

import jwt
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.auth_security import JWT_AUDIENCE, JWT_ISSUER, hash_refresh_token
from app.db import Base, get_session
from app.main import app
from app.models import RefreshToken, User
from app.rate_limit import limiter

TEST_JWT_SECRET = "test-only-secret-for-medly-auth-tests-32-bytes"


@pytest_asyncio.fixture
async def client(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> AsyncIterator[AsyncClient]:
    database_path = tmp_path / "auth-test.db"
    engine = create_async_engine(f"sqlite+aiosqlite:///{database_path}")
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    app.state.auth_test_session_factory = session_factory

    async def override_get_session() -> AsyncIterator[AsyncSession]:
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_session] = override_get_session
    monkeypatch.setenv("AUTH_JWT_SECRET", TEST_JWT_SECRET)
    limiter.reset()
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as test_client:
        yield test_client
    app.dependency_overrides.pop(get_session, None)
    del app.state.auth_test_session_factory
    limiter.reset()
    await engine.dispose()


@pytest.mark.asyncio
async def test_register_creates_user_and_returns_tokens(client: AsyncClient) -> None:
    response = await client.post(
        "/auth/register",
        json={"email": " Patient@Example.com ", "password": "long-test-password"},
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["user"]["email"] == "patient@example.com"
    assert payload["token_type"] == "bearer"
    assert payload["expires_in"] == 900
    claims = jwt.decode(
        payload["access_token"],
        TEST_JWT_SECRET,
        algorithms=["HS256"],
        audience=JWT_AUDIENCE,
        issuer=JWT_ISSUER,
    )
    assert claims["sub"] == payload["user"]["id"]


@pytest.mark.asyncio
async def test_duplicate_registration_returns_conflict(client: AsyncClient) -> None:
    data = {"email": "patient@example.com", "password": "long-test-password"}

    assert (await client.post("/auth/register", json=data)).status_code == 201
    duplicate = await client.post("/auth/register", json=data)

    assert duplicate.status_code == 409
    assert duplicate.json()["detail"] == "An account with this email already exists."


@pytest.mark.asyncio
async def test_login_returns_generic_error_for_unknown_email(client: AsyncClient) -> None:
    response = await client.post(
        "/auth/login",
        json={"email": "unknown@example.com", "password": "long-test-password"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid or expired credentials."


@pytest.mark.asyncio
async def test_login_returns_tokens_for_valid_credentials(client: AsyncClient) -> None:
    data = {"email": "patient@example.com", "password": "long-test-password"}
    await client.post("/auth/register", json=data)

    response = await client.post("/auth/login", json=data)

    assert response.status_code == 200
    assert response.json()["user"]["email"] == data["email"]
    assert response.json()["refresh_token"]


@pytest.mark.asyncio
async def test_login_returns_generic_error_for_wrong_password(client: AsyncClient) -> None:
    await client.post(
        "/auth/register",
        json={"email": "patient@example.com", "password": "long-test-password"},
    )

    response = await client.post(
        "/auth/login",
        json={"email": "patient@example.com", "password": "another-wrong-password"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid or expired credentials."


@pytest.mark.asyncio
async def test_registration_validates_email_and_password(client: AsyncClient) -> None:
    response = await client.post(
        "/auth/register",
        json={"email": "not-an-email", "password": "short"},
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_refresh_rotates_token_and_reuse_revokes_family(client: AsyncClient) -> None:
    registered = await client.post(
        "/auth/register",
        json={"email": "patient@example.com", "password": "long-test-password"},
    )
    original_refresh = registered.json()["refresh_token"]

    rotated = await client.post("/auth/refresh", json={"refresh_token": original_refresh})

    assert rotated.status_code == 200
    rotated_refresh = rotated.json()["refresh_token"]
    assert rotated_refresh != original_refresh

    reused = await client.post("/auth/refresh", json={"refresh_token": original_refresh})
    assert reused.status_code == 401

    family_revoked = await client.post(
        "/auth/refresh",
        json={"refresh_token": rotated_refresh},
    )
    assert family_revoked.status_code == 401


@pytest.mark.asyncio
async def test_logout_revokes_refresh_session_idempotently(client: AsyncClient) -> None:
    registered = await client.post(
        "/auth/register",
        json={"email": "patient@example.com", "password": "long-test-password"},
    )
    refresh_token = registered.json()["refresh_token"]

    first_logout = await client.post("/auth/logout", json={"refresh_token": refresh_token})
    repeated_logout = await client.post("/auth/logout", json={"refresh_token": refresh_token})
    refresh = await client.post("/auth/refresh", json={"refresh_token": refresh_token})

    assert first_logout.status_code == 204
    assert repeated_logout.status_code == 204
    assert refresh.status_code == 401


@pytest.mark.asyncio
async def test_database_stores_refresh_token_hash_only(client: AsyncClient) -> None:
    registered = await client.post(
        "/auth/register",
        json={"email": "patient@example.com", "password": "long-test-password"},
    )
    raw_token = registered.json()["refresh_token"]

    session_factory = app.state.auth_test_session_factory
    async with session_factory() as session:
        record = await session.get(RefreshToken, hash_refresh_token(raw_token))
        user = await session.scalar(select(User).where(User.email == "patient@example.com"))

    assert record is not None
    assert record.token_hash != raw_token
    assert user is not None
    assert user.password_hash != "long-test-password"


@pytest.mark.asyncio
async def test_register_fails_explicitly_without_jwt_secret(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("AUTH_JWT_SECRET")
    response = await client.post(
        "/auth/register",
        json={"email": "patient@example.com", "password": "long-test-password"},
    )

    assert response.status_code == 503
    assert response.json()["detail"] == "Authentication service is not configured."


@pytest.mark.asyncio
async def test_registration_is_rate_limited(client: AsyncClient) -> None:
    responses = []
    for index in range(6):
        responses.append(
            await client.post(
                "/auth/register",
                json={
                    "email": f"patient{index}@example.com",
                    "password": "long-test-password",
                },
            )
        )

    assert [response.status_code for response in responses[:5]] == [201] * 5
    assert responses[5].status_code == 429
