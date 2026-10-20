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
