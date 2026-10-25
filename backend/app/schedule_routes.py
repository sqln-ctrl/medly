from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth_dependencies import get_current_user
from app.db import get_session
from app.models import MedicationSchedule, User
from app.schedule_schemas import (
    MedicationScheduleCreateRequest,
    MedicationScheduleResponse,
)
from app.schedule_service import (
    confirm_medication_schedule,
    create_medication_schedule,
    archive_medication_schedule,
    get_schedule_times,
    list_medication_schedules,
)

router = APIRouter(tags=["schedules"])


async def _response_for_schedules(
    session: AsyncSession,
    schedules: list[MedicationSchedule],
) -> list[MedicationScheduleResponse]:
    times_by_schedule = await get_schedule_times(
        session,
        schedule_ids=[schedule.id for schedule in schedules],
    )
    return [
        MedicationScheduleResponse.model_validate(
            {
                "id": schedule.id,
                "medication_id": schedule.medication_id,
                "cadence": schedule.cadence,
                "starts_on": schedule.starts_on,
                "ends_on": schedule.ends_on,
                "interval_days": schedule.interval_days,
                "confirmed_at": schedule.confirmed_at,
                "enabled_at": schedule.enabled_at,
                "created_at": schedule.created_at,
                "times": times_by_schedule[schedule.id],
            }
        )
        for schedule in schedules
    ]


@router.get(
    "/medications/{medication_id}/schedules",
    response_model=list[MedicationScheduleResponse],
)
async def get_medication_schedules(
    medication_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[MedicationScheduleResponse]:
    schedules = await list_medication_schedules(
        session,
        patient_id=current_user.id,
        medication_id=medication_id,
    )
    if schedules is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Medication not found.")
    return await _response_for_schedules(session, schedules)


@router.post(
    "/medications/{medication_id}/schedules",
    response_model=MedicationScheduleResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_schedule(
    medication_id: UUID,
    payload: MedicationScheduleCreateRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> MedicationScheduleResponse:
    schedule = await create_medication_schedule(
        session,
        patient_id=current_user.id,
        medication_id=medication_id,
        payload=payload,
    )
    if schedule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Medication not found.")
    return (await _response_for_schedules(session, [schedule]))[0]


@router.post(
    "/schedules/{schedule_id}/confirm",
    response_model=MedicationScheduleResponse,
)
async def confirm_schedule(
    schedule_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> MedicationScheduleResponse:
    schedule = await confirm_medication_schedule(
        session,
        patient_id=current_user.id,
        schedule_id=schedule_id,
    )
    if schedule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule not found.")
    return (await _response_for_schedules(session, [schedule]))[0]


@router.delete("/schedules/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_schedule(
    schedule_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    archived = await archive_medication_schedule(
        session,
        patient_id=current_user.id,
        schedule_id=schedule_id,
    )
    if not archived:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule not found.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
