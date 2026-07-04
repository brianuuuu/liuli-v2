import hashlib
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.orm import Session

from invest_assistant.modules.basic.report_library import service as report_service
from invest_assistant.modules.knowledge_base.models import (
    KnowledgeNote,
    KnowledgeNoteGroup,
    KnowledgeNoteTagRelation,
    KnowledgePrompt,
    KnowledgeResearchFeedback,
    KnowledgeResearcher,
    ensure_knowledge_base_schema,
)
from invest_assistant.modules.knowledge_base.schemas import (
    KnowledgeExternalSkillFileContent,
    KnowledgeExternalSkillFileNode,
    KnowledgeExternalSkillRead,
    KnowledgeNoteCreate,
    KnowledgeNoteGroupCreate,
    KnowledgeNoteGroupRead,
    KnowledgeNotePage,
    KnowledgeNoteRead,
    KnowledgeNoteTagRead,
    KnowledgePromptCreate,
    KnowledgePromptRead,
    KnowledgeResearchFeedbackCreate,
    KnowledgeResearchFeedbackRead,
    KnowledgeResearcherCreate,
    KnowledgeResearcherRead,
)
from invest_assistant.modules.market_radar.models import Tag

DEEPSEEK_HOTWORD_PROMPT_KEY = "market_radar.extract_daily_hotwords_deepseek"
DEEPSEEK_MARKET_DAILY_REPORT_PROMPT_KEY = "market_radar.generate_daily_report"
DEEPSEEK_STOCK_EVENT_REVIEW_PROMPT_KEY = "stock_analysis.review_stock_events_deepseek"
DEEPSEEK_TRACK_EVENT_REVIEW_PROMPT_KEY = "track_discovery.review_track_events_deepseek"
RETIRED_DEFAULT_PROMPT_KEYS = {"market_radar.suggest_hotword_merges_deepseek"}

PROJECT_ROOT = Path(__file__).resolve().parents[3]
KNOWLEDGE_BASE_ROOT = Path(__file__).resolve().parent
PROMPT_ROOT = Path(__file__).resolve().with_name("prompts")
EXTERNAL_ROOT = Path(__file__).resolve().with_name("external")
EXTERNAL_SKILL_ROOT = EXTERNAL_ROOT / "skills"
RESEARCHER_PROFILE_ROOT = EXTERNAL_ROOT / "researchers"
PLACEHOLDER_PATTERN = re.compile(r"\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}")
RESEARCHER_CODE_PATTERN = re.compile(r"^[A-Za-z0-9_-]+$")
RESEARCHER_PROFILE_SECTIONS = {
    "简介 intro": "intro",
    "简介": "intro",
    "价值观 soul": "soul",
    "方法论 method": "method",
}
RESEARCHER_PROFILE_SECTION_PATTERN = re.compile(
    r"^##(?!#)\s*(.+?)\s*$",
    re.MULTILINE,
)


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


def _resolve_external_skill_path(path: str) -> Path:
    root = EXTERNAL_SKILL_ROOT.resolve()
    raw_path = Path(str(path or "").strip())
    if raw_path.is_absolute():
        resolved = raw_path.resolve()
    else:
        resolved = (root / raw_path).resolve()
    if not resolved.is_relative_to(root):
        raise ValueError("external skill file path is outside root")
    return resolved


def _external_skill_relative_path(path: Path) -> str:
    return path.resolve().relative_to(EXTERNAL_SKILL_ROOT.resolve()).as_posix()


def _file_updated_at(path: Path) -> datetime | None:
    if not path.exists():
        return None
    return datetime.fromtimestamp(path.stat().st_mtime)


def _parse_skill_frontmatter(content: str) -> dict[str, str]:
    if not content.startswith("---"):
        return {}
    lines = content.splitlines()
    if not lines or lines[0].strip() != "---":
        return {}
    metadata: dict[str, str] = {}
    for line in lines[1:]:
        if line.strip() == "---":
            return metadata
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        clean_key = key.strip()
        clean_value = value.strip().strip("\"'")
        if clean_key:
            metadata[clean_key] = clean_value
    return {}


def _external_skill_node(path: Path) -> KnowledgeExternalSkillFileNode:
    stat = path.stat()
    node_type = "directory" if path.is_dir() else "file"
    children: list[KnowledgeExternalSkillFileNode] = []
    if path.is_dir():
        entries = sorted(path.iterdir(), key=lambda item: (not item.is_dir(), item.name.lower()))
        children = [_external_skill_node(child) for child in entries]
    return KnowledgeExternalSkillFileNode(
        name=path.name,
        path=_external_skill_relative_path(path),
        type=node_type,
        size=None if path.is_dir() else stat.st_size,
        updated_at=datetime.fromtimestamp(stat.st_mtime),
        children=children,
    )


