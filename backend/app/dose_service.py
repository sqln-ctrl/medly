from datetime import UTC, date, datetime, timedelta
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dose_schemas import UpcomingDoseResponse, UpcomingDosesResponse
from app.models import (
    DoseEvent,
    Medication,
    MedicationSchedule,
    PatientProfile,
    ScheduleTime,
)
from app.schedule_domain import schedule_occurrences
from app.schedule_service import get_schedule_times


async def get_upcoming_doses(
    session: AsyncSession,
    *,
    patient_id: UUID,
    today: date | None = None,
    days: int = 7,
) -> UpcomingDosesResponse:
    profile = await session.get(PatientProfile, patient_id)
    timezone_name = profile.timezone if profile else "UTC"
    timezone = ZoneInfo(timezone_name)
    start_date = today or datetime.now(timezone).date()
    end_date = start_date + timedelta(days=days)

    result = await session.execute(
        select(MedicationSchedule, Medication)
        .join(
            Medication,
            (Medication.id == MedicationSchedule.medication_id)
            & (Medication.patient_id == MedicationSchedule.patient_id),
        )
        .where(
            MedicationSchedule.patient_id == patient_id,
            MedicationSchedule.confirmed_at.is_not(None),
            MedicationSchedule.enabled_at.is_not(None),
            MedicationSchedule.starts_on <= end_date,
        )
        .order_by(MedicationSchedule.created_at)
    )
    schedule_medications = result.all()
    schedule_ids = [schedule.id for schedule, _ in schedule_medications]
    times_by_schedule = await get_schedule_times(session, schedule_ids=schedule_ids)

    candidates: list[tuple[datetime, MedicationSchedule, Medication]] = []
    for schedule, medication in schedule_medications:
        for occurrence in schedule_occurrences(
            schedule,
            times_by_schedule[schedule.id],
            timezone=timezone,
            start_date=start_date,
            end_date=end_date,
        ):
            candidates.append((occurrence, schedule, medication))

    candidates.sort(key=lambda candidate: candidate[0].astimezone(UTC))
    if not candidates:
        return UpcomingDosesResponse(
            timezone=timezone_name,
            start_date=start_date,
            end_date=end_date,
            doses=[],
        )

    scheduled_instants = [occurrence.astimezone(UTC) for occurrence, _, _ in candidates]
    event_result = await session.scalars(
        select(DoseEvent).where(
            DoseEvent.patient_id == patient_id,
            DoseEvent.scheduled_for >= scheduled_instants[0],
            DoseEvent.scheduled_for <= scheduled_instants[-1],
            DoseEvent.schedule_id.in_(schedule_ids),
        )
    )
    events = {
        (event.schedule_id, _as_utc(event.scheduled_for)): event.status
        for event in event_result.all()
    }

    doses = [
        UpcomingDoseResponse(
            schedule_id=schedule.id,
            medication_id=medication.id,
            medication_name=medication.name,
            scheduled_for=occurrence,
            status=events.get((schedule.id, occurrence.astimezone(UTC))),
        )
        for occurrence, schedule, medication in candidates
    ]
    return UpcomingDosesResponse(
        timezone=timezone_name,
        start_date=start_date,
        end_date=end_date,
        doses=doses,
    )


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)
