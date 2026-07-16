"""Shared research rooms — /api/rooms/*"""

from __future__ import annotations

import json
import logging
import re
import secrets
from datetime import datetime
from typing import Any, Optional
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from arena.config import get_settings
from arena.core.dependencies import get_current_user_optional_orm, get_current_user_required_orm
from arena.core.input_validation import sanitize_html, sanitize_model_html, sanitize_model_text
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

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        return sanitize_model_html(v, max_length=100, field_name="name")


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
        name=sanitize_html(body.name, max_length=100, field_name="room name"),
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
    result = []
    for r in rooms:
        d = _room_to_dict(r, db)
        rm = (
            db.query(RoomMember)
            .filter(RoomMember.room_id == r.id, RoomMember.user_id == user.id)
            .first()
        )
        d["last_seen_at"] = rm.last_seen_at.isoformat() if rm and rm.last_seen_at else None
        result.append(d)
    return {
        "rooms": result,
    }


@router.get("/{slug}/synthesis")
async def get_synthesis(
    slug: str,
    force: bool = False,
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db: Session = Depends(get_db),
    current: Optional[User] = Depends(get_current_user_optional_orm),
) -> dict[str, Any]:
    room = db.query(Room).filter(Room.slug == slug).first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    if force:
        # Regenerating synthesis triggers an expensive LLM call (synthesise_room).
        # Reading the cached synthesis stays open to match the shareable-link room
        # model, but forcing a refresh must be restricted to authenticated room
        # members — otherwise an anonymous caller who knows/guesses a slug could
        # repeatedly hit ?force=true and burn API credits (cost amplification / DoS).
        if current is None:
            raise HTTPException(
                status_code=401,
                detail="Authentication required to refresh synthesis",
            )
        is_member = (
            db.query(RoomMember)
            .filter(
                RoomMember.room_id == room.id,
                RoomMember.user_id == current.id,
            )
            .first()
        )
        if not is_member:
            raise HTTPException(
                status_code=403,
                detail="Only room members can refresh synthesis",
            )
        _schedule_synthesis(background_tasks, slug)
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
        raise HTTPException(status_code=404, detail="Room not found")

    at = (
        db.query(AgentTask)
        .filter(AgentTask.task_id == body.task_id.strip(), AgentTask.user_id == user.id)
        .first()
    )
    if not at:
        raise HTTPException(status_code=404, detail="Task not found")

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
        raise HTTPException(status_code=404, detail="Task not in room")

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
        raise HTTPException(status_code=404, detail="Room not found")

    room.is_active = False
    db.add(room)
    db.commit()
    return {"success": True}


def _extract_answer_snippet(raw: str | None, *, limit: int = 500) -> str:
    """Pull a readable snippet from free text or structured Agent final_answer JSON."""
    text = (raw or "").strip()
    if not text:
        return ""
    if text.startswith("{") or text.startswith("["):
        try:
            parsed = json.loads(text)
            if isinstance(parsed, dict):
                if parsed.get("one_liner"):
                    text = str(parsed["one_liner"])
                elif isinstance(parsed.get("sentences"), list):
                    text = " ".join(
                        str(s.get("text") or s) if isinstance(s, dict) else str(s)
                        for s in parsed["sentences"]
                    )
                elif parsed.get("final_answer"):
                    text = str(parsed["final_answer"])
                elif parsed.get("text"):
                    text = str(parsed["text"])
        except Exception:
            pass
    cleaned = re.sub(r"\s+", " ", text).strip()
    return cleaned[:limit]


