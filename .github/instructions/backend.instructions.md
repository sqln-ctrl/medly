# Backend instructions

Use FastAPI, SQLAlchemy 2 async, and Pydantic v2 for the backend.

- Keep routers minimal and delegate work to service and repository layers.
- Validate all patient-scoped operations on the server.
- Prefer explicit request and response schemas.
- Use environment variables for secrets and database settings.
- Add tests for health, validation, and business logic before broad refactors.
