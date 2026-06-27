import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.orm import Session

from invest_assistant.modules.knowledge_base.models import (
    KnowledgeAgent,
    KnowledgeFeedbackLog,
    KnowledgeNote,
    KnowledgeNoteGroup,
    KnowledgeNoteTagRelation,
    KnowledgePrompt,
    KnowledgeSkill,
    ensure_knowledge_base_schema,
)
from invest_assistant.modules.knowledge_base.schemas import (
    KnowledgeAgentCreate,
    KnowledgeNoteCreate,
    KnowledgeNoteGroupCreate,
    KnowledgeNoteGroupRead,
    KnowledgeNotePage,
    KnowledgeNoteRead,
    KnowledgeNoteTagRead,
    KnowledgePromptCreate,
    KnowledgePromptRead,
    KnowledgeSkillCreate,
)
from invest_assistant.modules.market_radar.models import Tag

DEEPSEEK_HOTWORD_PROMPT_KEY = "market_radar.extract_daily_hotwords_deepseek"
DEEPSEEK_MARKET_DAILY_REPORT_PROMPT_KEY = "market_radar.generate_daily_report"
DEEPSEEK_STOCK_EVENT_REVIEW_PROMPT_KEY = "stock_analysis.review_stock_events_deepseek"
DEEPSEEK_TRACK_EVENT_REVIEW_PROMPT_KEY = "track_discovery.review_track_events_deepseek"

PROJECT_ROOT = Path(__file__).resolve().parents[3]
PROMPT_ROOT = Path(__file__).resolve().with_name("prompts")
PLACEHOLDER_PATTERN = re.compile(r"\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}")


@dataclass(frozen=True)
class ResolvedPrompt:
    id: int | None
    prompt_key: str
    title: str
    target_task: str
    provider: str
    model: str
    system_prompt: str
    user_prompt: str
    response_format: str
    status: str
    created_at: Any = None
    updated_at: Any = None


def _prompt_path(relative_path: str) -> str:
    return (PROMPT_ROOT / relative_path).relative_to(PROJECT_ROOT).as_posix()


def _resolve_prompt_path(stored_path: str) -> Path:
    path = Path(str(stored_path or "").strip())
    if path.is_absolute():
        resolved = path.resolve()
    else:
        resolved = (PROJECT_ROOT / path).resolve()
    if not resolved.is_relative_to(PROMPT_ROOT):
        raise ValueError(f"prompt path must be under {PROMPT_ROOT}: {stored_path}")
    return resolved


def _read_prompt_path(stored_path: str) -> str:
    path = _resolve_prompt_path(stored_path)
    if not path.exists():
        raise ValueError(f"prompt file not found: {stored_path}")
    return path.read_text(encoding="utf-8").strip()


def _is_prompt_path(value: str) -> bool:
    try:
        _resolve_prompt_path(value)
    except ValueError:
        return False
    return True


def _render_prompt_template(template: str, variables: dict[str, Any] | None = None) -> str:
    values = variables or {}

    def replace(match: re.Match) -> str:
        key = match.group(1)
        return str(values.get(key, match.group(0)))

    return PLACEHOLDER_PATTERN.sub(replace, template)


def _prompt_file_pair(prompt_key: str) -> tuple[str, str]:
    parts = [
        re.sub(r"[^a-zA-Z0-9_-]+", "_", part).strip("_") or "prompt"
        for part in str(prompt_key or "custom_prompt").split(".")
    ]
    base = "/".join(parts)
    return _prompt_path(f"{base}/system.md"), _prompt_path(f"{base}/user.md")


def resolve_prompt_content(prompt, variables: dict[str, Any] | None = None) -> ResolvedPrompt:
    return ResolvedPrompt(
        id=getattr(prompt, "id", None),
        prompt_key=prompt.prompt_key,
        title=prompt.title,
        target_task=prompt.target_task,
        provider=prompt.provider,
        model=prompt.model,
        system_prompt=_render_prompt_template(_read_prompt_path(prompt.system_prompt), variables),
        user_prompt=_render_prompt_template(_read_prompt_path(prompt.user_prompt), variables),
        response_format=prompt.response_format,
        status=prompt.status,
        created_at=getattr(prompt, "created_at", None),
        updated_at=getattr(prompt, "updated_at", None),
    )


