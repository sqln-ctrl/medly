from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from app.models import MedicationSchedule, ScheduleTime


def _scheduled_datetime(local_date: date, local_time: time, timezone: ZoneInfo) -> datetime | None:
    wall_time = datetime.combine(local_date, local_time)
    candidate = wall_time.replace(tzinfo=timezone, fold=0)
    utc_candidate = candidate.astimezone(UTC)
    if utc_candidate.astimezone(timezone).replace(tzinfo=None) != wall_time:
        before = wall_time.replace(tzinfo=timezone, fold=0).utcoffset()
        after = wall_time.replace(tzinfo=timezone, fold=1).utcoffset()
        if before is None or after is None or after <= before:
            return None
        shifted_wall_time = wall_time + (after - before)
        candidate = shifted_wall_time.replace(tzinfo=timezone)
        if (
            candidate.astimezone(UTC).astimezone(timezone).replace(tzinfo=None)
            != shifted_wall_time
        ):
            return None
    return candidate


def schedule_occurrences(
    schedule: MedicationSchedule,
    schedule_times: list[ScheduleTime],
    *,
    timezone: ZoneInfo,
    start_date: date,
    end_date: date,
) -> list[datetime]:
    if end_date < start_date:
        return []

    first_date = max(start_date, schedule.starts_on)
    last_date = min(end_date, schedule.ends_on or end_date)
    if last_date < first_date:
        return []

    occurrences: list[datetime] = []
    for local_date in (
        first_date + timedelta(days=day_offset)
        for day_offset in range((last_date - first_date).days + 1)
    ):
        if schedule.cadence == "weekly" and local_date.weekday() not in {
            schedule_time.day_of_week for schedule_time in schedule_times
        }:
            continue
        if schedule.cadence == "interval":
            interval_days = schedule.interval_days
            if interval_days is None:
                continue
            elapsed_days = (local_date - schedule.starts_on).days
            if elapsed_days % interval_days != 0:
                continue

        for schedule_time in schedule_times:
            if schedule.cadence == "weekly" and schedule_time.day_of_week != local_date.weekday():
                continue
            occurrence = _scheduled_datetime(local_date, schedule_time.local_time, timezone)
            if occurrence is not None:
                occurrences.append(occurrence)

    return sorted(occurrences, key=lambda occurrence: occurrence.astimezone(UTC))
