from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth_dependencies import get_current_user
from app.db import get_session
from app.models import Medication, PatientProfile, User
from app.patient_schemas import (
    MedicationCreateRequest,
    MedicationResponse,
    PatientProfileResponse,
    PatientProfileUpdateRequest,
)
from app.patient_service import get_or_create_patient_profile, list_medications_for_patient

router = APIRouter(tags=["patients"])


@router.get("/patients/me", response_model=PatientProfileResponse)
async def get_patient_profile(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> PatientProfile:
    profile = await get_or_create_patient_profile(session, user_id=current_user.id)
    await session.commit()
    return profile


@router.put("/patients/me", response_model=PatientProfileResponse)
async def update_patient_profile(
    payload: PatientProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> PatientProfile:
    profile = await get_or_create_patient_profile(session, user_id=current_user.id)
    profile.timezone = payload.timezone
    await session.commit()
    return profile


@router.get("/medications", response_model=list[MedicationResponse])
async def list_medications(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[Medication]:
    await get_or_create_patient_profile(session, user_id=current_user.id)
    medications = await list_medications_for_patient(session, patient_id=current_user.id)
    return medications


@router.post("/medications", response_model=MedicationResponse, status_code=status.HTTP_201_CREATED)
async def create_medication(
    payload: MedicationCreateRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Medication:
    await get_or_create_patient_profile(session, user_id=current_user.id)
    medication = Medication(
        patient_id=current_user.id,
        name=payload.name,
        instruction_text=payload.instruction_text,
        created_at=datetime.now(UTC),
    )
    session.add(medication)
    await session.commit()
    await session.refresh(medication)
    return medication
