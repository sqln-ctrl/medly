"""Create patient, medication, schedule, and dose-event tables.

Revision ID: 0002_patient_medication_domain
Revises: 0001_auth_tables
"""

from alembic import op
import sqlalchemy as sa

revision = "0002_patient_medication_domain"
down_revision = "0001_auth_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "patient_profiles",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("timezone", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id"),
    )
    op.create_table(
        "medications",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("patient_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("instruction_text", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["patient_id"],
            ["patient_profiles.user_id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("id", "patient_id", name="uq_medications_id_patient_id"),
    )
    op.create_table(
        "medication_schedules",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("medication_id", sa.Uuid(), nullable=False),
        sa.Column("patient_id", sa.Uuid(), nullable=False),
        sa.Column("cadence", sa.String(length=16), nullable=False),
        sa.Column("starts_on", sa.Date(), nullable=False),
        sa.Column("ends_on", sa.Date(), nullable=True),
        sa.Column("interval_days", sa.Integer(), nullable=True),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("enabled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "cadence IN ('daily', 'weekly', 'interval')",
            name="ck_medication_schedules_cadence",
        ),
        sa.CheckConstraint(
            "(cadence = 'interval' AND interval_days > 0) OR "
            "(cadence != 'interval' AND interval_days IS NULL)",
            name="ck_medication_schedules_interval_days",
        ),
        sa.CheckConstraint(
            "ends_on IS NULL OR ends_on >= starts_on",
            name="ck_medication_schedules_date_range",
        ),
        sa.CheckConstraint(
            "enabled_at IS NULL OR confirmed_at IS NOT NULL",
            name="ck_medication_schedules_enabled_after_confirmation",
        ),
        sa.ForeignKeyConstraint(
            ["medication_id", "patient_id"],
            ["medications.id", "medications.patient_id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "id",
            "medication_id",
            "patient_id",
            name="uq_medication_schedules_id_medication_patient",
        ),
    )
    op.create_index(
        "ix_medication_schedules_patient_id",
        "medication_schedules",
        ["patient_id"],
    )
    op.create_table(
        "schedule_times",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("schedule_id", sa.Uuid(), nullable=False),
        sa.Column("day_of_week", sa.Integer(), nullable=False),
        sa.Column("local_time", sa.Time(), nullable=False),
        sa.CheckConstraint(
            "day_of_week = -1 OR day_of_week BETWEEN 0 AND 6",
            name="ck_schedule_times_day_of_week",
        ),
        sa.ForeignKeyConstraint(
            ["schedule_id"],
            ["medication_schedules.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "schedule_id",
            "day_of_week",
            "local_time",
            name="uq_schedule_times_schedule_day_time",
        ),
    )
    op.create_index("ix_schedule_times_schedule_id", "schedule_times", ["schedule_id"])
    op.create_table(
        "dose_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("schedule_id", sa.Uuid(), nullable=False),
        sa.Column("medication_id", sa.Uuid(), nullable=False),
        sa.Column("patient_id", sa.Uuid(), nullable=False),
        sa.Column("scheduled_for", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("reported_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "status IN ('taken', 'skipped', 'missed')",
            name="ck_dose_events_status",
        ),
        sa.ForeignKeyConstraint(
            ["schedule_id", "medication_id", "patient_id"],
            [
                "medication_schedules.id",
                "medication_schedules.medication_id",
                "medication_schedules.patient_id",
            ],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "schedule_id",
            "scheduled_for",
            name="uq_dose_events_schedule_occurrence",
        ),
    )
    op.create_index(
        "ix_dose_events_patient_scheduled_for",
        "dose_events",
        ["patient_id", "scheduled_for"],
    )


def downgrade() -> None:
    op.drop_index("ix_dose_events_patient_scheduled_for", table_name="dose_events")
    op.drop_table("dose_events")
    op.drop_index("ix_schedule_times_schedule_id", table_name="schedule_times")
    op.drop_table("schedule_times")
    op.drop_index("ix_medication_schedules_patient_id", table_name="medication_schedules")
    op.drop_table("medication_schedules")
    op.drop_table("medications")
    op.drop_table("patient_profiles")
