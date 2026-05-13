from pathlib import Path

from sqlalchemy.orm import Session

from invest_assistant.modules.basic.disclosure_library import cninfo_client, parser, repository
from invest_assistant.modules.basic.disclosure_library.models import CompanyDisclosure
from invest_assistant.modules.basic.disclosure_library.schemas import (
    CompanyDisclosureCreate,
    CompanyDisclosureUpdate,
)
from invest_assistant.modules.market_radar.schemas import SourceItemCreate
from invest_assistant.modules.market_radar.service import create_source_item


def list_disclosures(db: Session) -> list[CompanyDisclosure]:
    return repository.list_disclosures(db)


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
    if parsed_path is not None and parsed_path.exists():
        content = parsed_path.read_text(encoding="utf-8")
    else:
        content = item.title
    return create_source_item(
        db,
        SourceItemCreate(
            source_type="announcement",
            source_name=item.source,
            title=item.title,
            content=content,
            source_url=item.source_url,
            publish_time=item.publish_time,
        ),
    )
