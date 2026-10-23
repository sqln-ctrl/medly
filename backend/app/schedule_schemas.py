from datetime import date, datetime, time
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

Cadence = Literal["daily", "weekly", "interval"]


class ScheduleTimeInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    day_of_week: int = Field(ge=-1, le=6)
    local_time: time

    @field_validator("local_time")
    @classmethod
    def validate_local_time(cls, value: time) -> time:
        if value.tzinfo is not None and value.utcoffset() is not None:
            raise ValueError("Schedule times must be local wall-clock times without a timezone.")
        return value


class MedicationScheduleCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    cadence: Cadence
    starts_on: date
    ends_on: date | None = None
    interval_days: int | None = Field(default=None, ge=1)
    times: list[ScheduleTimeInput] = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def validate_recurrence(self) -> "MedicationScheduleCreateRequest":
        if self.ends_on is not None and self.ends_on < self.starts_on:
            raise ValueError("The schedule end date must be on or after its start date.")
        if self.cadence == "interval":
            if self.interval_days is None:
                raise ValueError("Interval schedules require interval_days.")
            if any(schedule_time.day_of_week != -1 for schedule_time in self.times):
                raise ValueError("Interval schedule times must use day_of_week -1.")
        else:
            if self.interval_days is not None:
                raise ValueError("interval_days is only valid for interval schedules.")
            if self.cadence == "daily" and any(
                schedule_time.day_of_week != -1 for schedule_time in self.times
            ):
                raise ValueError("Daily schedule times must use day_of_week -1.")
            if self.cadence == "weekly" and any(
                schedule_time.day_of_week == -1 for schedule_time in self.times
            ):
                raise ValueError("Weekly schedule times require a weekday from 0 to 6.")
        if len(
            {
                (schedule_time.day_of_week, schedule_time.local_time)
                for schedule_time in self.times
            }
        ) != len(self.times):
            raise ValueError("Schedule times must be unique.")
        return self


class ScheduleTimeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    day_of_week: int
    local_time: time


class MedicationScheduleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    medication_id: UUID
    cadence: Cadence
    starts_on: date
    ends_on: date | None
    interval_days: int | None
    confirmed_at: datetime | None
    enabled_at: datetime | None
    created_at: datetime
    times: list[ScheduleTimeResponse]
