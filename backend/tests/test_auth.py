import os

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

os.environ.setdefault("JWT_SECRET_KEY", "test-only-secret-key")

import pytest

from app.db.base import Base
from app.db.session import get_db
from app.main import app


@pytest.fixture
def client():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    TestSession = sessionmaker(
        bind=engine,
        autoflush=False,
        expire_on_commit=False,
    )

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


def test_register_user(client):
    response = client.post(
        "/api/auth/register",
        json={
            "email": "dev@example.com",
            "full_name": "Test Developer",
            "password": "SecurePass123!",
        },
    )

    assert response.status_code == 201
    assert response.json()["email"] == "dev@example.com"
    assert "hashed_password" not in response.json()
    assert "password" not in response.json()


def test_duplicate_registration_is_rejected(client):
    payload = {
        "email": "dev@example.com",
        "full_name": "Test Developer",
        "password": "SecurePass123!",
    }

    assert client.post("/api/auth/register", json=payload).status_code == 201

    response = client.post("/api/auth/register", json=payload)

    assert response.status_code == 409


def test_login_and_get_current_user(client):
    client.post(
        "/api/auth/register",
        json={
            "email": "dev@example.com",
            "full_name": "Test Developer",
            "password": "SecurePass123!",
        },
    )

    response = client.post(
        "/api/auth/login",
        data={
            "username": "dev@example.com",
            "password": "SecurePass123!",
        },
    )

    assert response.status_code == 200
    token = response.json()["access_token"]

    me_response = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert me_response.status_code == 200
    assert me_response.json()["email"] == "dev@example.com"


def test_invalid_password_is_rejected(client):
    client.post(
        "/api/auth/register",
        json={
            "email": "dev@example.com",
            "full_name": "Test Developer",
            "password": "SecurePass123!",
        },
    )

    response = client.post(
        "/api/auth/login",
        data={
            "username": "dev@example.com",
            "password": "wrong-password",
        },
    )

    assert response.status_code == 401


def test_current_user_requires_token(client):
    response = client.get("/api/auth/me")

    assert response.status_code == 401
