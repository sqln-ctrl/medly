# Patient API

## Endpoints

All patient-scoped endpoints require an `Authorization: Bearer <access_token>` header.

### `GET /patients/me`

Returns the authenticated patient's profile. If no profile exists yet, the backend creates a default profile with the UTC timezone.

Response:

```json
{
  "user_id": "uuid",
  "timezone": "UTC",
  "created_at": "2026-10-20T00:00:00Z"
}
```

### `PUT /patients/me`

Request:

```json
{
  "timezone": "America/New_York"
}
```

Validates the timezone as a standard IANA timezone identifier.

### `GET /medications`

Returns the authenticated patient's medication list, ordered most recently created first.

### `POST /medications`

Request:

```json
{
  "name": "Vitamin D",
  "instruction_text": "Take after breakfast every morning."
}
```

Creates a medication row associated with the current patient. The mobile app sends the medication name and instruction text to this endpoint, then loads the patient's saved medication list from `GET /medications`. Medication instructions are stored as provided and are never rewritten by the backend.

## Reminder schedules

Schedules are created disabled. Creating a schedule does not activate reminders; the patient must review and explicitly confirm it using the confirmation endpoint.

### `POST /medications/{medication_id}/schedules`

Creates a pending schedule for one of the authenticated patient's medications.

```json
{
  "cadence": "weekly",
  "starts_on": "2026-10-23",
  "ends_on": null,
  "interval_days": null,
  "times": [
    { "day_of_week": 0, "local_time": "08:30:00" },
    { "day_of_week": 2, "local_time": "08:30:00" }
  ]
}
```

Cadence is `daily`, `weekly`, or `interval`. Daily and interval times use `day_of_week: -1`; weekly times use `0` for Monday through `6` for Sunday. Interval schedules require a positive `interval_days` value, and the interval is anchored to `starts_on`. Schedule dates and wall-clock times are interpreted in the patient's profile timezone. The response includes `confirmed_at` and `enabled_at`, both initially `null`.

### `GET /medications/{medication_id}/schedules`

Lists the authenticated patient's schedules for that medication, including whether each has been confirmed and enabled.

### `POST /schedules/{schedule_id}/confirm`

Confirms and enables a pending schedule after the patient has reviewed it. Repeating confirmation is safe and does not change the original confirmation time. Schedule endpoints return `404` when the medication or schedule does not belong to the authenticated patient.

These endpoints persist schedule rules and return occurrences; the mobile app can schedule local reminders for upcoming occurrences after the user grants notification permission and enables reminders. Only confirmed and enabled schedules are eligible. Native device reminders can be delivered while the app is closed. Browser reminders require the Medly tab to remain open and may be delayed when the browser suspends the tab. Reminder text does not include medication names or instructions.

### `GET /doses/upcoming?days=7`

Returns scheduled dose occurrences from today through the requested number of days ahead (0–30), using the authenticated patient's IANA timezone. Only explicitly confirmed and enabled schedules are included. During a daylight-saving transition, ambiguous wall times use the earlier occurrence; nonexistent wall times shift forward by the size of the clock change. Each occurrence includes the medication name, timezone-aware scheduled instant, and the user's reported dose status when one exists; an absent status means no report has been recorded and is not an inferred adherence outcome.

### `POST /doses/report`

Records or updates the authenticated patient's report for a scheduled occurrence:

```json
{
  "schedule_id": "schedule-uuid",
  "scheduled_for": "2026-10-26T08:00:00-04:00",
  "status": "taken"
}
```

`status` is `taken`, `skipped`, or `missed`. The timestamp must include a timezone, match an occurrence on the patient's confirmed schedule, and not be in the future. A repeated report for the same schedule occurrence updates that user's report. This is a patient-reported record only; Medly does not infer a status or recommend what to do about a dose.

### `GET /doses/history`

Returns the authenticated patient's dose reports from the last 30 days by default. Optional `start_date` and `end_date` use inclusive ISO dates in the patient's timezone; the requested range cannot exceed 366 days. History contains only explicitly reported dose events, not inferred missed doses.

### `GET /doses/adherence`

Returns counts of the patient's reported `taken`, `skipped`, and `missed` events overall and per medication for the same date-range rules as dose history. `reported_taken_percentage` is the proportion of recorded reports marked taken, not a measure of unreported scheduled doses; it is `null` when there are no reports. No status is inferred for occurrences without a report.
