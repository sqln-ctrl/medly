from datetime import UTC, date, datetime, time
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.db import Base
from app.models import (
    DoseEvent,
    Medication,
    MedicationSchedule,
    PatientProfile,
    ScheduleTime,
    User,
)


@pytest.mark.asyncio
async def test_patient_medication_schedule_and_dose_event_persist(tmp_path) -> None:
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'domain.db'}")
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    now = datetime.now(UTC)
    user_id = uuid4()
    medication_id = uuid4()
    schedule_id = uuid4()
    scheduled_for = datetime(2026, 10, 18, 8, tzinfo=UTC)
    instruction_text = "  Take with food; preserve this text exactly.  "

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    async with session_factory() as session:
        session.add_all(
            [
                User(
                    id=user_id,
                    email="patient@example.com",
                    password_hash="test-hash",
                    created_at=now,
                ),
                PatientProfile(
                    user_id=user_id,
                    timezone="America/New_York",
                    created_at=now,
                ),
                Medication(
                    id=medication_id,
                    patient_id=user_id,
                    name="Example medicine",
                    instruction_text=instruction_text,
                    created_at=now,
                ),
                MedicationSchedule(
                    id=schedule_id,
                    medication_id=medication_id,
                    patient_id=user_id,
                    cadence="weekly",
                    starts_on=date(2026, 10, 1),
                    confirmed_at=now,
                    enabled_at=now,
                    created_at=now,
                ),
                ScheduleTime(
                    schedule_id=schedule_id,
                    day_of_week=0,
                    local_time=time(8, 30),
                ),
                DoseEvent(
                    schedule_id=schedule_id,
                    medication_id=medication_id,
                    patient_id=user_id,
                    scheduled_for=scheduled_for,
                    status="taken",
                    reported_at=now,
                ),
            ]
        )
        await session.commit()

        medication = await session.scalar(
            select(Medication).where(Medication.id == medication_id)
        )
        event = await session.scalar(
            select(DoseEvent).where(DoseEvent.schedule_id == schedule_id)
        )

    await engine.dispose()

    assert medication is not None
    assert medication.instruction_text == instruction_text
    assert event is not None
    assert event.status == "taken"
    assert event.scheduled_for.replace(tzinfo=UTC) == scheduled_for


@pytest.mark.asyncio
async def test_interval_schedule_requires_a_positive_interval(tmp_path) -> None:
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'constraints.db'}")
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    now = datetime.now(UTC)
    user_id = uuid4()
    medication_id = uuid4()

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    async with session_factory() as session:
        session.add_all(
            [
                User(
                    id=user_id,
                    email="patient@example.com",
                    password_hash="test-hash",
                    created_at=now,
                ),
                PatientProfile(
                    user_id=user_id,
                    timezone="UTC",
                    created_at=now,
                ),
                Medication(
                    id=medication_id,
                    patient_id=user_id,
                    name="Example medicine",
                    instruction_text="As entered",
                    created_at=now,
                ),
            ]
        )
        await session.flush()
        session.add(
            MedicationSchedule(
                medication_id=medication_id,
                patient_id=user_id,
                cadence="interval",
                starts_on=date(2026, 10, 1),
                interval_days=0,
                created_at=now,
            )
        )
        with pytest.raises(IntegrityError):
            await session.commit()

    await engine.dispose()
