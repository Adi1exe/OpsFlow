from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.work_item import WorkItemPriority, WorkItemStatus

class WorkItemCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = None
    priority: WorkItemPriority = WorkItemPriority.MEDIUM
    team_id: int | None = None
    assignee_id: int | None = None


class WorkItemUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    priority: WorkItemPriority | None = None
    status: WorkItemStatus | None = None
    team_id: int | None = None
    assignee_id: int | None = None
    version: int = Field(ge=1)


class WorkItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str | None
    status: WorkItemStatus
    priority: WorkItemPriority
    created_by_id: int
    assignee_id: int | None
    team_id: int | None
    version: int
    created_at: datetime
    updated_at: datetime