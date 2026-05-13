from pathlib import Path

from invest_assistant.modules.basic.disclosure_library.models import CompanyDisclosure


def disclosure_raw_dir(item: CompanyDisclosure) -> Path:
    folder = "financial_reports" if "report" in item.disclosure_type else "announcements"
    return Path("var") / "raw" / "disclosures" / folder


def disclosure_processed_text_dir() -> Path:
    return Path("var") / "processed" / "disclosures" / "text"


def disclosure_processed_markdown_dir() -> Path:
    return Path("var") / "processed" / "disclosures" / "markdown"


def safe_filename(item: CompanyDisclosure, suffix: str = ".txt") -> str:
    source = item.source or "source"
    title = "".join(ch if ch.isalnum() else "_" for ch in item.title)[:80].strip("_") or "disclosure"
    return f"{item.id}_{source}_{title}{suffix}"


def read_disclosure_text(file_path: Path) -> str:
    data = file_path.read_bytes()
    text = data.decode("utf-8", errors="ignore").strip()
    if not text:
        text = data.decode("gb18030", errors="ignore").strip()
    if not text:
        raise ValueError("parsed text is empty")
    return text


def write_parsed_outputs(item: CompanyDisclosure, source_file: Path) -> tuple[str, str]:
    text = read_disclosure_text(source_file)
    text_dir = disclosure_processed_text_dir()
    markdown_dir = disclosure_processed_markdown_dir()
    text_dir.mkdir(parents=True, exist_ok=True)
    markdown_dir.mkdir(parents=True, exist_ok=True)
    text_path = text_dir / safe_filename(item, ".txt")
    markdown_path = markdown_dir / safe_filename(item, ".md")
    text_path.write_text(text, encoding="utf-8")
    markdown_path.write_text(f"# {item.title}\n\n{text}\n", encoding="utf-8")
    return (
        text_path.relative_to("var").as_posix(),
        markdown_path.relative_to("var").as_posix(),
    )
