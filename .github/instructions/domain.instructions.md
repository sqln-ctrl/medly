# Domain instructions

Scheduling and adherence logic should remain pure and easy to test.

- Use timezone-aware datetimes and explicit recurring schedule rules.
- Treat instruction text as immutable input.
- Separate reminder generation from user-reported dose actions.
- Model day-level adherence as user-reported events, not inferred medical outcomes.
