from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_live():
    response = client.get("/health/live")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_health_live_allows_expo_web_origin():
    response = client.get(
        "/health/live",
        headers={"Origin": "http://localhost:8081"},
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:8081"


def test_health_live_allows_expo_web_preflight():
    response = client.options(
        "/health/live",
        headers={
            "Origin": "http://localhost:8081",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:8081"
    assert "GET" in response.headers["access-control-allow-methods"]


def test_health_live_rejects_unconfigured_origin():
    response = client.get(
        "/health/live",
        headers={"Origin": "https://example.com"},
    )

    assert response.status_code == 200
    assert "access-control-allow-origin" not in response.headers


def test_health_ready_without_db_config():
    response = client.get("/health/ready")

    assert response.status_code == 200
    assert response.json()["status"] == "degraded"
    assert response.json()["checks"]["database"]["status"] == "not-configured"
