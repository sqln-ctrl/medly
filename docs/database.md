# Database

The backend uses SQLAlchemy 2 async models and Alembic migrations against PostgreSQL. The current schema adds the patient, medication, schedule, schedule-time, and dose-event tables alongside the existing custom authentication tables.

## Domain tables

- `patient_profiles` stores the patient's required IANA timezone, linked to the existing `users` account.
- `medications` stores the name and instruction text as provided; the application must not rewrite the instruction text.
- `medication_schedules` supports daily, weekly, and every-N-days recurrence. `starts_on` and `ends_on` are calendar dates in the patient's timezone. A schedule may only be enabled after it has a confirmation timestamp.
- `schedule_times` stores local wall-clock reminder times. `day_of_week` uses `0` for Monday through `6` for Sunday; `-1` means every day and is used for daily and interval schedules. Weekly schedules use one row for each selected weekday.
- `dose_events` stores user-reported `taken`, `skipped`, or `missed` events for scheduled instants. It does not infer adherence; dose occurrences are calculated from confirmed schedule rules when requested.
- Medications and schedules use nullable `archived_at` timestamps for removal from active use. Archiving preserves associated schedules and dose history while stopping future occurrences and reports.

All patient-domain records retain an explicit patient owner, and composite foreign keys prevent a schedule or event from referencing another patient's medication. Patient-scoped API operations must still perform server-side ownership checks.

## Migrations

From the `backend` directory, apply the current schema with:

```powershell
python -m alembic upgrade head
```

The schema is PostgreSQL-compatible and can be migrated to a Supabase Postgres database using its connection string. Supabase Auth and Row Level Security policies are not configured yet: the application currently authenticates users itself, so the identity/policy design must be chosen before enabling client-accessible RLS.
