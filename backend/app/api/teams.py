from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.db.session import get_db
from app.models.membership import TeamMembership
from app.models.team import Team
from app.models.user import User

router = APIRouter(prefix="/api/teams", tags=["teams"])


class TeamCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)


class MemberCreate(BaseModel):
    email: EmailStr
    role: str = Field(default="member", pattern="^(member|team_lead)$")


@router.get("")
def list_my_teams(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = db.execute(
        select(Team, TeamMembership.role)
        .join(TeamMembership, TeamMembership.team_id == Team.id)
        .where(TeamMembership.user_id == user.id)
        .order_by(Team.name)
    ).all()
    return [{"id": team.id, "name": team.name, "role": role} for team, role in rows]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_team(payload: TeamCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    name = payload.name.strip()
    if len(name) < 2:
        raise HTTPException(status_code=422, detail="Team name must contain at least two characters.")
    if db.scalar(select(Team.id).where(Team.name == name)):
        raise HTTPException(status_code=409, detail="A team with this name already exists.")
    team = Team(name=name)
    db.add(team)
    db.flush()
    db.add(TeamMembership(user_id=user.id, team_id=team.id, role="admin"))
    db.commit()
    db.refresh(team)
    return {"id": team.id, "name": team.name, "role": "admin"}


@router.get("/{team_id}/members")
def list_members(team_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    membership = db.scalar(select(TeamMembership).where(
        TeamMembership.team_id == team_id, TeamMembership.user_id == user.id
    ))
    if membership is None:
        raise HTTPException(status_code=404, detail="Team not found.")
    rows = db.execute(select(User.id, User.full_name, User.email, TeamMembership.role)
                      .join(TeamMembership, TeamMembership.user_id == User.id)
                      .where(TeamMembership.team_id == team_id).order_by(User.full_name)).all()
    return [{"id": row.id, "full_name": row.full_name, "email": row.email, "role": row.role} for row in rows]


@router.post("/{team_id}/members", status_code=status.HTTP_201_CREATED)
def add_member(team_id: int, payload: MemberCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    manager = db.scalar(select(TeamMembership).where(
        TeamMembership.team_id == team_id, TeamMembership.user_id == user.id
    ))
    if manager is None or manager.role not in {"admin", "team_lead"}:
        raise HTTPException(status_code=403, detail="A team lead or admin is required to add members.")
    member = db.scalar(select(User).where(User.email == str(payload.email).lower()))
    if member is None:
        raise HTTPException(status_code=404, detail="Create an account for this person before inviting them.")
    existing = db.scalar(select(TeamMembership).where(
        TeamMembership.team_id == team_id, TeamMembership.user_id == member.id
    ))
    if existing is not None:
        raise HTTPException(status_code=409, detail="This person is already on the team.")
    if payload.role == "team_lead" and manager.role != "admin":
        raise HTTPException(status_code=403, detail="Only a team admin can appoint a team lead.")
    membership = TeamMembership(user_id=member.id, team_id=team_id, role=payload.role)
    db.add(membership)
    db.commit()
    return {"id": member.id, "full_name": member.full_name, "email": member.email, "role": membership.role}
