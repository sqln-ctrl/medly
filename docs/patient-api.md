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

Creates a medication row associated with the current patient. Medication instructions are stored as provided and are never rewritten by the backend.

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

These endpoints persist schedule rules only; they do not yet deliver browser or device notifications.
