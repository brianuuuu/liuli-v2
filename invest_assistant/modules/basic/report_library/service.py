from datetime import datetime
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from invest_assistant.modules.basic.report_library.models import Report
from invest_assistant.modules.basic.report_library.schemas import ReportCreate, ReportUpdate
from invest_assistant.shared.pagination import Page, page_from_statement
from invest_assistant.shared.time_utils import beijing_now

ALLOWED_MCP_REPORT_MODULES = {
    "market_radar",
    "track_discovery",
    "stock_analysis",
    "portfolio",
    "knowledge_base",
    "alert_center",
    "report_library",
}
MAX_MCP_MARKDOWN_REPORT_BYTES = 1024 * 1024


def list_reports(db: Session) -> list[Report]:
    return list(db.scalars(select(Report).order_by(Report.created_at.desc(), Report.id.desc())))


def list_reports_page(db: Session, limit: int | None = 50, offset: int = 0) -> Page[Report]:
    stmt = select(Report).order_by(Report.created_at.desc(), Report.id.desc())
    return page_from_statement(db, stmt, limit=limit, offset=offset)


def get_report(db: Session, report_id: int) -> Report | None:
    return db.get(Report, report_id)


def create_report(db: Session, payload: ReportCreate) -> Report:
    item = Report(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def create_markdown_report_file_and_index(
    db: Session,
    *,
    title: str,
    source_module: str,
    markdown: str,
    now: datetime | None = None,
    reports_root: Path | str = Path("var") / "reports",
) -> tuple[Report, int]:
    clean_title = title.strip()
    clean_module = source_module.strip()
    if not clean_title:
        raise ValueError("report title is required")
    if clean_module not in ALLOWED_MCP_REPORT_MODULES:
        raise ValueError("source_module is not allowed")
    if not markdown.strip():
        raise ValueError("markdown content is required")
    if "\x00" in markdown:
        raise ValueError("markdown content contains invalid characters")
    content_size = len(markdown.encode("utf-8"))
    if content_size > MAX_MCP_MARKDOWN_REPORT_BYTES:
        raise ValueError("markdown content exceeds 1MB limit")

    published_at = now or beijing_now()
    report_path = _write_mcp_markdown_report(markdown, clean_module, published_at, Path(reports_root))
    item = Report(
        title=clean_title,
        report_type="mcp_upload",
        source_module=clean_module,
        target_type=None,
        target_id=None,
        summary=_first_non_heading_line(markdown),
        file_format="md",
        file_path=report_path.relative_to(Path("var")).as_posix(),
        generated_by="mcp",
        status="published",
        publish_time=published_at,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item, content_size


def update_report(db: Session, item: Report, payload: ReportUpdate) -> Report:
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return item


def delete_report(db: Session, item: Report) -> None:
    db.delete(item)
    db.commit()


def resolve_report_path(item: Report) -> Path:
    return Path("var") / item.file_path


def _write_mcp_markdown_report(markdown: str, source_module: str, published_at: datetime, reports_root: Path) -> Path:
    folder = reports_root / source_module / published_at.strftime("%Y-%m")
    folder.mkdir(parents=True, exist_ok=True)
    stem = f"mcp-upload-{published_at.strftime('%Y%m%d-%H%M%S')}"
    path = folder / f"{stem}.md"
    suffix = 2
    while path.exists():
        path = folder / f"{stem}-{suffix}.md"
        suffix += 1
    path.write_text(markdown, encoding="utf-8")
    return path


def _first_non_heading_line(markdown: str) -> str | None:
    for line in markdown.splitlines():
        value = line.strip()
        if not value or value.startswith("#"):
            continue
        return value[:500]
    return None
