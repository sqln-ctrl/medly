# Authentication API

## Endpoints

All request and response bodies use JSON except logout, which returns an empty `204` response.

### `POST /auth/register`

Request:

```json
{
  "email": "person@example.com",
  "password": "at-least-12-characters"
}
```

Returns `201 Created` with the user and token response below. Returns `409 Conflict` if the email is already registered and `422 Unprocessable Entity` for invalid input.

### `POST /auth/login`

Accepts the same request as registration. Returns `200 OK` with the token response. Invalid credentials return a generic `401 Unauthorized` response.

### Token response

```json
{
  "user": {
    "id": "user-uuid",
    "email": "person@example.com"
  },
  "access_token": "signed-access-token",
  "token_type": "bearer",
  "expires_in": 900,
  "refresh_token": "opaque-refresh-token"
}
```

Access tokens are signed with HS256, issued for `medly-mobile`, and expire after 15 minutes. Refresh tokens are opaque, valid for 30 days, and stored only as SHA-256 hashes in the database.

### `POST /auth/refresh`

Request:

```json
{
  "refresh_token": "opaque-refresh-token"
}
```

Returns a new token response and invalidates the submitted refresh token. Reuse of an invalidated token revokes all active tokens in that token family and returns `401 Unauthorized`.

### `POST /auth/logout`

Accepts the refresh-token request body and returns `204 No Content`. Repeated logout is harmless.

Registration and login are limited to 5 requests per minute per client address. Refresh and logout are limited to 20 requests per minute. The included in-memory limiter is intended for a single-process development deployment; production deployments need a shared limiter store.

## Local development

Start PostgreSQL from the repository root:

```powershell
docker compose up -d postgres
```

Create a local JWT secret and set the backend environment. Add the generated value to `backend/.env` so it is not committed:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Configure `AUTH_JWT_SECRET` with the generated value, and set `DATABASE_URL` to a PostgreSQL async URL such as `postgresql+asyncpg://medly:medly@localhost:5432/medly`.

Then run the migration and API from `backend`:

```powershell
cd backend
python -m alembic upgrade head
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8765
```

For local tests, the auth suite uses isolated SQLite databases and does not require a running PostgreSQL server.

## Mobile token handling

The mobile app stores only the refresh token in Expo SecureStore on Android and iOS. The access token stays in memory. Web builds do not persist refresh tokens; browser sessions are temporary and end when the page is reloaded.
