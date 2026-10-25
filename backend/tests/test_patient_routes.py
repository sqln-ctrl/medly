from collections.abc import AsyncIterator
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.db import Base, get_session
from app.main import app
from app.models import DoseEvent, Medication, MedicationSchedule
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
async def test_archiving_medication_hides_it_and_its_schedules_without_deleting_them(
    client,
) -> None:
    token = await register_user(client)
    headers = {"Authorization": f"Bearer {token}"}
    medication_response = await client.post(
        "/medications",
        headers=headers,
        json={"name": "Vitamin D", "instruction_text": "As provided."},
    )
    medication_id = medication_response.json()["id"]
    schedule_response = await client.post(
        f"/medications/{medication_id}/schedules",
        headers=headers,
        json={
            "cadence": "daily",
            "starts_on": "2026-10-23",
            "times": [{"day_of_week": -1, "local_time": "08:00:00"}],
        },
    )
    schedule_id = schedule_response.json()["id"]
    confirmed = await client.post(
        f"/schedules/{schedule_id}/confirm",
        headers=headers,
    )
    assert confirmed.status_code == 200
    reported_at = datetime.now(UTC)
    async with app.state.auth_test_session_factory() as session:
        session.add(
            DoseEvent(
                schedule_id=UUID(schedule_id),
                medication_id=UUID(medication_id),
                patient_id=UUID(medication_response.json()["patient_id"]),
                scheduled_for=reported_at,
                status="taken",
                reported_at=reported_at,
            )
        )
        await session.commit()

    archived = await client.delete(f"/medications/{medication_id}", headers=headers)
    medications = await client.get("/medications", headers=headers)
    schedules = await client.get(
        f"/medications/{medication_id}/schedules",
        headers=headers,
    )
    history = await client.get("/doses/history", headers=headers)

    assert archived.status_code == 204
    assert medications.json() == []
    assert schedules.status_code == 404
    assert len(history.json()["events"]) == 1
    async with app.state.auth_test_session_factory() as session:
        medication = await session.scalar(
            select(Medication).where(Medication.id == UUID(medication_id))
        )
        schedule = await session.scalar(
            select(MedicationSchedule).where(
                MedicationSchedule.id == UUID(schedule_id)
            )
        )
        assert medication is not None and medication.archived_at is not None
        assert schedule is not None and schedule.archived_at is not None


@pytest.mark.asyncio
async def test_medication_archive_enforces_ownership_and_is_not_repeatable(client) -> None:
    token = await register_user(client)
    other_token = await register_user(client, email="other@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    medication_response = await client.post(
        "/medications",
        headers=headers,
        json={"name": "Vitamin D", "instruction_text": "As provided."},
    )
    medication_id = medication_response.json()["id"]

    other_archive = await client.delete(
        f"/medications/{medication_id}",
        headers={"Authorization": f"Bearer {other_token}"},
    )
    archived = await client.delete(f"/medications/{medication_id}", headers=headers)
    repeated_archive = await client.delete(
        f"/medications/{medication_id}",
        headers=headers,
    )

    assert other_archive.status_code == 404
    assert archived.status_code == 204
    assert repeated_archive.status_code == 404


@pytest.mark.asyncio
async def test_patient_routes_require_authentication(client) -> None:
    response = await client.get("/patients/me")
    medication_response = await client.get("/medications")

    assert response.status_code == 401
    assert medication_response.status_code == 401
