import os
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.auth_routes import router as auth_router
from app.db import engine
from app.patient_routes import router as patient_router
from app.rate_limit import limiter
from app.schedule_routes import router as schedule_router

app = FastAPI(title="Medly API", version="0.1.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

cors_origins = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:8081,http://127.0.0.1:8081",
    ).split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)
app.include_router(auth_router)
app.include_router(patient_router)
app.include_router(schedule_router)


@app.get("/")
def root() -> dict[str, str]:
    return {"service": "medly-backend", "status": "ok"}


@app.get("/health/live")
def health_live() -> dict[str, str]:
    return {"status": "ok", "service": "medly-backend"}


@app.get("/health/ready")
async def health_ready() -> dict[str, Any]:
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        database_status = "not-configured"
    else:
        try:
            async with engine.connect() as connection:
                await connection.execute(text("SELECT 1"))
            database_status = "ready"
        except (SQLAlchemyError, OSError):
            database_status = "unavailable"

    return {
        "status": "ok" if database_status == "ready" else "degraded",
        "checks": {
            "database": {
                "status": database_status,
                "driver": "postgresql" if database_url else "not-configured",
            },
            "redis": {
                "status": "not-configured",
                "driver": "redis",
            },
        },
    }
