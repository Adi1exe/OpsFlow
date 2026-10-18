
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.models.work_item import WorkItem, WorkItemStatus, WorkItemPriority
from app.schemas.work_item import WorkItemCreate, WorkItemRead, WorkItemUpdate

router = APIRouter(prefix="/api/work-items", tags=["work-items"])


@router.post("/", response_model=WorkItemRead, status_code=status.HTTP_201_CREATED)
def create_work_item(
    payload: WorkItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = WorkItem(
        title=payload.title.strip(),
        description=payload.description,
        priority=payload.priority,
        team_id=payload.team_id,
        assignee_id=payload.assignee_id,
        created_by_id=current_user.id,
    )

    if not item.title:
        raise HTTPException(status_code=422, detail="Title cannot be blank")

    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.get("/", response_model=list[WorkItemRead])
def list_work_items(
    search: str | None = Query(default=None, max_length=200),
    status_filter: WorkItemStatus | None = Query(default=None, alias="status"),
    priority: WorkItemPriority | None = None,
    assignee_id: int | None = Query(default=None, ge=1),
    team_id: int | None = Query(default=None, ge=1),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(WorkItem)

    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.where(
            or_(
                WorkItem.title.ilike(term),
                WorkItem.description.ilike(term),
            )
        )

    if status_filter:
        query = query.where(WorkItem.status == status_filter)

    if priority:
        query = query.where(WorkItem.priority == priority)

    if assignee_id:
        query = query.where(WorkItem.assignee_id == assignee_id)

    if team_id:
        query = query.where(WorkItem.team_id == team_id)

    query = query.order_by(WorkItem.created_at.desc(), WorkItem.id.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)

    return list(db.scalars(query).all())


@router.get("/{item_id}", response_model=WorkItemRead)
def get_work_item(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = db.get(WorkItem, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Work item not found")
    return item


@router.patch("/{item_id}", response_model=WorkItemRead)
def update_work_item(
    item_id: int,
    payload: WorkItemUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    changes = payload.model_dump(exclude_unset=True)
    expected_version = changes.pop("version")

    item = db.get(WorkItem, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Work item not found")

    if item.version != expected_version:
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Work item was modified by another request",
                "current_version": item.version,
            },
        )

    if "title" in changes:
        changes["title"] = changes["title"].strip()
        if not changes["title"]:
            raise HTTPException(status_code=422, detail="Title cannot be blank")

    for field, value in changes.items():
        setattr(item, field, value)

    item.version += 1

    db.commit()
    db.refresh(item)
    return item
