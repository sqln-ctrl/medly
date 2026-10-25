from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Medication, MedicationSchedule, ScheduleTime
from app.schedule_schemas import MedicationScheduleCreateRequest


async def create_medication_schedule(
    session: AsyncSession,
    *,
    patient_id: UUID,
    medication_id: UUID,
    payload: MedicationScheduleCreateRequest,
) -> MedicationSchedule | None:
    medication = await session.scalar(
        select(Medication).where(
            Medication.id == medication_id,
            Medication.patient_id == patient_id,
        )
    )
    if medication is None:
        return None

    schedule = MedicationSchedule(
        medication_id=medication_id,
        patient_id=patient_id,
        cadence=payload.cadence,
        starts_on=payload.starts_on,
        ends_on=payload.ends_on,
        interval_days=payload.interval_days,
        created_at=datetime.now(UTC),
    )
    session.add(schedule)
    await session.flush()
    session.add_all(
        [
            ScheduleTime(
                schedule_id=schedule.id,
                day_of_week=schedule_time.day_of_week,
                local_time=schedule_time.local_time,
                meal_timing=schedule_time.meal_timing,
            )
            for schedule_time in payload.times
        ]
    )
    await session.commit()
    return schedule


async def list_medication_schedules(
    session: AsyncSession,
    *,
    patient_id: UUID,
    medication_id: UUID,
) -> list[MedicationSchedule] | None:
    medication = await session.scalar(
        select(Medication.id).where(
            Medication.id == medication_id,
            Medication.patient_id == patient_id,
        )
    )
    if medication is None:
        return None
    result = await session.scalars(
        select(MedicationSchedule)
        .where(
            MedicationSchedule.medication_id == medication_id,
            MedicationSchedule.patient_id == patient_id,
        )
        .order_by(MedicationSchedule.created_at.desc())
    )
    return list(result.all())


async def get_schedule_times(
    session: AsyncSession,
    *,
    schedule_ids: list[UUID],
) -> dict[UUID, list[ScheduleTime]]:
    if not schedule_ids:
        return {}
    result = await session.scalars(
        select(ScheduleTime)
        .where(ScheduleTime.schedule_id.in_(schedule_ids))
        .order_by(ScheduleTime.day_of_week, ScheduleTime.local_time)
    )
    times_by_schedule: dict[UUID, list[ScheduleTime]] = {
        schedule_id: [] for schedule_id in schedule_ids
    }
    for schedule_time in result.all():
        times_by_schedule[schedule_time.schedule_id].append(schedule_time)
    return times_by_schedule


async def confirm_medication_schedule(
    session: AsyncSession,
    *,
    patient_id: UUID,
    schedule_id: UUID,
) -> MedicationSchedule | None:
    schedule = await session.scalar(
        select(MedicationSchedule).where(
            MedicationSchedule.id == schedule_id,
            MedicationSchedule.patient_id == patient_id,
        )
    )
    if schedule is None:
        return None

    if schedule.confirmed_at is None:
        confirmed_at = datetime.now(UTC)
        schedule.confirmed_at = confirmed_at
        schedule.enabled_at = confirmed_at
        await session.commit()
    return schedule
