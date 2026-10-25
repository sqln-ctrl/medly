from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Medication, MedicationSchedule, PatientProfile


async def get_or_create_patient_profile(
    session: AsyncSession,
    *,
    user_id,
    timezone: str = "UTC",
) -> PatientProfile:
    profile = await session.get(PatientProfile, user_id)
    if profile is None:
        profile = PatientProfile(
            user_id=user_id,
            timezone=timezone,
            created_at=datetime.now(UTC),
        )
        session.add(profile)
        await session.flush()
    return profile


async def list_medications_for_patient(
    session: AsyncSession,
    *,
    patient_id,
) -> list[Medication]:
    result = await session.execute(
        select(Medication)
        .where(
            Medication.patient_id == patient_id,
            Medication.archived_at.is_(None),
        )
        .order_by(Medication.created_at.desc())
    )
    return list(result.scalars().all())


async def archive_medication(
    session: AsyncSession,
    *,
    patient_id: UUID,
    medication_id: UUID,
) -> bool:
    medication = await session.scalar(
        select(Medication).where(
            Medication.id == medication_id,
            Medication.patient_id == patient_id,
            Medication.archived_at.is_(None),
        )
    )
    if medication is None:
        return False

    archived_at = datetime.now(UTC)
    medication.archived_at = archived_at
    schedules = await session.scalars(
        select(MedicationSchedule).where(
            MedicationSchedule.medication_id == medication_id,
            MedicationSchedule.patient_id == patient_id,
            MedicationSchedule.archived_at.is_(None),
        )
    )
    for schedule in schedules:
        schedule.archived_at = archived_at
    await session.commit()
    return True
