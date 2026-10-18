from datetime import date, datetime, time
from uuid import UUID, uuid4

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    Text,
    Time,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class User(Base):
    __tablename__ = "users"
    __table_args__ = (UniqueConstraint("email", name="uq_users_email"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(512), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"
    __table_args__ = (
        Index("ix_refresh_tokens_family_id", "family_id"),
        Index("ix_refresh_tokens_user_id", "user_id"),
    )

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    family_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    replaced_by_hash: Mapped[str | None] = mapped_column(String(64))


class PatientProfile(Base):
    __tablename__ = "patient_profiles"

    user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    timezone: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class Medication(Base):
    __tablename__ = "medications"
    __table_args__ = (
        UniqueConstraint("id", "patient_id", name="uq_medications_id_patient_id"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    patient_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("patient_profiles.user_id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    instruction_text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class MedicationSchedule(Base):
    __tablename__ = "medication_schedules"
    __table_args__ = (
        ForeignKeyConstraint(
            ["medication_id", "patient_id"],
            ["medications.id", "medications.patient_id"],
            ondelete="CASCADE",
        ),
        UniqueConstraint(
            "id",
            "medication_id",
            "patient_id",
            name="uq_medication_schedules_id_medication_patient",
        ),
        CheckConstraint(
            "cadence IN ('daily', 'weekly', 'interval')",
            name="ck_medication_schedules_cadence",
        ),
        CheckConstraint(
            "(cadence = 'interval' AND interval_days > 0) OR "
            "(cadence != 'interval' AND interval_days IS NULL)",
            name="ck_medication_schedules_interval_days",
        ),
        CheckConstraint(
            "ends_on IS NULL OR ends_on >= starts_on",
            name="ck_medication_schedules_date_range",
        ),
        CheckConstraint(
            "enabled_at IS NULL OR confirmed_at IS NOT NULL",
            name="ck_medication_schedules_enabled_after_confirmation",
        ),
        Index("ix_medication_schedules_patient_id", "patient_id"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    medication_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    patient_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    cadence: Mapped[str] = mapped_column(String(16), nullable=False)
    starts_on: Mapped[date] = mapped_column(Date, nullable=False)
    ends_on: Mapped[date | None] = mapped_column(Date)
    interval_days: Mapped[int | None] = mapped_column(Integer)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    enabled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class ScheduleTime(Base):
    __tablename__ = "schedule_times"
    __table_args__ = (
        UniqueConstraint(
            "schedule_id",
            "day_of_week",
            "local_time",
            name="uq_schedule_times_schedule_day_time",
        ),
        CheckConstraint(
            "day_of_week = -1 OR day_of_week BETWEEN 0 AND 6",
            name="ck_schedule_times_day_of_week",
        ),
        Index("ix_schedule_times_schedule_id", "schedule_id"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    schedule_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("medication_schedules.id", ondelete="CASCADE"),
        nullable=False,
    )
    day_of_week: Mapped[int] = mapped_column(Integer, nullable=False, default=-1)
    local_time: Mapped[time] = mapped_column(Time, nullable=False)


class DoseEvent(Base):
    __tablename__ = "dose_events"
    __table_args__ = (
        ForeignKeyConstraint(
            ["schedule_id", "medication_id", "patient_id"],
            [
                "medication_schedules.id",
                "medication_schedules.medication_id",
                "medication_schedules.patient_id",
            ],
            ondelete="CASCADE",
        ),
        CheckConstraint(
            "status IN ('taken', 'skipped', 'missed')",
            name="ck_dose_events_status",
        ),
        UniqueConstraint(
            "schedule_id",
            "scheduled_for",
            name="uq_dose_events_schedule_occurrence",
        ),
        Index("ix_dose_events_patient_scheduled_for", "patient_id", "scheduled_for"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    schedule_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    medication_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    patient_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    scheduled_for: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    reported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
