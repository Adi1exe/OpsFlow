
from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Integer,
    UniqueConstraint,
    String,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class TeamMembership(Base):
    __tablename__ = "team_memberships"

    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "team_id",
            name="uq_team_membership_user_team",
        ),
        CheckConstraint(
            "role IN ('member', 'team_lead', 'admin')",
            name="ck_team_membership_role",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    team_id: Mapped[int] = mapped_column(
        ForeignKey("teams.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    role: Mapped[str] = mapped_column(
        String(20), default="member", nullable=False
    )

    user: Mapped["User"] = relationship(back_populates="memberships")
    team: Mapped["Team"] = relationship(back_populates="memberships")
