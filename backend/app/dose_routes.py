from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth_dependencies import get_current_user
from app.db import get_session
from app.dose_schemas import UpcomingDosesResponse
from app.dose_service import get_upcoming_doses
from app.models import User

router = APIRouter(tags=["doses"])


@router.get("/doses/upcoming", response_model=UpcomingDosesResponse)
async def list_upcoming_doses(
    days: Annotated[int, Query(ge=0, le=30)] = 7,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> UpcomingDosesResponse:
    return await get_upcoming_doses(
        session,
        patient_id=current_user.id,
        days=days,
    )
