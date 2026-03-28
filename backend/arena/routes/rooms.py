"""Shared research rooms — /api/rooms/*"""

from __future__ import annotations

import logging
import re
import secrets
from datetime import datetime
from typing import Any, Optional
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from arena.config import get_settings
from arena.core.auth import get_current_user_optional_orm, get_current_user_required_orm
from arena.core.room_synthesiser import synthesise_room
from arena.database import SessionLocal, get_db
from arena.db_models import AgentTask, Room, RoomMember, RoomTask, User

logger = logging.getLogger(__name__)

router = APIRouter(tags=["rooms"])

MAX_ROOM_MEMBERS = 20


def _slugify(name: str) -> str:
    s = (name or "").strip().lower()
    s = re.sub(r"[^a-z0-9\s-]", "", s)
    s = re.sub(r"[\s_]+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return (s[:50] if s else "room").strip("-") or "room"


def _share_url(slug: str) -> str:
    base = (get_settings().frontend_public_url or "").rstrip("/")
    return f"{base}/room/{slug}"


def _room_to_dict(
    room: Room,
    db: Session,
    *,
    member_count: Optional[int] = None,
    task_count: Optional[int] = None,
) -> dict[str, Any]:
    if member_count is None:
        member_count = (
            db.query(func.count(RoomMember.id)).filter(RoomMember.room_id == room.id).scalar() or 0
        )
    if task_count is None:
        task_count = (
            db.query(func.count(RoomTask.id)).filter(RoomTask.room_id == room.id).scalar() or 0
        )
    return {
        "id": room.id,
        "name": room.name,
        "slug": room.slug,
        "share_url": _share_url(room.slug),
        "creator_id": room.creator_id,
        "synthesis": room.synthesis,
        "synthesis_updated_at": room.synthesis_updated_at.isoformat()
        if room.synthesis_updated_at
        else None,
        "is_active": bool(room.is_active),
        "created_at": room.created_at.isoformat() if room.created_at else None,
        "member_count": int(member_count),
        "task_count": int(task_count),
    }


def _member_task_counts(db: Session, room_id: str) -> dict[int, int]:
    rows = (
        db.query(RoomTask.user_id, func.count(RoomTask.id))
        .filter(RoomTask.room_id == room_id)
        .group_by(RoomTask.user_id)
        .all()
    )
    return {int(uid): int(c) for uid, c in rows}


async def run_room_synthesis(slug: str) -> None:
    db = SessionLocal()
    try:
        room = db.query(Room).filter(Room.slug == slug, Room.is_active.is_(True)).first()
        if not room:
            return
        rts = (
            db.query(RoomTask)
            .filter(RoomTask.room_id == room.id)
            .order_by(RoomTask.added_at.asc())
            .all()
        )
        if len(rts) < 2:
            return
        task_ids = [rt.task_id for rt in rts]
        tasks_unordered = db.query(AgentTask).filter(AgentTask.task_id.in_(task_ids)).all()
        by_tid = {t.task_id: t for t in tasks_unordered}
        tasks = [by_tid[tid] for tid in task_ids if tid in by_tid]
        if len(tasks) < 2:
            return

        user_ids = list({rt.user_id for rt in rts})
        members = db.query(User).filter(User.id.in_(user_ids)).all()

        result = await synthesise_room(room, tasks, members)
        if result:
            room.synthesis = result
            room.synthesis_updated_at = datetime.utcnow()
            db.add(room)
            db.commit()
    except Exception as exc:
        logger.exception("run_room_synthesis failed: %s", exc)
        try:
            db.rollback()
        except Exception:
            pass
    finally:
        db.close()


def _schedule_synthesis(background_tasks: BackgroundTasks, slug: str) -> None:
    background_tasks.add_task(run_room_synthesis, slug)


class CreateRoomBody(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    task_id: Optional[str] = None


class AddTaskBody(BaseModel):
    task_id: str = Field(..., min_length=1)


def _ensure_unique_slug(db: Session, base_slug: str) -> str:
    candidate = base_slug
    for _ in range(12):
        exists = db.query(Room.id).filter(Room.slug == candidate).first()
        if not exists:
            return candidate
        suffix = secrets.token_hex(2)[:3]
        candidate = f"{base_slug}-{suffix}"
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Could not allocate unique room slug",
    )


@router.post("/create")
async def create_room(
    body: CreateRoomBody,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user_required_orm),
) -> dict[str, Any]:
    rid = str(uuid4())
    short = rid.replace("-", "")[:5]
    base = f"{_slugify(body.name)}-{short}"
    slug = _ensure_unique_slug(db, base)

    room = Room(
        id=rid,
        name=body.name.strip()[:255],
        slug=slug,
        creator_id=user.id,
        is_active=True,
    )
    task_row: Optional[AgentTask] = None
    if body.task_id:
        task_row = (
            db.query(AgentTask)
            .filter(AgentTask.task_id == body.task_id.strip(), AgentTask.user_id == user.id)
            .first()
        )
        if not task_row:
            raise HTTPException(status_code=400, detail="Task not found or not owned by you")

    db.add(room)
    db.flush()

    now = datetime.utcnow()
    member = RoomMember(room_id=room.id, user_id=user.id, joined_at=now, last_seen_at=now)
    db.add(member)

    if task_row:
        db.add(
            RoomTask(
                room_id=room.id,
                task_id=task_row.task_id,
                user_id=user.id,
            )
        )

    db.commit()
    db.refresh(room)

    if task_row:
        _schedule_synthesis(background_tasks, room.slug)

    return _room_to_dict(room, db)