def _tokenize_for_drift(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]{3,}", (text or "").lower()))


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def _build_perspective_drift(tasks: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Token-overlap drift analysis across room research answers.

    Higher drift_score = more divergent viewpoints (0–100).
    """
    if len(tasks) < 2:
        return {
            "drift_score": 0,
            "label": "insufficient",
            "perspective_clusters": [],
            "divergent_pairs": [],
            "mean_similarity": None,
        }

    tokens = [_tokenize_for_drift(t.get("answer") or "") for t in tasks]
    n = len(tasks)
    pairs: list[tuple[float, int, int]] = []
    for i in range(n):
        for j in range(i + 1, n):
            pairs.append((_jaccard(tokens[i], tokens[j]), i, j))

    mean_sim = sum(s for s, _, _ in pairs) / len(pairs) if pairs else 1.0
    # Invert similarity → drift; floor uniqueness of non-empty answers.
    non_empty = [t for t in tasks if (t.get("answer") or "").strip()]
    unique_ratio = (
        len({(t.get("answer") or "").strip().lower() for t in non_empty}) / len(non_empty)
        if non_empty
        else 0.0
    )
    drift_score = int(round(max(0.0, min(100.0, (1.0 - mean_sim) * 70.0 + unique_ratio * 30.0))))

    if drift_score >= 70:
        label = "high divergence"
    elif drift_score >= 40:
        label = "healthy spread"
    elif drift_score >= 15:
        label = "converging"
    else:
        label = "near consensus"

    # Greedy clusters: join tasks when similarity ≥ 0.35
    parent = list(range(n))

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a: int, b: int) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    for sim, i, j in pairs:
        if sim >= 0.35:
            union(i, j)

    groups: dict[int, list[int]] = {}
    for i in range(n):
        groups.setdefault(find(i), []).append(i)

    clusters: list[dict[str, Any]] = []
    for idxs in sorted(groups.values(), key=lambda g: (-len(g), g[0])):
        members = [tasks[i] for i in idxs]
        # Shared vocabulary as a rough theme hint
        shared: set[str] | None = None
        for i in idxs:
            tok = tokens[i]
            shared = set(tok) if shared is None else (shared & tok)
        theme_words = sorted(shared or [], key=len, reverse=True)[:4]
        theme = " · ".join(theme_words) if theme_words else "mixed viewpoints"
        clusters.append(
            {
                "size": len(members),
                "theme": theme,
                "members": [
                    {
                        "task_id": m["task_id"],
                        "user": m["user"],
                        "question": (m.get("question") or "")[:120],
                        "score": m.get("score") or 0,
                    }
                    for m in members
                ],
            }
        )

    divergent = sorted(pairs, key=lambda p: p[0])[:3]
    divergent_pairs = [
        {
            "similarity": round(sim, 3),
            "task_a": {
                "task_id": tasks[i]["task_id"],
                "user": tasks[i]["user"],
                "snippet": (tasks[i].get("answer") or "")[:160],
            },
            "task_b": {
                "task_id": tasks[j]["task_id"],
                "user": tasks[j]["user"],
                "snippet": (tasks[j].get("answer") or "")[:160],
            },
        }
        for sim, i, j in divergent
        if sim < 0.5
    ]

    return {
        "drift_score": drift_score,
        "label": label,
        "perspective_clusters": clusters,
        "divergent_pairs": divergent_pairs,
        "mean_similarity": round(mean_sim, 3),
    }


@router.get("/{slug}/perspective-drift")
async def get_perspective_drift(
    slug: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user_required_orm),
) -> dict[str, Any]:
    """
    Analyze how research perspectives have drifted across room tasks.

    Returns:
    - drift_score / label
    - perspective_clusters (similar answer groups)
    - divergent_pairs (most dissimilar task pairs)
    """
    room = db.query(Room).filter(Room.slug == slug, Room.is_active.is_(True)).first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    is_member = (
        db.query(RoomMember)
        .filter(RoomMember.room_id == room.id, RoomMember.user_id == user.id)
        .first()
    )
    if not is_member and room.creator_id != user.id:
        raise HTTPException(status_code=403, detail="Only room members can view perspective drift")

    rts = (
        db.query(RoomTask, AgentTask, User)
        .join(AgentTask, AgentTask.task_id == RoomTask.task_id)
        .join(User, User.id == AgentTask.user_id)
        .filter(RoomTask.room_id == room.id)
        .order_by(RoomTask.added_at.desc())
        .all()
    )

    if len(rts) < 2:
        return {
            "task_count": len(rts),
            "tasks": [],
            "drift_score": 0,
            "label": "insufficient",
            "perspective_clusters": [],
            "divergent_pairs": [],
            "mean_similarity": None,
            "message": "Need at least 2 tasks for drift analysis",
        }

    tasks_data: list[dict[str, Any]] = []
    for _rt, at, u in rts:
        topics = ""
        if at.topics:
            try:
                parsed_topics = json.loads(at.topics) if isinstance(at.topics, str) else at.topics
                if isinstance(parsed_topics, list):
                    topics = ", ".join(str(t) for t in parsed_topics[:6])
                else:
                    topics = str(parsed_topics)[:200]
            except Exception:
                topics = str(at.topics)[:200]

        answer = _extract_answer_snippet(at.final_answer)
        # Prefer conclusions/topics when the answer body is thin
        if len(answer) < 40 and at.key_conclusions:
            try:
                kc = (
                    json.loads(at.key_conclusions)
                    if isinstance(at.key_conclusions, str)
                    else at.key_conclusions
                )
                if isinstance(kc, list):
                    answer = "; ".join(str(x) for x in kc[:4])[:500]
                else:
                    answer = str(kc)[:500]
            except Exception:
                answer = str(at.key_conclusions)[:500]

        display_name = (u.name or "").strip() or (u.email.split("@")[0] if u.email else "member")
        tasks_data.append(
            {
                "task_id": at.task_id,
                "question": at.task_text or "",
                "answer": answer,
                "score": at.final_score or 0,
                "user": display_name,
                "topics": topics,
                "created_at": at.created_at.isoformat() if at.created_at else None,
            }
        )

    analysis = _build_perspective_drift(tasks_data)
    return {
        "task_count": len(tasks_data),
        "tasks": tasks_data,
        **analysis,
    }
