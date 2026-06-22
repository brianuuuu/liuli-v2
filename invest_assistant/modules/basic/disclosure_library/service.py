from datetime import timedelta
from pathlib import Path

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from invest_assistant.modules.basic.disclosure_library import cninfo_client, parser, repository
from invest_assistant.modules.basic.disclosure_library.models import CompanyDisclosure
from invest_assistant.modules.basic.disclosure_library.schemas import (
    CompanyDisclosureCreate,
    CompanyDisclosureUpdate,
)
from invest_assistant.modules.basic.job_center.types import JobResult
from invest_assistant.modules.basic.stock_master.models import Stock
from invest_assistant.modules.market_radar.models import SourceItem
from invest_assistant.modules.market_radar.schemas import SourceItemCreate
from invest_assistant.modules.market_radar.service import create_source_item
from invest_assistant.modules.stock_analysis.models import StockMaterial, StockPoolItem
from invest_assistant.shared.pagination import Page, page_from_statement
from invest_assistant.shared.time_utils import beijing_now


def list_disclosures(db: Session) -> list[CompanyDisclosure]:
    return repository.list_disclosures(db)


def list_disclosures_page(
    db: Session,
    limit: int | None = 50,
    offset: int = 0,
    q: str | None = None,
    pool_only: bool = True,
) -> Page[CompanyDisclosure]:
    stmt = select(CompanyDisclosure).order_by(
        CompanyDisclosure.publish_time.desc().nullslast(),
        CompanyDisclosure.id.desc(),
    )
    conditions = []
    if pool_only:
        conditions.append(_disclosure_in_stock_pool_condition())
    search_text = str(q or "").strip()
    if search_text:
        conditions.append(_disclosure_search_condition(search_text))
    if conditions:
        stmt = stmt.where(*conditions)
    page = page_from_statement(db, stmt, limit=limit, offset=offset)
    _attach_stock_fields(db, page.items)
    return page


def get_disclosure(db: Session, disclosure_id: int) -> CompanyDisclosure | None:
    return repository.get_disclosure(db, disclosure_id)


def create_disclosure(db: Session, payload: CompanyDisclosureCreate) -> CompanyDisclosure:
    return repository.upsert_disclosure(db, payload)


def update_disclosure(db: Session, item: CompanyDisclosure, payload: CompanyDisclosureUpdate) -> CompanyDisclosure:
    return repository.update_disclosure(db, item, payload)


def resolve_path(path: str | None) -> Path | None:
    if not path:
        return None
    return Path("var") / path


def fetch_cninfo(db: Session, keyword: str = "", page_num: int = 1, page_size: int = 30) -> list[CompanyDisclosure]:
    payloads = cninfo_client.fetch_cninfo_metadata(keyword=keyword, page_num=page_num, page_size=page_size)
    return [repository.upsert_disclosure(db, payload) for payload in payloads]


def _attach_stock_fields(db: Session, items: list[CompanyDisclosure]) -> None:
    if not items:
        return
    stock_ids = {item.stock_id for item in items if item.stock_id}
    legacy_codes = {item.report_period for item in items if _is_stock_code(item.report_period)}

    stocks_by_id: dict[int, Stock] = {}
    if stock_ids:
        stocks_by_id = {stock.id: stock for stock in db.scalars(select(Stock).where(Stock.id.in_(stock_ids)))}

    stocks_by_code: dict[str, Stock] = {}
    if legacy_codes:
        stocks_by_code = {
            stock.stock_code: stock for stock in db.scalars(select(Stock).where(Stock.stock_code.in_(legacy_codes)))
        }

    for item in items:
        stock = stocks_by_id.get(item.stock_id) if item.stock_id else None
        legacy_code = item.report_period if _is_stock_code(item.report_period) else None
        if stock is None and legacy_code:
            stock = stocks_by_code.get(legacy_code)
        item.stock_code = stock.stock_code if stock else None
        item.stock_name = stock.stock_name if stock else None


def _is_stock_code(value: str | None) -> bool:
    return bool(value and len(value) == 6 and value.isdigit())


def _disclosure_in_stock_pool_condition():
    stock_id_in_pool = select(StockPoolItem.id).where(
        StockPoolItem.stock_id == CompanyDisclosure.stock_id
    ).exists()
    legacy_code_in_pool = (
        select(Stock.id)
        .join(StockPoolItem, StockPoolItem.stock_id == Stock.id)
        .where(Stock.stock_code == CompanyDisclosure.report_period)
        .exists()
    )
    return or_(stock_id_in_pool, legacy_code_in_pool)


