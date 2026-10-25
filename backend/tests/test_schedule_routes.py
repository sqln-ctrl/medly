from datetime import UTC, date, datetime, time
from collections.abc import AsyncIterator
from pathlib import Path
from uuid import UUID
from zoneinfo import ZoneInfo

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.db import Base, get_session
from app.main import app
from app.models import DoseEvent, Medication, MedicationSchedule, ScheduleTime
from app.rate_limit import limiter
from app.schedule_domain import schedule_occurrences


@pytest_asyncio.fixture
async def client(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> AsyncIterator[AsyncClient]:
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'schedules.db'}")
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
    assert schedule["times"] == [
        {"day_of_week": -1, "local_time": "08:30:00", "meal_timing": None}
    ]

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
async def test_archiving_schedule_removes_it_from_active_schedules(client: AsyncClient) -> None:
    token = await register_user(client)
    medication_id = await create_medication(client, token)
    headers = {"Authorization": f"Bearer {token}"}
    created = await client.post(
        f"/medications/{medication_id}/schedules",
        headers=headers,
        json={
            "cadence": "daily",
            "starts_on": "2026-10-23",
            "times": [{"day_of_week": -1, "local_time": "08:00:00"}],
        },
    )
    schedule_id = created.json()["id"]

    archived = await client.delete(f"/schedules/{schedule_id}", headers=headers)
    listed = await client.get(
        f"/medications/{medication_id}/schedules",
        headers=headers,
    )
    confirmed = await client.post(
        f"/schedules/{schedule_id}/confirm",
        headers=headers,
    )
    other_token = await register_user(client, email="other@example.com")
    other_archive = await client.delete(
        f"/schedules/{schedule_id}",
        headers={"Authorization": f"Bearer {other_token}"},
    )

    assert archived.status_code == 204
    assert listed.status_code == 200
    assert listed.json() == []
    assert confirmed.status_code == 404
    assert other_archive.status_code == 404


