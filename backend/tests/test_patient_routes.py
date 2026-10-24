from collections.abc import AsyncIterator
from pathlib import Path

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.db import Base, get_session
from app.main import app
from app.rate_limit import limiter


@pytest_asyncio.fixture
async def client(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> AsyncIterator[AsyncClient]:
    database_path = tmp_path / "patient-test.db"
    engine = create_async_engine(f"sqlite+aiosqlite:///{database_path}")
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    app.state.auth_test_session_factory = session_factory

    async def override_get_session() -> AsyncIterator[AsyncSession]:
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_session] = override_get_session
    monkeypatch.setenv("AUTH_JWT_SECRET", "test-only-secret-for-medly-auth-tests-32-bytes")
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


async def register_user(client, *, email: str = "patient@example.com", password: str = "long-test-password") -> str:
    response = await client.post(
        "/auth/register",
        json={"email": email, "password": password},
    )
    assert response.status_code == 201
    return response.json()["access_token"]


@pytest.mark.asyncio
async def test_patient_profile_defaults_to_utc(client) -> None:
    token = await register_user(client)

    response = await client.get(
        "/patients/me",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["timezone"] == "UTC"
    assert payload["user_id"]


@pytest.mark.asyncio
async def test_patient_profile_update_validates_timezone(client) -> None:
    token = await register_user(client)

    invalid = await client.put(
        "/patients/me",
        headers={"Authorization": f"Bearer {token}"},
        json={"timezone": "Mars/Phobos"},
    )
    valid = await client.put(
        "/patients/me",
        headers={"Authorization": f"Bearer {token}"},
        json={"timezone": "America/New_York"},
    )

    assert invalid.status_code == 422
    assert valid.status_code == 200
    assert valid.json()["timezone"] == "America/New_York"


@pytest.mark.asyncio
async def test_medication_creation_is_scoped_to_current_patient(client) -> None:
    patient_token = await register_user(client)
    second_token = await register_user(client, email="second@example.com")

    create_response = await client.post(
        "/medications",
        headers={"Authorization": f"Bearer {patient_token}"},
        json={
            "name": "Vitamin D",
            "instruction_text": "  Take after breakfast every morning.  ",
        },
    )
    list_response = await client.get(
        "/medications",
        headers={"Authorization": f"Bearer {patient_token}"},
    )
    second_list = await client.get(
        "/medications",
        headers={"Authorization": f"Bearer {second_token}"},
    )

    assert create_response.status_code == 201
    assert create_response.json()["name"] == "Vitamin D"
    assert create_response.json()["instruction_text"] == "  Take after breakfast every morning.  "
    assert list_response.status_code == 200
    assert len(list_response.json()) == 1
    assert list_response.json()[0]["instruction_text"] == "  Take after breakfast every morning.  "
    assert second_list.status_code == 200
    assert second_list.json() == []


@pytest.mark.asyncio
async def test_patient_routes_require_authentication(client) -> None:
    response = await client.get("/patients/me")
    medication_response = await client.get("/medications")

    assert response.status_code == 401
    assert medication_response.status_code == 401