@router.get("/my-rooms")
async def my_rooms(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user_required_orm),
) -> dict[str, Any]:
    q = (
        db.query(Room)
        .join(RoomMember, RoomMember.room_id == Room.id)
        .filter(
            RoomMember.user_id == user.id,
            Room.is_active.is_(True),
        )
        .order_by(desc(Room.synthesis_updated_at), desc(Room.created_at))
        .limit(5)
    )
    rooms = q.all()
    return {
        "rooms": [_room_to_dict(r, db) for r in rooms],
    }


@router.get("/{slug}/synthesis")
async def get_synthesis(
    slug: str,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    room = db.query(Room).filter(Room.slug == slug).first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    return {
        "synthesis": room.synthesis,
        "synthesis_updated_at": room.synthesis_updated_at.isoformat()
        if room.synthesis_updated_at
        else None,
    }


@router.get("/{slug}")
async def get_room(
    slug: str,
    db: Session = Depends(get_db),
    current: Optional[User] = Depends(get_current_user_optional_orm),
) -> dict[str, Any]:
    room = db.query(Room).filter(Room.slug == slug).first()
    if not room or not room.is_active:
        raise HTTPException(status_code=404, detail="Room not found")

    if current:
        rm = (
            db.query(RoomMember)
            .filter(RoomMember.room_id == room.id, RoomMember.user_id == current.id)
            .first()
        )
        if not rm:
            n = (
                db.query(func.count(RoomMember.id))
                .filter(RoomMember.room_id == room.id)
                .scalar()
                or 0
            )
            if int(n) < MAX_ROOM_MEMBERS:
                now = datetime.utcnow()
                db.add(
                    RoomMember(
                        room_id=room.id,
                        user_id=current.id,
                        joined_at=now,
                        last_seen_at=now,
                    )
                )
                db.commit()
            else:
                pass
        else:
            rm.last_seen_at = datetime.utcnow()
            db.add(rm)
            db.commit()

    return _build_room_payload(db, room)


def _build_room_payload(db: Session, room: Room) -> dict[str, Any]:
    members_q = (
        db.query(RoomMember, User)
        .join(User, User.id == RoomMember.user_id)
        .filter(RoomMember.room_id == room.id)
        .all()
    )
    task_counts = _member_task_counts(db, room.id)
    member_list = []
    for rm, u in members_q:
        member_list.append(
            {
                "user_id": u.id,
                "name": (u.name or "").strip() or u.email.split("@")[0],
                "email": u.email,
                "last_seen_at": rm.last_seen_at.isoformat() if rm.last_seen_at else None,
                "task_count": task_counts.get(u.id, 0),
            }
        )

    rts = (
        db.query(RoomTask, AgentTask)
        .join(AgentTask, AgentTask.task_id == RoomTask.task_id)
        .filter(RoomTask.room_id == room.id)
        .order_by(RoomTask.added_at.desc())
        .all()
    )
    tasks_out = []
    for rt, at in rts:
        tasks_out.append(
            {
                "task_id": at.task_id,
                "user_id": at.user_id,
                "question": (at.task_text or "")[:500],
                "final_answer": at.final_answer,
                "final_score": at.final_score,
                "created_at": at.created_at.isoformat() if at.created_at else None,
            }
        )

    base = _room_to_dict(room, db)
    base["members"] = member_list
    base["tasks"] = tasks_out
    return base


@router.post("/{slug}/join")
async def join_room(
    slug: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user_required_orm),
) -> dict[str, Any]:
    room = db.query(Room).filter(Room.slug == slug, Room.is_active.is_(True)).first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    existing = (
        db.query(RoomMember)
        .filter(RoomMember.room_id == room.id, RoomMember.user_id == user.id)
        .first()
    )
    if existing:
        existing.last_seen_at = datetime.utcnow()
        db.add(existing)
        db.commit()
    else:
        n = (
            db.query(func.count(RoomMember.id)).filter(RoomMember.room_id == room.id).scalar() or 0
        )
        if int(n) >= MAX_ROOM_MEMBERS:
            raise HTTPException(status_code=400, detail="Room is full")
        now = datetime.utcnow()
        db.add(RoomMember(room_id=room.id, user_id=user.id, joined_at=now, last_seen_at=now))
        db.commit()

    members_q = (
        db.query(RoomMember, User)
        .join(User, User.id == RoomMember.user_id)
        .filter(RoomMember.room_id == room.id)
        .all()
    )
    task_counts = _member_task_counts(db, room.id)
    member_list = []
    for rm, u in members_q:
        member_list.append(
            {
                "user_id": u.id,
                "name": (u.name or "").strip() or u.email.split("@")[0],
                "email": u.email,
                "last_seen_at": rm.last_seen_at.isoformat() if rm.last_seen_at else None,
                "task_count": task_counts.get(u.id, 0),
            }
        )
    return {"members": member_list}