def _normalize_researcher_code(value: str) -> str:
    code = str(value or "").strip()
    if not code:
        raise ValueError("researcher_code is required")
    if not RESEARCHER_CODE_PATTERN.fullmatch(code):
        raise ValueError("researcher_code may only contain letters, numbers, underscore, and hyphen")
    return code


def _normalize_researcher_status(value: str) -> str:
    status = str(value or "active").strip()
    if status not in {"active", "archived"}:
        raise ValueError("researcher status must be active or archived")
    return status


def _researcher_profile_path_for_code(researcher_code: str) -> str:
    code = _normalize_researcher_code(researcher_code)
    return f"external/researchers/{code}/profile.md"


def _resolve_researcher_profile_path(stored_path: str) -> Path:
    path = Path(str(stored_path or "").strip())
    if path.is_absolute():
        resolved = path.resolve()
    else:
        resolved = (KNOWLEDGE_BASE_ROOT / path).resolve()
    if not resolved.is_relative_to(RESEARCHER_PROFILE_ROOT.resolve()):
        raise ValueError(f"researcher profile path must be under {RESEARCHER_PROFILE_ROOT}: {stored_path}")
    return resolved


def format_researcher_profile_markdown(
    *,
    researcher_code: str = "",
    display_name: str = "",
    intro: str = "",
    soul: str = "",
    method: str = "",
) -> str:
    return (
        "---\n"
        f"researcher_code: {str(researcher_code or '').strip()}\n"
        f"display_name: {str(display_name or '').strip()}\n"
        "---\n\n"
        "## 简介 intro\n\n"
        f"{str(intro or '').strip()}\n\n"
        "## 价值观 soul\n\n"
        f"{str(soul or '').strip()}\n\n"
        "## 方法论 method\n\n"
        f"{str(method or '').strip()}\n"
    )


def parse_researcher_profile_markdown(content: str) -> dict[str, str]:
    result = {"intro": "", "soul": "", "method": ""}
    matches = list(RESEARCHER_PROFILE_SECTION_PATTERN.finditer(content or ""))
    for index, match in enumerate(matches):
        raw_label = re.sub(r"\s+", " ", match.group(1).strip())
        key = RESEARCHER_PROFILE_SECTIONS.get(raw_label)
        lowered_label = raw_label.lower()
        if key is None and lowered_label.startswith("soul"):
            key = "soul"
        if key is None and lowered_label.startswith("method"):
            key = "method"
        if key is None:
            continue
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(content or "")
        result[key] = (content or "")[start:end].strip()
    return result


