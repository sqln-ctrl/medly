import os
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Medly API", version="0.1.0")

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
    allow_methods=["GET", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/")
def root() -> dict[str, str]:
    return {"service": "medly-backend", "status": "ok"}


@app.get("/health/live")
def health_live() -> dict[str, str]:
    return {"status": "ok", "service": "medly-backend"}


@app.get("/health/ready")
def health_ready() -> dict[str, Any]:
    database_url = os.getenv("DATABASE_URL")
    database_status = "ready" if database_url else "not-configured"

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