@pytest.mark.asyncio
async def test_schedule_persists_end_date_and_meal_timing(client: AsyncClient) -> None:
    token = await register_user(client)
    medication_id = await create_medication(client, token)
    headers = {"Authorization": f"Bearer {token}"}

    response = await client.post(
        f"/medications/{medication_id}/schedules",
        headers=headers,
        json={
            "cadence": "daily",
            "starts_on": "2026-10-23",
            "ends_on": "2026-11-30",
            "times": [
                {
                    "day_of_week": -1,
                    "local_time": "08:30:00",
                    "meal_timing": "before_breakfast",
                },
                {
                    "day_of_week": -1,
                    "local_time": "12:30:00",
                    "meal_timing": "after_lunch",
                },
                {"day_of_week": -1, "local_time": "18:30:00"},
            ],
        },
    )

    assert response.status_code == 201
    schedule = response.json()
    assert schedule["ends_on"] == "2026-11-30"
    assert [item["meal_timing"] for item in schedule["times"]] == [
        "before_breakfast",
        "after_lunch",
        None,
    ]


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
        {
            "cadence": "daily",
            "starts_on": "2026-10-23",
            "times": [
                {"day_of_week": -1, "local_time": "08:00:00"},
                {"day_of_week": -1, "local_time": "12:00:00"},
                {"day_of_week": -1, "local_time": "16:00:00"},
                {"day_of_week": -1, "local_time": "20:00:00"},
            ],
        },
        {
            "cadence": "daily",
            "starts_on": "2026-10-23",
            "times": [
                {
                    "day_of_week": -1,
                    "local_time": "08:00:00",
                    "meal_timing": "with_breakfast",
                }
            ],
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


def test_schedule_occurrences_follow_weekly_and_interval_rules() -> None:
    weekly = MedicationSchedule(
        cadence="weekly",
        starts_on=date(2026, 10, 26),
        ends_on=None,
        interval_days=None,
    )
    weekly_occurrences = schedule_occurrences(
        weekly,
        [ScheduleTime(day_of_week=0, local_time=time(8, 30))],
        timezone=ZoneInfo("America/New_York"),
        start_date=date(2026, 10, 26),
        end_date=date(2026, 11, 2),
    )
    assert [occurrence.date() for occurrence in weekly_occurrences] == [
        date(2026, 10, 26),
        date(2026, 11, 2),
    ]
    assert weekly_occurrences[0].utcoffset().total_seconds() == -4 * 60 * 60
    assert weekly_occurrences[1].utcoffset().total_seconds() == -5 * 60 * 60

    interval = MedicationSchedule(
        cadence="interval",
        starts_on=date(2026, 10, 26),
        ends_on=None,
        interval_days=3,
    )
    interval_occurrences = schedule_occurrences(
        interval,
        [ScheduleTime(day_of_week=-1, local_time=time(9))],
        timezone=ZoneInfo("UTC"),
        start_date=date(2026, 10, 26),
        end_date=date(2026, 11, 2),
    )
    assert [occurrence.date() for occurrence in interval_occurrences] == [
        date(2026, 10, 26),
        date(2026, 10, 29),
        date(2026, 11, 1),
    ]


def test_schedule_end_date_is_inclusive() -> None:
    schedule = MedicationSchedule(
        cadence="daily",
        starts_on=date(2026, 10, 26),
        ends_on=date(2026, 10, 27),
        interval_days=None,
    )
    occurrences = schedule_occurrences(
        schedule,
        [ScheduleTime(day_of_week=-1, local_time=time(8))],
        timezone=ZoneInfo("UTC"),
        start_date=date(2026, 10, 26),
        end_date=date(2026, 10, 29),
    )

    assert [occurrence.date() for occurrence in occurrences] == [
        date(2026, 10, 26),
        date(2026, 10, 27),
    ]


def test_schedule_occurrences_shift_nonexistent_dst_wall_times_forward() -> None:
    schedule = MedicationSchedule(
        cadence="daily",
        starts_on=date(2026, 3, 7),
        ends_on=None,
        interval_days=None,
    )

    occurrences = schedule_occurrences(
        schedule,
        [ScheduleTime(day_of_week=-1, local_time=time(2, 30))],
        timezone=ZoneInfo("America/New_York"),
        start_date=date(2026, 3, 7),
        end_date=date(2026, 3, 9),
    )

    assert [occurrence.date() for occurrence in occurrences] == [
        date(2026, 3, 7),
        date(2026, 3, 8),
        date(2026, 3, 9),
    ]
    assert occurrences[1].time() == time(3, 30)


@pytest.mark.asyncio
async def test_upcoming_doses_only_include_confirmed_owned_schedules(
    client: AsyncClient,
) -> None:
    token = await register_user(client)
    other_token = await register_user(client, email="other@example.com")
    medication_id = UUID(await create_medication(client, token))
    today = datetime.now(UTC).date()
    create_response = await client.post(
        f"/medications/{medication_id}/schedules",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "cadence": "daily",
            "starts_on": today.isoformat(),
            "times": [{"day_of_week": -1, "local_time": "08:00:00"}],
        },
    )
    schedule_id = UUID(create_response.json()["id"])
    headers = {"Authorization": f"Bearer {token}"}

    pending_response = await client.get("/doses/upcoming?days=2", headers=headers)
    assert pending_response.status_code == 200
    assert pending_response.json()["doses"] == []

    await client.post(f"/schedules/{schedule_id}/confirm", headers=headers)
    async with app.state.auth_test_session_factory() as session:
        schedule = await session.get(MedicationSchedule, schedule_id)
        assert schedule is not None
        patient_id = await session.scalar(
            select(Medication.patient_id).where(Medication.id == medication_id)
        )
        assert patient_id is not None
        session.add(
            DoseEvent(
                schedule_id=schedule_id,
                medication_id=medication_id,
                patient_id=patient_id,
                scheduled_for=datetime.combine(today, time(8), tzinfo=UTC),
                status="taken",
                reported_at=datetime.now(UTC),
            )
        )
        await session.commit()

    response = await client.get("/doses/upcoming?days=2", headers=headers)
    other_response = await client.get(
        "/doses/upcoming?days=2",
        headers={"Authorization": f"Bearer {other_token}"},
    )

    assert response.status_code == 200
    assert other_response.status_code == 200
    assert other_response.json()["doses"] == []
    result = response.json()
    assert result["timezone"] == "UTC"
    assert result["start_date"] == today.isoformat()
    assert [dose["medication_name"] for dose in result["doses"]] == [
        "Vitamin D",
        "Vitamin D",
        "Vitamin D",
    ]
    assert result["doses"][0]["status"] == "taken"