def _write_researcher_profile(stored_path: str, researcher_code: str, display_name: str, intro: str, soul: str, method: str) -> str:
    content = format_researcher_profile_markdown(
        researcher_code=researcher_code,
        display_name=display_name,
        intro=intro,
        soul=soul,
        method=method,
    )
    path = _resolve_researcher_profile_path(stored_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def _read_researcher_profile(stored_path: str) -> str:
    path = _resolve_researcher_profile_path(stored_path)
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8")


def _researcher_read(item: KnowledgeResearcher) -> KnowledgeResearcherRead:
    profile_content = _read_researcher_profile(item.profile_path)
    sections = parse_researcher_profile_markdown(profile_content)
    return KnowledgeResearcherRead.model_validate(
        {
            "id": item.id,
            "researcher_code": item.researcher_code,
            "display_name": item.display_name,
            "profile_path": item.profile_path,
            "profile_hash": item.profile_hash,
            "profile_content": profile_content,
            "status": item.status,
            "intro": sections["intro"],
            "soul": sections["soul"],
            "method": sections["method"],
            "created_at": item.created_at,
            "updated_at": item.updated_at,
        }
    )


def get_researcher_profile_bundle(db: Session, researcher: str) -> dict:
    value = str(researcher or "").strip()
    if not value:
        raise ValueError("researcher is required")
    item = db.scalar(
        select(KnowledgeResearcher).where(
            or_(
                KnowledgeResearcher.display_name == value,
                KnowledgeResearcher.researcher_code == value,
            )
        )
    )
    if item is None and value.isdigit():
        item = db.get(KnowledgeResearcher, int(value))
    if item is None:
        raise FileNotFoundError("researcher not found")
    return _researcher_read(item).model_dump(mode="json")
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


def scan_external_skills() -> list[KnowledgeExternalSkillRead]:
    if not EXTERNAL_SKILL_ROOT.exists():
        return []
    skills: list[KnowledgeExternalSkillRead] = []
    for skill_dir in sorted((item for item in EXTERNAL_SKILL_ROOT.iterdir() if item.is_dir()), key=lambda item: item.name.lower()):
        skill_file = skill_dir / "SKILL.md"
        if not skill_file.is_file():
            continue
        content = skill_file.read_text(encoding="utf-8")
        frontmatter = _parse_skill_frontmatter(content)
        skills.append(
            KnowledgeExternalSkillRead(
                slug=skill_dir.name,
                name=frontmatter.get("name") or skill_dir.name,
                description=frontmatter.get("description") or "",
                status=frontmatter.get("status") or "active",
                version=frontmatter.get("version") or None,
                skill_path=_external_skill_relative_path(skill_file),
                updated_at=_file_updated_at(skill_file),
            )
        )
    return skills


def list_external_skill_files(skill_slug: str | None = None) -> KnowledgeExternalSkillFileNode:
    path = _resolve_external_skill_path(skill_slug or "")
    if not path.exists():
        raise ValueError("external skill path not found")
    if not path.is_dir():
        raise ValueError("external skill path is not a directory")
    return _external_skill_node(path)


def read_external_skill_file(path: str) -> KnowledgeExternalSkillFileContent:
    resolved = _resolve_external_skill_path(path)
    if not resolved.exists():
        raise ValueError("external skill file not found")
    if not resolved.is_file():
        raise ValueError("external skill path is not a file")
    try:
        content = resolved.read_text(encoding="utf-8")
    except UnicodeDecodeError as exc:
        raise ValueError("external skill file is not text") from exc
    stat = resolved.stat()
    return KnowledgeExternalSkillFileContent(
        name=resolved.name,
        path=_external_skill_relative_path(resolved),
        content=content,
        size=stat.st_size,
        updated_at=datetime.fromtimestamp(stat.st_mtime),
    )


def _ensure_unique_researcher_code(db: Session, researcher_code: str, current_id: int | None = None) -> None:
    stmt = select(KnowledgeResearcher.id).where(KnowledgeResearcher.researcher_code == researcher_code)
    if current_id is not None:
        stmt = stmt.where(KnowledgeResearcher.id != current_id)
    if db.scalar(stmt.limit(1)):
        raise ValueError("researcher_code already exists")


def create_researcher(db: Session, payload: KnowledgeResearcherCreate) -> KnowledgeResearcherRead:
    researcher_code = _normalize_researcher_code(payload.researcher_code)
    _ensure_unique_researcher_code(db, researcher_code)
    status = _normalize_researcher_status(payload.status)
    display_name = payload.display_name.strip()
    if not display_name:
        raise ValueError("display_name is required")
    profile_path = _researcher_profile_path_for_code(researcher_code)
    profile_hash = _write_researcher_profile(profile_path, researcher_code, display_name, payload.intro, payload.soul, payload.method)
    item = KnowledgeResearcher(
        researcher_code=researcher_code,
        display_name=display_name,
        profile_path=profile_path,
        profile_hash=profile_hash,
        status=status,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return _researcher_read(item)


def list_researchers(db: Session) -> list[KnowledgeResearcherRead]:
    rows = db.scalars(select(KnowledgeResearcher).order_by(KnowledgeResearcher.updated_at.desc(), KnowledgeResearcher.id.desc()))
    return [_researcher_read(item) for item in rows]


def get_researcher(db: Session, researcher_id: int) -> KnowledgeResearcher | None:
    return db.get(KnowledgeResearcher, researcher_id)


def update_researcher(db: Session, item: KnowledgeResearcher, payload: KnowledgeResearcherCreate) -> KnowledgeResearcherRead:
    researcher_code = _normalize_researcher_code(payload.researcher_code)
    if researcher_code != item.researcher_code:
        raise ValueError("researcher_code cannot be changed")
    _ensure_unique_researcher_code(db, researcher_code, item.id)
    display_name = payload.display_name.strip()
    if not display_name:
        raise ValueError("display_name is required")
    item.display_name = display_name
    item.status = _normalize_researcher_status(payload.status)
    item.profile_hash = _write_researcher_profile(item.profile_path, item.researcher_code, display_name, payload.intro, payload.soul, payload.method)
    db.commit()
    db.refresh(item)
    return _researcher_read(item)


def delete_researcher(db: Session, item: KnowledgeResearcher) -> KnowledgeResearcherRead:
    result = _researcher_read(item)
    db.delete(item)
    db.commit()
    return result


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
    retired_prompts = db.scalars(
        select(KnowledgePrompt).where(
            KnowledgePrompt.prompt_key.in_(RETIRED_DEFAULT_PROMPT_KEYS),
            KnowledgePrompt.status != "deleted",
        )
    )
    for item in retired_prompts:
        item.status = "deleted"
        changed += 1
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
        select(KnowledgePrompt).where(
            KnowledgePrompt.prompt_key.not_in(default_keys | RETIRED_DEFAULT_PROMPT_KEYS),
            KnowledgePrompt.status != "deleted",
        )
    )
    for item in custom_prompts:
        if _ensure_custom_prompt_paths(item):
            changed += 1
    if changed:
        db.commit()
    return changed


def list_prompts(db: Session) -> list[KnowledgePromptRead]:
    rows = list(
        db.scalars(
            select(KnowledgePrompt)
            .where(
                KnowledgePrompt.status != "deleted",
                KnowledgePrompt.prompt_key.not_in(RETIRED_DEFAULT_PROMPT_KEYS),
            )
            .order_by(KnowledgePrompt.id.desc())
        )
    )
    return [_prompt_read(item) for item in rows]


def get_prompt(db: Session, prompt_id: int) -> KnowledgePrompt | None:
    return db.get(KnowledgePrompt, prompt_id)


def get_active_prompt_by_key(
    db: Session,
    prompt_key: str,
    variables: dict[str, Any] | None = None,
) -> ResolvedPrompt | None:
    if prompt_key in RETIRED_DEFAULT_PROMPT_KEYS:
        return None
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


def _normalize_optional_text(value: str | None) -> str | None:
    cleaned = str(value or "").strip()
    return cleaned or None


def _research_feedback_payload_data(payload: KnowledgeResearchFeedbackCreate) -> dict:
    data = payload.model_dump()
    data["title"] = str(data.get("title") or "").strip()
    if not data["title"]:
        raise ValueError("research feedback title is required")
    data["researcher_code"] = _normalize_optional_text(payload.researcher_code)
    data["skill_name"] = _normalize_optional_text(payload.skill_name)
    data["business_module"] = _normalize_optional_text(payload.business_module)
    data["report_path"] = _normalize_optional_text(payload.report_path)
    data["source"] = str(payload.source or "mcp").strip() or "mcp"
    data["status"] = str(payload.status or "received").strip() or "received"
    if data.get("returned_at") is None:
        data.pop("returned_at", None)
    return data


def create_research_feedback(db: Session, payload: KnowledgeResearchFeedbackCreate) -> KnowledgeResearchFeedback:
    data = _research_feedback_payload_data(payload)
    item = KnowledgeResearchFeedback(**data)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def upload_research_feedback(
    db: Session,
    *,
    title: str,
    markdown: str,
    researcher_code: str | None = None,
    skill_name: str | None = None,
    business_module: str | None = None,
    source: str = "mcp",
    status: str = "received",
    now: datetime | None = None,
) -> tuple[KnowledgeResearchFeedback, int, int]:
    module_name = _normalize_optional_text(business_module) or "knowledge_base"
    report, content_size = report_service.create_markdown_report_file_and_index(
        db,
        title=title,
        source_module=module_name,
        markdown=markdown,
        now=now,
    )
    feedback = create_research_feedback(
        db,
        KnowledgeResearchFeedbackCreate(
            title=title,
            report_id=report.id,
            report_path=report.file_path,
            researcher_code=researcher_code,
            skill_name=skill_name,
            business_module=business_module,
            source=source,
            status=status,
        ),
    )
    return feedback, report.id, content_size


def list_research_feedback(db: Session) -> list[KnowledgeResearchFeedback]:
    return list(
        db.scalars(select(KnowledgeResearchFeedback).order_by(KnowledgeResearchFeedback.returned_at.desc(), KnowledgeResearchFeedback.id.desc()))
    )


def get_research_feedback(db: Session, feedback_id: int) -> KnowledgeResearchFeedback | None:
    return db.get(KnowledgeResearchFeedback, feedback_id)


def update_research_feedback(
    db: Session,
    item: KnowledgeResearchFeedback,
    payload: KnowledgeResearchFeedbackCreate,
) -> KnowledgeResearchFeedback:
    data = _research_feedback_payload_data(payload)
    for key, value in data.items():
        setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return item


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
