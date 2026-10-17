import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth_schemas import CredentialsRequest, RefreshRequest, TokenResponse, UserResponse
from app.auth_security import (
    ACCESS_TOKEN_SECONDS,
    REFRESH_TOKEN_DAYS,
    TokenConfigurationError,
    create_access_token,
    dummy_password_hash,
    get_jwt_secret,
    hash_password,
    hash_refresh_token,
    password_hasher,
    verify_password,
)
from app.db import get_session
from app.models import RefreshToken, User
from app.rate_limit import limiter

router = APIRouter(prefix="/auth", tags=["authentication"])


def _require_token_configuration() -> str:
    try:
        return get_jwt_secret()
    except TokenConfigurationError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service is not configured.",
        ) from error


def _unauthorized() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired credentials.",
        headers={"WWW-Authenticate": "Bearer"},
    )


def _new_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def _token_response(user: User, refresh_token: str, secret: str) -> TokenResponse:
    return TokenResponse(
        user=UserResponse(id=user.id, email=user.email),
        access_token=create_access_token(user.id, secret),
        expires_in=ACCESS_TOKEN_SECONDS,
        refresh_token=refresh_token,
    )


def _add_refresh_record(
    session: AsyncSession,
    *,
    token: str,
    user_id: UUID,
    family_id: UUID | None = None,
) -> RefreshToken:
    now = datetime.now(UTC)
    new_family_id = family_id or uuid4()
    token_hash = hash_refresh_token(token)
    record = RefreshToken(
        token_hash=token_hash,
        family_id=new_family_id,
        user_id=user_id,
        created_at=now,
        expires_at=now + timedelta(days=REFRESH_TOKEN_DAYS),
    )
    session.add(record)
    return record


def _auth_response(session: AsyncSession, user: User, secret: str) -> TokenResponse:
    refresh_token = _new_refresh_token()
    _add_refresh_record(session, token=refresh_token, user_id=user.id)
    return _token_response(user, refresh_token, secret)


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
async def register(
    request: Request,
    payload: CredentialsRequest,
    session: AsyncSession = Depends(get_session),
) -> TokenResponse:
    secret = _require_token_configuration()
    user = User(
        email=str(payload.email),
        password_hash=hash_password(payload.password),
        created_at=datetime.now(UTC),
    )
    session.add(user)
    try:
        await session.flush()
    except IntegrityError as error:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        ) from error

    response = _auth_response(session, user, secret)
    await session.commit()
    return response


@router.post("/login", response_model=TokenResponse)
@limiter.limit("5/minute")
async def login(
    request: Request,
    payload: CredentialsRequest,
    session: AsyncSession = Depends(get_session),
) -> TokenResponse:
    secret = _require_token_configuration()
    user = await session.scalar(select(User).where(User.email == str(payload.email)))
    stored_hash = user.password_hash if user else dummy_password_hash
    if not verify_password(stored_hash, payload.password) or user is None:
        raise _unauthorized()

    response = _auth_response(session, user, secret)
    await session.commit()
    return response


@router.post("/refresh", response_model=TokenResponse)
@limiter.limit("20/minute")
async def refresh(
    request: Request,
    payload: RefreshRequest,
    session: AsyncSession = Depends(get_session),
) -> TokenResponse:
    secret = _require_token_configuration()
    supplied_hash = hash_refresh_token(payload.refresh_token)
    record = await session.scalar(
        select(RefreshToken)
        .where(RefreshToken.token_hash == supplied_hash)
        .with_for_update()
    )
    if record is None:
        raise _unauthorized()

    now = datetime.now(UTC)
    if record.revoked_at is not None:
        await session.execute(
            update(RefreshToken)
            .where(
                RefreshToken.family_id == record.family_id,
                RefreshToken.revoked_at.is_(None),
            )
            .values(revoked_at=now)
        )
        await session.commit()
        raise _unauthorized()

    expires_at = record.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    if expires_at <= now:
        record.revoked_at = now
        await session.commit()
        raise _unauthorized()

    user = await session.get(User, record.user_id)
    if user is None:
        record.revoked_at = now
        await session.commit()
        raise _unauthorized()

    new_refresh_token = _new_refresh_token()
    new_record = _add_refresh_record(
        session,
        token=new_refresh_token,
        user_id=record.user_id,
        family_id=record.family_id,
    )
    record.revoked_at = now
    record.replaced_by_hash = new_record.token_hash
    response = _token_response(user, new_refresh_token, secret)
    await session.commit()
    return response


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("20/minute")
async def logout(
    request: Request,
    payload: RefreshRequest,
    session: AsyncSession = Depends(get_session),
) -> Response:
    supplied_hash = hash_refresh_token(payload.refresh_token)
    record = await session.get(RefreshToken, supplied_hash)
    if record is not None:
        now = datetime.now(UTC)
        await session.execute(
            update(RefreshToken)
            .where(
                RefreshToken.family_id == record.family_id,
                RefreshToken.revoked_at.is_(None),
            )
            .values(revoked_at=now)
        )
        await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
