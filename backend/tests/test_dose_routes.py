from collections.abc import AsyncIterator
from datetime import UTC, date, datetime, time
from pathlib import Path

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.db import Base, get_session
from app.main import app
from app.models import DoseEvent
from app.rate_limit import limiter


@pytest_asyncio.fixture
async def client(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> AsyncIterator[AsyncClient]:
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'dose-events.db'}")
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


async def register_user(client: AsyncClient, email: str) -> str:
    response = await client.post(
        "/auth/register",
        json={"email": email, "password": "long-test-password"},
    )
    assert response.status_code == 201
    return response.json()["access_token"]


async def create_confirmed_schedule(client: AsyncClient, token: str) -> str:
    headers = {"Authorization": f"Bearer {token}"}
    medication_response = await client.post(
        "/medications",
        headers=headers,
        json={"name": "Vitamin D", "instruction_text": "As provided."},
    )
    assert medication_response.status_code == 201
    medication_id = medication_response.json()["id"]
    schedule_response = await client.post(
        f"/medications/{medication_id}/schedules",
        headers=headers,
        json={
            "cadence": "daily",
            "starts_on": "2025-10-26",
            "times": [{"day_of_week": -1, "local_time": "08:00:00"}],
        },
    )
    assert schedule_response.status_code == 201
    schedule_id = schedule_response.json()["id"]
    confirm_response = await client.post(
        f"/schedules/{schedule_id}/confirm",
        headers=headers,
    )
    assert confirm_response.status_code == 200
    return schedule_id


@pytest.mark.asyncio
async def test_dose_report_is_user_scoped_and_can_be_updated(client: AsyncClient) -> None:
    token = await register_user(client, "patient@example.com")
    other_token = await register_user(client, "other@example.com")
    schedule_id = await create_confirmed_schedule(client, token)
    payload = {
        "schedule_id": schedule_id,
        "scheduled_for": "2025-10-26T08:00:00+00:00",
        "status": "taken",
    }

    created = await client.post(
        "/doses/report",
        headers={"Authorization": f"Bearer {token}"},
        json=payload,
    )
    other_report = await client.post(
        "/doses/report",
        headers={"Authorization": f"Bearer {other_token}"},
        json={**payload, "status": "skipped"},
    )
    updated = await client.post(
        "/doses/report",
        headers={"Authorization": f"Bearer {token}"},
        json={**payload, "status": "skipped"},
    )

    assert created.status_code == 200
    assert created.json()["status"] == "taken"
    assert created.json()["medication_name"] == "Vitamin D"
    assert created.json()["scheduled_for"].endswith(("Z", "+00:00"))
    assert other_report.status_code == 404
    assert updated.status_code == 200
    assert updated.json()["id"] == created.json()["id"]
    assert updated.json()["status"] == "skipped"
    async with app.state.auth_test_session_factory() as session:
        count = await session.scalar(select(func.count()).select_from(DoseEvent))
    assert count == 1


@pytest.mark.asyncio
async def test_dose_report_only_accepts_a_real_scheduled_occurrence(
    client: AsyncClient,
) -> None:
    token = await register_user(client, "patient@example.com")
    schedule_id = await create_confirmed_schedule(client, token)
    headers = {"Authorization": f"Bearer {token}"}

    nonexistent = await client.post(
        "/doses/report",
        headers=headers,
        json={
            "schedule_id": schedule_id,
            "scheduled_for": "2025-10-26T09:00:00Z",
            "status": "taken",
        },
    )
    naive = await client.post(
        "/doses/report",
        headers=headers,
        json={
            "schedule_id": schedule_id,
            "scheduled_for": "2025-10-26T08:00:00",
            "status": "taken",
        },
    )

    assert nonexistent.status_code == 404
    assert naive.status_code == 422
    future = await client.post(
        "/doses/report",
        headers=headers,
        json={
            "schedule_id": schedule_id,
            "scheduled_for": "2027-10-26T08:00:00Z",
            "status": "taken",
        },
    )
    assert future.status_code == 422


@pytest.mark.asyncio
async def test_dose_history_returns_only_requested_patients_events(
    client: AsyncClient,
) -> None:
    token = await register_user(client, "patient@example.com")
    other_token = await register_user(client, "other@example.com")
    schedule_id = await create_confirmed_schedule(client, token)
    headers = {"Authorization": f"Bearer {token}"}
    await client.post(
        "/doses/report",
        headers=headers,
        json={
            "schedule_id": schedule_id,
            "scheduled_for": "2025-10-26T08:00:00Z",
            "status": "missed",
        },
    )

    history = await client.get(
        "/doses/history?start_date=2025-10-25&end_date=2025-10-27",
        headers=headers,
    )
    other_history = await client.get(
        "/doses/history?start_date=2025-10-25&end_date=2025-10-27",
        headers={"Authorization": f"Bearer {other_token}"},
    )
    invalid_range = await client.get(
        "/doses/history?start_date=2025-10-28&end_date=2025-10-27",
        headers=headers,
    )
    too_large = await client.get(
        "/doses/history?start_date=2024-10-25&end_date=2025-10-27",
        headers=headers,
    )

    assert history.status_code == 200
    assert history.json()["timezone"] == "UTC"
    assert history.json()["start_date"] == "2025-10-25"
    assert history.json()["end_date"] == "2025-10-27"
    assert len(history.json()["events"]) == 1
    assert history.json()["events"][0]["status"] == "missed"
    assert other_history.status_code == 200
    assert other_history.json()["events"] == []
    assert invalid_range.status_code == 422
    assert too_large.status_code == 422


@pytest.mark.asyncio
async def test_dose_routes_require_authentication(client: AsyncClient) -> None:
    report = await client.post(
        "/doses/report",
        json={
            "schedule_id": "00000000-0000-0000-0000-000000000000",
            "scheduled_for": datetime.combine(
                date(2025, 10, 26), time(8), tzinfo=UTC
            ).isoformat(),
            "status": "taken",
        },
    )
    history = await client.get("/doses/history")

    assert report.status_code == 401
    assert history.status_code == 401