@router.post("/{slug}/add-task")
async def add_task_to_room(
    slug: str,
    body: AddTaskBody,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user_required_orm),
) -> dict[str, Any]:
    room = db.query(Room).filter(Room.slug == slug, Room.is_active.is_(True)).first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    is_member = (
        db.query(RoomMember)
        .filter(RoomMember.room_id == room.id, RoomMember.user_id == user.id)
        .first()
    )
    if not is_member:
        raise HTTPException(status_code=403, detail="Not a room member")

    at = (
        db.query(AgentTask)
        .filter(AgentTask.task_id == body.task_id.strip(), AgentTask.user_id == user.id)
        .first()
    )
    if not at:
        raise HTTPException(status_code=400, detail="Task not found or not owned by you")

    dup = (
        db.query(RoomTask)
        .filter(RoomTask.room_id == room.id, RoomTask.task_id == at.task_id)
        .first()
    )
    if dup:
        db.refresh(room)
        return _build_room_payload(db, room)

    db.add(
        RoomTask(
            room_id=room.id,
            task_id=at.task_id,
            user_id=user.id,
        )
    )
    db.commit()

    _schedule_synthesis(background_tasks, room.slug)

    db.refresh(room)
    return _build_room_payload(db, room)


@router.post("/{slug}/remove-task/{task_id}")
async def remove_task_from_room(
    slug: str,
    task_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user_required_orm),
) -> dict[str, Any]:
    room = db.query(Room).filter(Room.slug == slug, Room.is_active.is_(True)).first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    rt = (
        db.query(RoomTask)
        .filter(RoomTask.room_id == room.id, RoomTask.task_id == task_id)
        .first()
    )
    if not rt:
        raise HTTPException(status_code=404, detail="Task not in room")

    if rt.user_id != user.id and room.creator_id != user.id:
        raise HTTPException(status_code=403, detail="Not allowed to remove this task")

    db.delete(rt)
    db.commit()

    _schedule_synthesis(background_tasks, room.slug)

    db.refresh(room)
    return _build_room_payload(db, room)


@router.delete("/{slug}")
async def delete_room(
    slug: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user_required_orm),
) -> dict[str, Any]:
    room = db.query(Room).filter(Room.slug == slug).first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    if room.creator_id != user.id:
        raise HTTPException(status_code=403, detail="Only the creator can delete this room")

    room.is_active = False
    db.add(room)
    db.commit()
    return {"success": True}
