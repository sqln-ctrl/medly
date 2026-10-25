from datetime import UTC, date, datetime
from typing import Literal
from uuid import UUID
from zoneinfo import ZoneInfo

from pydantic import BaseModel, ConfigDict, field_validator

DoseStatus = Literal["taken", "skipped", "missed"]


class DoseReportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schedule_id: UUID
    scheduled_for: datetime
    status: DoseStatus

    @field_validator("scheduled_for")
    @classmethod
    def require_aware_scheduled_for(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("scheduled_for must include a timezone.")
        return value.astimezone(UTC)


class DoseReportResponse(BaseModel):
    id: UUID
    schedule_id: UUID
    medication_id: UUID
    medication_name: str
    scheduled_for: datetime
    status: DoseStatus
    reported_at: datetime


class DoseHistoryResponse(BaseModel):
    timezone: str
    start_date: date
    end_date: date
    events: list[DoseReportResponse]

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, value: str) -> str:
        ZoneInfo(value)
        return value


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
