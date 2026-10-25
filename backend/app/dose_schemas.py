from datetime import date, datetime
from uuid import UUID
from zoneinfo import ZoneInfo

from pydantic import BaseModel, ConfigDict, field_validator


class UpcomingDoseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    schedule_id: UUID
    medication_id: UUID
    medication_name: str
    scheduled_for: datetime
    status: str | None


class UpcomingDosesResponse(BaseModel):
    timezone: str
    start_date: date
    end_date: date
    doses: list[UpcomingDoseResponse]

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, value: str) -> str:
        ZoneInfo(value)
        return value