def _prompt_read(item: KnowledgePrompt) -> KnowledgePromptRead:
    return KnowledgePromptRead.model_validate(resolve_prompt_content(item))


def _write_prompt_files(system_path: str, user_path: str, system_prompt: str, user_prompt: str) -> None:
    system_file = _resolve_prompt_path(system_path)
    user_file = _resolve_prompt_path(user_path)
    system_file.parent.mkdir(parents=True, exist_ok=True)
    user_file.parent.mkdir(parents=True, exist_ok=True)
    system_file.write_text(system_prompt, encoding="utf-8")
    user_file.write_text(user_prompt, encoding="utf-8")


def _prompt_stored_value_content(value: str) -> str:
    return _read_prompt_path(value) if _is_prompt_path(value) else value


def _ensure_custom_prompt_paths(item: KnowledgePrompt) -> bool:
    if _is_prompt_path(item.system_prompt) and _is_prompt_path(item.user_prompt):
        return False
    system_path, user_path = _prompt_file_pair(item.prompt_key)
    system_content = _prompt_stored_value_content(item.system_prompt)
    user_content = _prompt_stored_value_content(item.user_prompt)
    _write_prompt_files(system_path, user_path, system_content, user_content)
    item.system_prompt = system_path
    item.user_prompt = user_path
    return True


def _prompt_paths_for_payload(item: KnowledgePrompt | None, payload: KnowledgePromptCreate) -> tuple[str, str]:
    if item is not None and item.prompt_key == payload.prompt_key:
        try:
            _resolve_prompt_path(item.system_prompt)
            _resolve_prompt_path(item.user_prompt)
            return item.system_prompt, item.user_prompt
        except ValueError:
            pass
    return _prompt_file_pair(payload.prompt_key)
DEFAULT_KNOWLEDGE_PROMPTS = [
    KnowledgePromptCreate(
        prompt_key=DEEPSEEK_HOTWORD_PROMPT_KEY,
        title="DeepSeek 新闻热词候选",
        target_task=DEEPSEEK_HOTWORD_PROMPT_KEY,
        provider="deepseek",
        model="deepseek-v4-flash",
        system_prompt=_prompt_path("market_radar/extract_daily_hotwords_deepseek/system.md"),
        user_prompt=_prompt_path("market_radar/extract_daily_hotwords_deepseek/user.md"),
        response_format="json_object",
        status="active",
    ),
    KnowledgePromptCreate(
        prompt_key=DEEPSEEK_MARKET_DAILY_REPORT_PROMPT_KEY,
        title="DeepSeek 市场雷达日报",
        target_task=DEEPSEEK_MARKET_DAILY_REPORT_PROMPT_KEY,
        provider="deepseek",
        model="deepseek-v4-pro",
        system_prompt=_prompt_path("market_radar/generate_daily_report/system.md"),
        user_prompt=_prompt_path("market_radar/generate_daily_report/user.md"),
        response_format="text",
        status="active",
    ),
    KnowledgePromptCreate(
        prompt_key=DEEPSEEK_STOCK_EVENT_REVIEW_PROMPT_KEY,
        title="DeepSeek 标的事件审核",
        target_task=DEEPSEEK_STOCK_EVENT_REVIEW_PROMPT_KEY,
        provider="deepseek",
        model="deepseek-v4-pro",
        system_prompt=_prompt_path("stock_analysis/review_stock_events_deepseek/system.md"),
        user_prompt=_prompt_path("stock_analysis/review_stock_events_deepseek/user.md"),
        response_format="json_object",
        status="active",
    ),
    KnowledgePromptCreate(
        prompt_key=DEEPSEEK_TRACK_EVENT_REVIEW_PROMPT_KEY,
        title="DeepSeek 赛道事件审核",
        target_task=DEEPSEEK_TRACK_EVENT_REVIEW_PROMPT_KEY,
        provider="deepseek",
        model="deepseek-v4-pro",
        system_prompt=_prompt_path("track_discovery/review_track_events_deepseek/system.md"),
        user_prompt=_prompt_path("track_discovery/review_track_events_deepseek/user.md"),
        response_format="json_object",
        status="active",
    ),
]


