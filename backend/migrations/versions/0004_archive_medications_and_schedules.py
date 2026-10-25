"""Allow medications and schedules to be archived without losing history.

Revision ID: 0004_archive_med_sched
Revises: 0003_schedule_meal_timing
"""

from alembic import op
import sqlalchemy as sa

revision = "0004_archive_med_sched"
down_revision = "0003_schedule_meal_timing"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "medications",
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "medication_schedules",
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("medication_schedules", "archived_at")
    op.drop_column("medications", "archived_at")
