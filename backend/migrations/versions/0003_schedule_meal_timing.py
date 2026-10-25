"""Store patient-selected meal timing alongside schedule times.

Revision ID: 0003_schedule_meal_timing
Revises: 0002_patient_medication_domain
"""

from alembic import op
import sqlalchemy as sa

revision = "0003_schedule_meal_timing"
down_revision = "0002_patient_medication_domain"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "schedule_times",
        sa.Column("meal_timing", sa.String(length=32), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("schedule_times", "meal_timing")