def create_note_group(db: Session, payload: KnowledgeNoteGroupCreate) -> KnowledgeNoteGroup:
    item = KnowledgeNoteGroup(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def list_note_groups(db: Session, status: str | None = "active") -> list[KnowledgeNoteGroup]:
    stmt = select(KnowledgeNoteGroup).order_by(KnowledgeNoteGroup.sort_order.asc(), KnowledgeNoteGroup.id.asc())
    if status:
        stmt = stmt.where(KnowledgeNoteGroup.status == status)
    return list(db.scalars(stmt))


def get_note_group(db: Session, group_id: int) -> KnowledgeNoteGroup | None:
    return db.get(KnowledgeNoteGroup, group_id)


def update_note_group(db: Session, item: KnowledgeNoteGroup, payload: KnowledgeNoteGroupCreate) -> KnowledgeNoteGroup:
    for key, value in payload.model_dump().items():
        setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return item


def archive_note_group(db: Session, item: KnowledgeNoteGroup) -> KnowledgeNoteGroup:
    item.status = "archived"
    db.execute(update(KnowledgeNote).where(KnowledgeNote.group_id == item.id).values(group_id=None))
    db.commit()
    db.refresh(item)
    return item


def create_note(db: Session, payload: KnowledgeNoteCreate) -> KnowledgeNote:
    tags_by_id = _active_tags_by_id_or_raise(db, payload.tag_ids)
    data = _note_payload_data(payload, tags_by_id)
    item = KnowledgeNote(**data)
    db.add(item)
    db.commit()
    db.refresh(item)
    _replace_note_tags(db, item, payload.tag_ids)
    return item


def list_notes(
    db: Session,
    status: str | None = "active",
    group_id: int | None = None,
    tag_id: int | None = None,
    q: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> KnowledgeNotePage:
    safe_limit = max(1, min(limit, 100))
    safe_offset = max(0, offset)
    stmt = select(KnowledgeNote)
    count_stmt = select(func.count(KnowledgeNote.id))
    conditions = []
    if status:
        conditions.append(KnowledgeNote.status == status)
    if group_id is not None:
        conditions.append(KnowledgeNote.group_id == group_id)
    if tag_id is not None:
        note_ids_for_tag = select(KnowledgeNoteTagRelation.note_id).where(KnowledgeNoteTagRelation.tag_id == tag_id)
        conditions.append(KnowledgeNote.id.in_(note_ids_for_tag))
    if q:
        pattern = f"%{q.strip()}%"
        conditions.append(or_(KnowledgeNote.title.like(pattern), KnowledgeNote.content.like(pattern), KnowledgeNote.tags.like(pattern)))
    for condition in conditions:
        stmt = stmt.where(condition)
        count_stmt = count_stmt.where(condition)
    total = db.scalar(count_stmt) or 0
    rows = list(db.scalars(stmt.order_by(KnowledgeNote.id.desc()).limit(safe_limit).offset(safe_offset)))
    return KnowledgeNotePage(
        items=_note_reads(db, rows),
        total=total,
        limit=safe_limit,
        offset=safe_offset,
        has_more=safe_offset + len(rows) < total,
    )


def get_note(db: Session, note_id: int) -> KnowledgeNote | None:
    return db.get(KnowledgeNote, note_id)


def read_note(db: Session, item: KnowledgeNote) -> KnowledgeNoteRead:
    return _note_reads(db, [item])[0]


def update_note(db: Session, item: KnowledgeNote, payload: KnowledgeNoteCreate) -> KnowledgeNote:
    tags_by_id = _active_tags_by_id_or_raise(db, payload.tag_ids)
    data = _note_payload_data(payload, tags_by_id)
    for key, value in data.items():
        setattr(item, key, value)
    db.commit()
    db.refresh(item)
    _replace_note_tags(db, item, payload.tag_ids)
    db.refresh(item)
    return item


def archive_note(db: Session, item: KnowledgeNote) -> KnowledgeNote:
    item.status = "archived"
    db.commit()
    db.refresh(item)
    return item


def delete_note(db: Session, item: KnowledgeNote) -> KnowledgeNote:
    item.status = "deleted"
    db.commit()
    db.refresh(item)
    return item


def restore_note(db: Session, item: KnowledgeNote) -> KnowledgeNote:
    item.status = "active"
    db.commit()
    db.refresh(item)
    return item


def create_skill(db: Session, payload: KnowledgeSkillCreate) -> KnowledgeSkill:
    item = KnowledgeSkill(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def list_skills(db: Session) -> list[KnowledgeSkill]:
    return list(db.scalars(select(KnowledgeSkill).order_by(KnowledgeSkill.id.desc())))


def create_agent(db: Session, payload: KnowledgeAgentCreate) -> KnowledgeAgent:
    item = KnowledgeAgent(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def list_agents(db: Session) -> list[KnowledgeAgent]:
    return list(db.scalars(select(KnowledgeAgent).order_by(KnowledgeAgent.id.desc())))


def get_agent(db: Session, agent_id: int) -> KnowledgeAgent | None:
    return db.get(KnowledgeAgent, agent_id)


def create_prompt(db: Session, payload: KnowledgePromptCreate) -> KnowledgePromptRead:
    system_path, user_path = _prompt_paths_for_payload(None, payload)
    _write_prompt_files(system_path, user_path, payload.system_prompt, payload.user_prompt)
    data = payload.model_dump()
    data["system_prompt"] = system_path
    data["user_prompt"] = user_path
    item = KnowledgePrompt(**data)
    db.add(item)
    db.commit()
    db.refresh(item)
    return _prompt_read(item)


def ensure_default_prompts(db: Session) -> int:
    changed = 0
    default_keys = {payload.prompt_key for payload in DEFAULT_KNOWLEDGE_PROMPTS}
    for payload in DEFAULT_KNOWLEDGE_PROMPTS:
        existing = db.scalar(select(KnowledgePrompt).where(KnowledgePrompt.prompt_key == payload.prompt_key))
        if existing is not None:
            if existing.system_prompt != payload.system_prompt or existing.user_prompt != payload.user_prompt:
                existing.system_prompt = payload.system_prompt
                existing.user_prompt = payload.user_prompt
                changed += 1
            continue
        db.add(KnowledgePrompt(**payload.model_dump()))
        changed += 1
    custom_prompts = db.scalars(
        select(KnowledgePrompt).where(KnowledgePrompt.prompt_key.not_in(default_keys), KnowledgePrompt.status != "deleted")
    )
    for item in custom_prompts:
        if _ensure_custom_prompt_paths(item):
            changed += 1
    if changed:
        db.commit()
    return changed


def list_prompts(db: Session) -> list[KnowledgePromptRead]:
    rows = list(db.scalars(select(KnowledgePrompt).where(KnowledgePrompt.status != "deleted").order_by(KnowledgePrompt.id.desc())))
    return [_prompt_read(item) for item in rows]


def get_prompt(db: Session, prompt_id: int) -> KnowledgePrompt | None:
    return db.get(KnowledgePrompt, prompt_id)


def get_active_prompt_by_key(
    db: Session,
    prompt_key: str,
    variables: dict[str, Any] | None = None,
) -> ResolvedPrompt | None:
    item = db.scalar(select(KnowledgePrompt).where(KnowledgePrompt.prompt_key == prompt_key, KnowledgePrompt.status == "active"))
    return resolve_prompt_content(item, variables=variables) if item is not None else None


def update_prompt(db: Session, item: KnowledgePrompt, payload: KnowledgePromptCreate) -> KnowledgePromptRead:
    system_path, user_path = _prompt_paths_for_payload(item, payload)
    _write_prompt_files(system_path, user_path, payload.system_prompt, payload.user_prompt)
    data = payload.model_dump()
    data["system_prompt"] = system_path
    data["user_prompt"] = user_path
    for key, value in data.items():
        setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return _prompt_read(item)


def delete_prompt(db: Session, item: KnowledgePrompt) -> KnowledgePromptRead:
    item.status = "deleted"
    db.commit()
    db.refresh(item)
    return _prompt_read(item)


def run_agent(db: Session, agent: KnowledgeAgent) -> KnowledgeFeedbackLog:
    log = KnowledgeFeedbackLog(
        agent_id=agent.id,
        target_module=agent.target_module,
        target_id=None,
        feedback_type="agent_run",
        result_summary=f"agent {agent.name} queued feedback for {agent.target_module}",
        effectiveness=None,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


def list_feedback_logs(db: Session) -> list[KnowledgeFeedbackLog]:
    return list(db.scalars(select(KnowledgeFeedbackLog).order_by(KnowledgeFeedbackLog.id.desc())))


def _note_payload_data(payload: KnowledgeNoteCreate, tags_by_id: dict[int, Tag]) -> dict:
    data = payload.model_dump(exclude={"tag_ids"})
    content = str(data.get("content") or "")
    data["content"] = content
    title = str(data.get("title") or "").strip()
    data["title"] = title or _derive_note_title(content)
    data["tags"] = _tags_text(payload.tag_ids, tags_by_id) if payload.tag_ids else data.get("tags")
    return data


def _derive_note_title(content: str) -> str:
    first_line = next((line.strip() for line in content.splitlines() if line.strip()), "未命名笔记")
    return f"{first_line[:80]}..." if len(first_line) > 80 else first_line


def _replace_note_tags(db: Session, item: KnowledgeNote, tag_ids: list[int]) -> None:
    unique_tag_ids = list(dict.fromkeys(tag_ids))
    db.execute(delete(KnowledgeNoteTagRelation).where(KnowledgeNoteTagRelation.note_id == item.id))
    for tag_id in unique_tag_ids:
        db.add(KnowledgeNoteTagRelation(note_id=item.id, tag_id=tag_id))
    db.commit()


def _active_tags_by_id_or_raise(db: Session, tag_ids: list[int]) -> dict[int, Tag]:
    unique_tag_ids = list(dict.fromkeys(tag_ids))
    if not unique_tag_ids:
        return {}
    tags = list(db.scalars(select(Tag).where(Tag.id.in_(unique_tag_ids), Tag.status == "active")))
    by_id = {tag.id: tag for tag in tags}
    missing_ids = [tag_id for tag_id in unique_tag_ids if tag_id not in by_id]
    if missing_ids:
        raise ValueError(f"tag not found or inactive: {missing_ids[0]}")
    return by_id


def _tags_text(tag_ids: list[int], by_id: dict[int, Tag]) -> str:
    unique_tag_ids = list(dict.fromkeys(tag_ids))
    return " ".join(f"#{by_id[tag_id].name}" for tag_id in unique_tag_ids if tag_id in by_id)


def _note_reads(db: Session, rows: list[KnowledgeNote]) -> list[KnowledgeNoteRead]:
    if not rows:
        return []
    group_ids = {row.group_id for row in rows if row.group_id is not None}
    note_ids = [row.id for row in rows]
    groups = {
        group.id: group
        for group in db.scalars(select(KnowledgeNoteGroup).where(KnowledgeNoteGroup.id.in_(group_ids))).all()
    } if group_ids else {}
    relation_rows = db.execute(
        select(KnowledgeNoteTagRelation.note_id, Tag)
        .join(Tag, Tag.id == KnowledgeNoteTagRelation.tag_id)
        .where(KnowledgeNoteTagRelation.note_id.in_(note_ids))
        .order_by(KnowledgeNoteTagRelation.id.asc())
    ).all()
    tags_by_note: dict[int, list[Tag]] = {}
    for note_id, tag in relation_rows:
        tags_by_note.setdefault(note_id, []).append(tag)
    return [
        KnowledgeNoteRead(
            id=row.id,
            title=row.title,
            content=row.content,
            note_type=row.note_type,
            group_id=row.group_id,
            related_module=row.related_module,
            related_id=row.related_id,
            tags_text=row.tags,
            status=row.status,
            created_at=row.created_at,
            updated_at=row.updated_at,
            group=KnowledgeNoteGroupRead.model_validate(groups[row.group_id]) if row.group_id in groups else None,
            tags=[KnowledgeNoteTagRead.model_validate(tag) for tag in tags_by_note.get(row.id, [])],
        )
        for row in rows
    ]
