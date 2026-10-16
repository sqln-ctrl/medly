import os
from typing import Any

from fastapi import FastAPI

app = FastAPI(title="Medly API", version="0.1.0")


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
