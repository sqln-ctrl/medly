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
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'schedules.db'}")
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

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
    limiter.reset()
    await engine.dispose()


async def register_user(
    client: AsyncClient,
    *,
    email: str = "patient@example.com",
) -> str:
    response = await client.post(
        "/auth/register",
        json={"email": email, "password": "long-test-password"},
    )
    assert response.status_code == 201
    return response.json()["access_token"]


async def create_medication(client: AsyncClient, token: str) -> str:
    response = await client.post(
        "/medications",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "name": "Vitamin D",
            "instruction_text": "Take after breakfast every morning.",
        },
    )
    assert response.status_code == 201
    return response.json()["id"]


@pytest.mark.asyncio
async def test_schedule_requires_confirmation_before_enablement(client: AsyncClient) -> None:
    token = await register_user(client)
    medication_id = await create_medication(client, token)
    headers = {"Authorization": f"Bearer {token}"}
    payload = {
        "cadence": "daily",
        "starts_on": "2026-10-23",
        "times": [{"day_of_week": -1, "local_time": "08:30:00"}],
    }

    created = await client.post(
        f"/medications/{medication_id}/schedules",
        headers=headers,
        json=payload,
    )

    assert created.status_code == 201
    schedule = created.json()
    assert schedule["confirmed_at"] is None
    assert schedule["enabled_at"] is None
    assert schedule["times"] == [{"day_of_week": -1, "local_time": "08:30:00"}]

    confirmed = await client.post(
        f"/schedules/{schedule['id']}/confirm",
        headers=headers,
    )

    assert confirmed.status_code == 200
    assert confirmed.json()["confirmed_at"] is not None
    assert confirmed.json()["enabled_at"] is not None

    listed = await client.get(
        f"/medications/{medication_id}/schedules",
        headers=headers,
    )
    assert listed.status_code == 200
    assert listed.json()[0]["id"] == schedule["id"]
    assert listed.json()[0]["enabled_at"] is not None


@pytest.mark.asyncio
async def test_schedule_routes_enforce_patient_ownership(client: AsyncClient) -> None:
    first_token = await register_user(client)
    second_token = await register_user(client, email="second@example.com")
    medication_id = await create_medication(client, first_token)
    schedule_response = await client.post(
        f"/medications/{medication_id}/schedules",
        headers={"Authorization": f"Bearer {first_token}"},
        json={
            "cadence": "weekly",
            "starts_on": "2026-10-23",
            "times": [{"day_of_week": 4, "local_time": "09:00:00"}],
        },
    )
    schedule_id = schedule_response.json()["id"]
    second_headers = {"Authorization": f"Bearer {second_token}"}

    list_response = await client.get(
        f"/medications/{medication_id}/schedules",
        headers=second_headers,
    )
    confirm_response = await client.post(
        f"/schedules/{schedule_id}/confirm",
        headers=second_headers,
    )

    assert schedule_response.status_code == 201
    assert list_response.status_code == 404
    assert confirm_response.status_code == 404


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "payload",
    [
        {
            "cadence": "interval",
            "starts_on": "2026-10-23",
            "times": [{"day_of_week": -1, "local_time": "08:30:00"}],
        },
        {
            "cadence": "weekly",
            "starts_on": "2026-10-23",
            "times": [{"day_of_week": -1, "local_time": "08:30:00"}],
        },
        {
            "cadence": "daily",
            "starts_on": "2026-10-23",
            "ends_on": "2026-10-22",
            "times": [{"day_of_week": -1, "local_time": "08:30:00"}],
        },
        {
            "cadence": "daily",
            "starts_on": "2026-10-23",
            "times": [{"day_of_week": -1, "local_time": "08:30:00+02:00"}],
        },
    ],
)
async def test_schedule_rejects_invalid_recurrence_inputs(
    client: AsyncClient,
    payload: dict[str, object],
) -> None:
    token = await register_user(client)
    medication_id = await create_medication(client, token)

    response = await client.post(
        f"/medications/{medication_id}/schedules",
        headers={"Authorization": f"Bearer {token}"},
        json=payload,
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_schedule_routes_require_authentication(client: AsyncClient) -> None:
    response = await client.post(
        "/schedules/00000000-0000-0000-0000-000000000000/confirm",
    )
    assert response.status_code == 401
