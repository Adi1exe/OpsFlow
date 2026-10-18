
import enum

from sqlalchemy import (
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class WorkItemStatus(str, enum.Enum):
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    BLOCKED = "blocked"
    DONE = "done"


class WorkItemPriority(str, enum.Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"


class WorkItem(Base):
    __tablename__ = "work_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    status: Mapped[WorkItemStatus] = mapped_column(
        Enum(WorkItemStatus, name="work_item_status"),
        default=WorkItemStatus.OPEN,
        nullable=False,
    )
    priority: Mapped[WorkItemPriority] = mapped_column(
        Enum(WorkItemPriority, name="work_item_priority"),
        default=WorkItemPriority.MEDIUM,
        nullable=False,
    )

    created_by_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), nullable=False, index=True
    )
    assignee_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"), nullable=True, index=True
    )
    team_id: Mapped[int | None] = mapped_column(
        ForeignKey("teams.id"), nullable=True, index=True
    )

    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    creator = relationship("User", foreign_keys=[created_by_id])
    assignee = relationship("User", foreign_keys=[assignee_id])
    team = relationship("Team")
