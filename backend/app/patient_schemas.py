from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator
from zoneinfo import ZoneInfo


class PatientProfileUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    timezone: str = Field(min_length=3, max_length=64)

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except Exception as exc:  # pragma: no cover - exercised by validation tests
            raise ValueError("Timezone must be a valid IANA timezone identifier.") from exc
        return value


class PatientProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: UUID
    timezone: str
    created_at: datetime


class MedicationCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=200)
    instruction_text: str = Field(min_length=1, max_length=2000)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Medication name cannot be empty.")
        return normalized

    @field_validator("instruction_text")
    @classmethod
    def validate_instruction_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Medication instructions cannot be empty.")
        return value


class MedicationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    patient_id: UUID
    name: str
    instruction_text: str
    created_at: datetime
