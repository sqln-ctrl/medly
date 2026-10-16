# Copilot instructions for Medly

## Product safety

- Treat the app as a reminder and tracking tool, not a prescribing or diagnostic system.
- Preserve medication instructions verbatim.
- Never suggest clinical next steps for missed or late doses.
- Only create reminders after the schedule is confirmed by the patient or authorized user.

## Project architecture

- Keep backend routes thin and push business logic into services and domain modules.
- Keep scheduling and adherence logic in pure functions that are independently testable.
- Enforce ownership checks on every patient-scoped endpoint.
- Use timezone-aware datetimes and the patient's prefered IANA time zone.

## Workflow

1. Build in small end-to-end slices.
2. Define the API contract before implementation.
3. Update or add tests with each change.
4. Validate the relevant backend and mobile checks before completion.
