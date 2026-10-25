from typing import Annotated

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth_dependencies import get_current_user
from app.db import get_session
from app.dose_schemas import (
    DoseAdherenceResponse,
    DoseHistoryResponse,
    DoseReportRequest,
    DoseReportResponse,
    UpcomingDosesResponse,
)
from app.dose_service import (
    get_dose_history,
    get_upcoming_doses,
    report_dose,
    summarize_dose_history,
)
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


@router.post("/doses/report", response_model=DoseReportResponse)
async def create_dose_report(
    payload: DoseReportRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> DoseReportResponse:
    try:
        report = await report_dose(session, patient_id=current_user.id, payload=payload)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    if report is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scheduled dose occurrence not found.",
        )
    return report


@router.get("/doses/history", response_model=DoseHistoryResponse)
async def list_dose_history(
    start_date: date | None = None,
    end_date: date | None = None,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> DoseHistoryResponse:
    if start_date is not None and end_date is not None:
        if start_date > end_date:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="start_date must be on or before end_date.",
            )
        if (end_date - start_date).days > 365:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="History date range cannot exceed 366 days.",
            )
    try:
        return await get_dose_history(
            session,
            patient_id=current_user.id,
            start_date=start_date,
            end_date=end_date,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc


@router.get("/doses/adherence", response_model=DoseAdherenceResponse)
async def get_dose_adherence(
    start_date: date | None = None,
    end_date: date | None = None,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> DoseAdherenceResponse:
    if start_date is not None and end_date is not None:
        if start_date > end_date:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="start_date must be on or before end_date.",
            )
        if (end_date - start_date).days > 365:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="History date range cannot exceed 366 days.",
            )
    try:
        history = await get_dose_history(
            session,
            patient_id=current_user.id,
            start_date=start_date,
            end_date=end_date,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    return summarize_dose_history(history)