def _disclosure_search_condition(search_text: str):
    pattern = f"%{search_text}%"
    stock_by_id_matches = (
        select(Stock.id)
        .where(
            and_(
                Stock.id == CompanyDisclosure.stock_id,
                or_(Stock.stock_name.ilike(pattern), Stock.stock_code.ilike(pattern)),
            )
        )
        .exists()
    )
    stock_by_code_matches = (
        select(Stock.id)
        .where(
            and_(
                Stock.stock_code == CompanyDisclosure.report_period,
                or_(Stock.stock_name.ilike(pattern), Stock.stock_code.ilike(pattern)),
            )
        )
        .exists()
    )
    return or_(CompanyDisclosure.title.ilike(pattern), stock_by_id_matches, stock_by_code_matches)


def fetch_stock_announcements(
    db: Session,
    stock_code: str | None = None,
    days: int = 30,
    pool_status: str = "focused,watching,candidate",
    page_size: int = 30,
    max_pages: int = 2,
    auto_to_source_item: bool = True,
    category: str = "",
) -> JobResult:
    stocks = _target_announcement_stocks(db, stock_code, pool_status)
    if not stocks:
        return JobResult(success=True, message="no target stocks for announcements", extra={"per_stock": []})

    end_date = beijing_now().date()
    start_date = end_date - timedelta(days=max(int(days), 1))
    fetched_count = 0
    inserted_count = 0
    updated_count = 0
    skipped_count = 0
    source_item_inserted_count = 0
    per_stock = []

    for stock in stocks:
        stock_summary = {
            "stock_code": stock.stock_code,
            "stock_name": stock.stock_name,
            "fetched": 0,
            "inserted": 0,
            "updated": 0,
            "skipped": 0,
            "source_item_inserted": 0,
            "error": None,
        }
        try:
            payloads = cninfo_client.fetch_stock_announcements(
                stock.stock_code,
                start_date=start_date,
                end_date=end_date,
                page_size=page_size,
                max_pages=max_pages,
                category=category,
            )
        except Exception as exc:
            stock_summary["error"] = str(exc)
            skipped_count += 1
            stock_summary["skipped"] += 1
            per_stock.append(stock_summary)
            continue

        fetched_count += len(payloads)
        stock_summary["fetched"] = len(payloads)
        for payload in payloads:
            payload = payload.model_copy(update={"stock_id": stock.id})
            existing = repository.find_duplicate(db, payload)
            item = repository.upsert_disclosure(db, payload)
            if existing is None:
                inserted_count += 1
                stock_summary["inserted"] += 1
            else:
                updated_count += 1
                stock_summary["updated"] += 1
            if auto_to_source_item and _source_item_missing(db, item):
                disclosure_to_source_item(db, item)
                source_item_inserted_count += 1
                stock_summary["source_item_inserted"] += 1
        per_stock.append(stock_summary)

    return JobResult(
        success=True,
        message=(
            f"fetched {fetched_count} stock announcements; "
            f"inserted {inserted_count}, updated {updated_count}, source items {source_item_inserted_count}"
        ),
        fetched_count=fetched_count,
        processed_count=len(stocks),
        inserted_count=inserted_count,
        updated_count=updated_count,
        skipped_count=skipped_count,
        extra={
            "source_item_inserted_count": source_item_inserted_count,
            "per_stock": per_stock,
        },
    )


def download_disclosure_file(db: Session, item: CompanyDisclosure) -> CompanyDisclosure:
    if not item.source_url:
        raise ValueError("source_url is required")
    raw_dir = parser.disclosure_raw_dir(item)
    raw_dir.mkdir(parents=True, exist_ok=True)
    suffix = Path(item.source_url).suffix or ".pdf"
    target = raw_dir / parser.safe_filename(item, suffix)
    target.write_bytes(cninfo_client.download_url(item.source_url))
    return repository.mark_file_path(db, item, target.relative_to("var").as_posix())


def parse_disclosure_file(db: Session, item: CompanyDisclosure) -> CompanyDisclosure:
    path = resolve_path(item.file_path)
    if path is None or not path.exists():
        raise FileNotFoundError("disclosure file not found")
    try:
        text_path, markdown_path = parser.write_parsed_outputs(item, path)
    except Exception:
        repository.mark_parse_failed(db, item)
        raise
    return repository.mark_parse_success(db, item, text_path, markdown_path)


