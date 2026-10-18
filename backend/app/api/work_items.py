
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import Session
from app.models.audit_log import AuditLog
from app.api.auth import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.models.work_item import WorkItem, WorkItemPriority, WorkItemStatus
from app.schemas.work_item import WorkItemCreate, WorkItemRead, WorkItemUpdate
from app.models.membership import TeamMembership

router = APIRouter(prefix="/api/work-items", tags=["work-items"])


def can_access_item(db: Session, item: WorkItem, user: User) -> bool:
    if item.created_by_id == user.id or item.assignee_id == user.id:
        return True
    if item.team_id is None:
        return False
    return db.scalar(select(TeamMembership.id).where(
        TeamMembership.user_id == user.id,
        TeamMembership.team_id == item.team_id,
    )) is not None


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

    if payload.team_id is not None and db.scalar(select(TeamMembership.id).where(
        TeamMembership.user_id == current_user.id,
        TeamMembership.team_id == payload.team_id,
    )) is None:
        raise HTTPException(status_code=403, detail="Join the team before creating work for it.")
    if payload.assignee_id is not None:
        assignee = db.get(User, payload.assignee_id)
        if assignee is None or (payload.team_id is not None and db.scalar(select(TeamMembership.id).where(
            TeamMembership.user_id == payload.assignee_id, TeamMembership.team_id == payload.team_id
        )) is None):
            raise HTTPException(status_code=422, detail="The assignee must be a member of the selected team.")

    if not item.title:
        raise HTTPException(status_code=422, detail="Title cannot be blank")

    db.add(item)
    db.flush()
    db.add(AuditLog(actor_id=current_user.id, entity_type="work_item", entity_id=item.id,
                    action="created", details={"title": item.title, "status": item.status.value}))
    db.commit()
    db.refresh(item)
    return item


@router.get("/{item_id}/activity")
def work_item_activity(
    item_id: int,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = db.get(WorkItem, item_id)
    if item is None or not can_access_item(db, item, current_user):
        raise HTTPException(status_code=404, detail="Work item not found.")
    rows = db.scalars(
        select(AuditLog)
        .where(AuditLog.entity_type == "work_item", AuditLog.entity_id == item_id)
        .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return [{"id": row.id, "actor_id": row.actor_id, "action": row.action,
             "details": row.details, "created_at": row.created_at} for row in rows]


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
    membership_team_ids = select(TeamMembership.team_id).where(
        TeamMembership.user_id == current_user.id
    )
    query = select(WorkItem).where(
        or_(WorkItem.created_by_id == current_user.id,
            WorkItem.assignee_id == current_user.id,
            WorkItem.team_id.in_(membership_team_ids))
    )

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
    if item is None or not can_access_item(db, item, current_user):
        raise HTTPException(status_code=404, detail="Work item not found")
    return item


@router.patch("/{item_id}", response_model=WorkItemRead)
def update_work_item(
    item_id: int,
    payload: WorkItemUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    changes = payload.model_dump(
        exclude={"version"},
        exclude_unset=True,
    )

    if not changes:
        raise HTTPException(
            status_code=422,
            detail="Provide at least one field to update.",
        )

    item = db.get(WorkItem, item_id)
    if item is None or not can_access_item(db, item, current_user):
        raise HTTPException(status_code=404, detail="Work item not found.")
    if "team_id" in changes and changes["team_id"] is not None and db.scalar(
        select(TeamMembership.id).where(TeamMembership.user_id == current_user.id,
                                        TeamMembership.team_id == changes["team_id"])
    ) is None:
        raise HTTPException(status_code=403, detail="Join the team before moving work to it.")
    effective_team_id = changes.get("team_id", item.team_id)
    if changes.get("assignee_id", item.assignee_id) is not None:
        assignee_id = changes.get("assignee_id", item.assignee_id)
        if effective_team_id is not None and db.scalar(select(TeamMembership.id).where(
            TeamMembership.user_id == assignee_id, TeamMembership.team_id == effective_team_id
        )) is None:
            raise HTTPException(status_code=422, detail="The assignee must be a member of the selected team.")
    if "title" in changes:
        changes["title"] = changes["title"].strip()
        if not changes["title"]:
            raise HTTPException(status_code=422, detail="Title cannot be blank.")
    before = {field: getattr(item, field).value if hasattr(getattr(item, field), "value") else getattr(item, field)
              for field in changes}

    # Atomically update only if the client's version is current.
    statement = (
        update(WorkItem)
        .where(
            WorkItem.id == item_id,
            WorkItem.version == payload.version,
        )
        .values(
            **changes,
            version=WorkItem.version + 1,
            updated_at=func.now(),
        )
    )

    result = db.execute(statement)

    if result.rowcount == 0:
        db.rollback()

        existing = db.get(WorkItem, item_id)

        if existing is None:
            raise HTTPException(
                status_code=404,
                detail="Work item not found.",
            )

        raise HTTPException(
            status_code=409,
            detail=(
                "Work item was modified by another request. "
                "Fetch the latest version and retry."
            ),
        )

    # Record the change in the same transaction.
    audit_entry = AuditLog(
        actor_id=current_user.id,
        entity_type="work_item",
        entity_id=item_id,
        action="updated",
        details={
            "fields": list(changes.keys()),
            "before": before,
            "after": {key: value.value if hasattr(value, "value") else value for key, value in changes.items()},
            "previous_version": payload.version,
            "new_version": payload.version + 1,
        },
    )
    db.add(audit_entry)

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise

    updated_item = db.get(WorkItem, item_id)
    return updated_item
