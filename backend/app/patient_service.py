from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Medication, PatientProfile


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
        .where(Medication.patient_id == patient_id)
        .order_by(Medication.created_at.desc())
    )
    return list(result.scalars().all())