def disclosure_to_source_item(db: Session, item: CompanyDisclosure):
    parsed_path = resolve_path(item.parsed_markdown_path or item.parsed_text_path)
    content = _disclosure_source_content(db, item)
    if parsed_path is not None and parsed_path.exists():
        content = f"{content}\n\n{parsed_path.read_text(encoding='utf-8')}"
    return create_source_item(
        db,
        SourceItemCreate(
            source_type="announcement",
            source_name=item.source,
            title=item.title,
            content=content,
            source_url=item.source_url,
            publish_time=item.publish_time,
            related_type="company_disclosure",
            related_id=item.id,
        ),
    )


def disclosures_to_missing_source_items(db: Session) -> dict[str, int]:
    total = 0
    converted = 0
    skipped = 0
    for item in repository.list_disclosures(db):
        total += 1
        if not _source_item_missing(db, item):
            skipped += 1
            continue
        disclosure_to_source_item(db, item)
        converted += 1
    return {"total": total, "converted": converted, "skipped": skipped}


def disclosure_to_stock_analysis(db: Session, item: CompanyDisclosure) -> dict:
    if item.stock_id is None:
        raise ValueError("stock_id is required")
    material = db.scalar(
        select(StockMaterial).where(
            StockMaterial.stock_id == item.stock_id,
            StockMaterial.material_type == "company_disclosure",
            StockMaterial.material_id == item.id,
        )
    )
    if material is None:
        material = StockMaterial(
            stock_id=item.stock_id,
            material_type="company_disclosure",
            material_id=item.id,
            importance_level="high"
            if item.disclosure_type in {"annual_report", "quarterly_report", "interim_report"}
            else None,
            status="pending",
        )
        db.add(material)
    db.commit()
    db.refresh(material)
    return {
        "id": material.id,
        "stock_id": material.stock_id,
        "material_type": material.material_type,
        "material_id": material.material_id,
        "impact_direction": material.impact_direction,
        "importance_level": material.importance_level,
        "status": material.status,
        "note": material.note,
        "created_at": material.created_at,
        "updated_at": material.updated_at,
    }


def _target_announcement_stocks(db: Session, stock_code: str | None, pool_status: str) -> list[Stock]:
    if stock_code and str(stock_code).strip():
        code = str(stock_code).strip()
        return list(
            db.scalars(
                select(Stock)
                .where(Stock.stock_code == code, Stock.status == "active")
                .order_by(Stock.id.asc())
            )
        )

    statuses = [item.strip() for item in str(pool_status or "").split(",") if item.strip()]
    stmt = (
        select(Stock)
        .join(StockPoolItem, StockPoolItem.stock_id == Stock.id)
        .where(Stock.status == "active")
        .order_by(StockPoolItem.updated_at.desc(), StockPoolItem.id.desc())
    )
    if statuses:
        stmt = stmt.where(StockPoolItem.status.in_(statuses))
    stocks = []
    seen_stock_ids = set()
    for stock in db.scalars(stmt):
        if stock.id in seen_stock_ids:
            continue
        seen_stock_ids.add(stock.id)
        stocks.append(stock)
    return stocks


def _source_item_missing(db: Session, item: CompanyDisclosure) -> bool:
    if item.source_url:
        existing = db.scalar(
            select(SourceItem).where(
                SourceItem.source_type == "announcement",
                SourceItem.source_name == item.source,
                SourceItem.source_url == item.source_url,
            )
        )
        return existing is None
    existing = db.scalar(
        select(SourceItem).where(
            SourceItem.source_type == "announcement",
            SourceItem.source_name == item.source,
            SourceItem.publish_time == item.publish_time,
            SourceItem.title == item.title,
        )
    )
    return existing is None


def _disclosure_source_content(db: Session, item: CompanyDisclosure) -> str:
    stock = db.get(Stock, item.stock_id) if item.stock_id is not None else None
    stock_name = stock.stock_name if stock is not None else None
    stock_code = stock.stock_code if stock is not None else item.report_period
    lines = [
        f"股票简称：{stock_name or '-'}",
        f"股票代码：{stock_code or '-'}",
        f"公告类型：{item.disclosure_type}",
        f"公告日期：{item.publish_time.date().isoformat() if item.publish_time else '-'}",
        f"公告标题：{item.title}",
    ]
    if item.source_url:
        lines.append(f"公告原文：{item.source_url}")
    return "\n".join(lines)
