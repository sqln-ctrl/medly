from datetime import UTC, date, datetime, timedelta
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dose_schemas import (
    DoseAdherenceResponse,
    DoseHistoryResponse,
    DoseReportRequest,
    DoseReportResponse,
    MedicationAdherenceSummary,
    UpcomingDoseResponse,
    UpcomingDosesResponse,
)
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
            MedicationSchedule.archived_at.is_(None),
            MedicationSchedule.confirmed_at.is_not(None),
            MedicationSchedule.enabled_at.is_not(None),
            Medication.archived_at.is_(None),
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


async def report_dose(
    session: AsyncSession,
    *,
    patient_id: UUID,
    payload: DoseReportRequest,
) -> DoseReportResponse | None:
    result = await session.execute(
        select(MedicationSchedule, Medication)
        .join(
            Medication,
            (Medication.id == MedicationSchedule.medication_id)
            & (Medication.patient_id == MedicationSchedule.patient_id),
        )
        .where(
            MedicationSchedule.id == payload.schedule_id,
            MedicationSchedule.patient_id == patient_id,
            MedicationSchedule.archived_at.is_(None),
            MedicationSchedule.confirmed_at.is_not(None),
            MedicationSchedule.enabled_at.is_not(None),
            Medication.archived_at.is_(None),
        )
    )
    schedule_medication = result.one_or_none()
    if schedule_medication is None:
        return None
    schedule, medication = schedule_medication
    profile = await session.get(PatientProfile, patient_id)
    timezone = ZoneInfo(profile.timezone if profile else "UTC")
    local_datetime = payload.scheduled_for.astimezone(timezone)
    schedule_times = await get_schedule_times(session, schedule_ids=[schedule.id])
    occurrences = schedule_occurrences(
        schedule,
        schedule_times[schedule.id],
        timezone=timezone,
        start_date=local_datetime.date(),
        end_date=local_datetime.date(),
    )
    scheduled_for = payload.scheduled_for.astimezone(UTC)
    if not any(occurrence.astimezone(UTC) == scheduled_for for occurrence in occurrences):
        return None

    now = datetime.now(UTC)
    if scheduled_for > now:
        raise ValueError("A dose report can only be added after its scheduled time.")

    event = await session.scalar(
        select(DoseEvent).where(
            DoseEvent.schedule_id == schedule.id,
            DoseEvent.scheduled_for == scheduled_for,
        )
    )
    if event is None:
        event = DoseEvent(
            schedule_id=schedule.id,
            medication_id=medication.id,
            patient_id=patient_id,
            scheduled_for=scheduled_for,
            status=payload.status,
            reported_at=now,
        )
        session.add(event)
    else:
        event.status = payload.status
        event.reported_at = now
    await session.commit()
    await session.refresh(event)
    return DoseReportResponse(
        id=event.id,
        schedule_id=event.schedule_id,
        medication_id=medication.id,
        medication_name=medication.name,
        scheduled_for=scheduled_for,
        status=event.status,
        reported_at=now,
    )


async def get_dose_history(
    session: AsyncSession,
    *,
    patient_id: UUID,
    start_date: date | None = None,
    end_date: date | None = None,
    today: date | None = None,
) -> DoseHistoryResponse:
    profile = await session.get(PatientProfile, patient_id)
    timezone_name = profile.timezone if profile else "UTC"
    timezone = ZoneInfo(timezone_name)
    local_today = today or datetime.now(timezone).date()
    effective_end = end_date or local_today
    effective_start = start_date or effective_end - timedelta(days=29)
    if effective_start > effective_end:
        raise ValueError("start_date must be on or before end_date.")
    if (effective_end - effective_start).days > 365:
        raise ValueError("History date range cannot exceed 366 days.")

    start_instant = datetime.combine(effective_start, datetime.min.time(), tzinfo=timezone)
    end_instant = datetime.combine(
        effective_end + timedelta(days=1),
        datetime.min.time(),
        tzinfo=timezone,
    )
    result = await session.execute(
        select(DoseEvent, Medication)
        .join(
            Medication,
            (Medication.id == DoseEvent.medication_id)
            & (Medication.patient_id == DoseEvent.patient_id),
        )
        .where(
            DoseEvent.patient_id == patient_id,
            DoseEvent.scheduled_for >= start_instant.astimezone(UTC),
            DoseEvent.scheduled_for < end_instant.astimezone(UTC),
        )
        .order_by(DoseEvent.scheduled_for.desc())
    )
    events = [
        DoseReportResponse(
            id=event.id,
            schedule_id=event.schedule_id,
            medication_id=medication.id,
            medication_name=medication.name,
            scheduled_for=_as_utc(event.scheduled_for),
            status=event.status,
            reported_at=_as_utc(event.reported_at),
        )
        for event, medication in result.all()
    ]
    return DoseHistoryResponse(
        timezone=timezone_name,
        start_date=effective_start,
        end_date=effective_end,
        events=events,
    )


def summarize_dose_history(history: DoseHistoryResponse) -> DoseAdherenceResponse:
    grouped: dict[UUID, dict[str, int | str]] = {}
    counts = {"taken": 0, "skipped": 0, "missed": 0}
    for event in history.events:
        counts[event.status] += 1
        medication = grouped.setdefault(
            event.medication_id,
            {
                "medication_name": event.medication_name,
                "taken": 0,
                "skipped": 0,
                "missed": 0,
            },
        )
        medication[event.status] = int(medication[event.status]) + 1

    total_reported = sum(counts.values())
    medication_summaries = []
    for medication_id, medication in grouped.items():
        medication_total = sum(
            int(medication[status]) for status in ("taken", "skipped", "missed")
        )
        medication_summaries.append(
            MedicationAdherenceSummary(
                medication_id=medication_id,
                medication_name=str(medication["medication_name"]),
                taken=int(medication["taken"]),
                skipped=int(medication["skipped"]),
                missed=int(medication["missed"]),
                total_reported=medication_total,
                reported_taken_percentage=(
                    round(int(medication["taken"]) * 100 / medication_total, 1)
                    if medication_total
                    else None
                ),
            )
        )
    medication_summaries.sort(key=lambda item: item.medication_name.casefold())

    return DoseAdherenceResponse(
        timezone=history.timezone,
        start_date=history.start_date,
        end_date=history.end_date,
        total_reported=total_reported,
        taken=counts["taken"],
        skipped=counts["skipped"],
        missed=counts["missed"],
        reported_taken_percentage=(
            round(counts["taken"] * 100 / total_reported, 1)
            if total_reported
            else None
        ),
        medications=medication_summaries,
    )


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)
