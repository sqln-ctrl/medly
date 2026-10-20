from uuid import UUID

import jwt
from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth_security import (
    JWT_AUDIENCE,
    JWT_ISSUER,
    TokenConfigurationError,
    get_jwt_secret,
)
from app.db import get_session
from app.models import User


def _unauthorized() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated.",
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_current_user(
    authorization: str | None = Header(default=None, alias="Authorization"),
    session: AsyncSession = Depends(get_session),
) -> User:
    if authorization is None:
        raise _unauthorized()

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise _unauthorized()

    try:
        secret = get_jwt_secret()
        payload = jwt.decode(
            token,
            secret,
            algorithms=["HS256"],
            audience=JWT_AUDIENCE,
            issuer=JWT_ISSUER,
        )
    except (jwt.PyJWTError, TokenConfigurationError):
        raise _unauthorized() from None

    user_id = payload.get("sub")
    if not user_id:
        raise _unauthorized()

    user = await session.get(User, UUID(str(user_id)))
    if user is None:
        raise _unauthorized()

    return user
