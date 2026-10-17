import hashlib
import os
import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError

ACCESS_TOKEN_SECONDS = 15 * 60
REFRESH_TOKEN_DAYS = 30
JWT_ISSUER = "medly-api"
JWT_AUDIENCE = "medly-mobile"
password_hasher = PasswordHasher()
dummy_password_hash = password_hasher.hash("medly-invalid-account-placeholder")


class TokenConfigurationError(RuntimeError):
    pass


def get_jwt_secret() -> str:
    secret = os.getenv("AUTH_JWT_SECRET", "")
    if len(secret) < 32:
        raise TokenConfigurationError(
            "AUTH_JWT_SECRET must be configured with at least 32 characters."
        )
    return secret


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return password_hasher.verify(password_hash, password)
    except (VerifyMismatchError, InvalidHashError):
        return False


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_access_token(user_id: UUID, secret: str) -> str:
    now = datetime.now(UTC)
    return jwt.encode(
        {
            "sub": str(user_id),
            "iss": JWT_ISSUER,
            "aud": JWT_AUDIENCE,
            "iat": now,
            "exp": now + timedelta(seconds=ACCESS_TOKEN_SECONDS),
            "jti": secrets.token_urlsafe(16),
        },
        secret,
        algorithm="HS256",
    )
