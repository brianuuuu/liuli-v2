from datetime import datetime
from typing import Any
from urllib.parse import urlparse
from urllib.request import Request, url2pathname, urlopen

from invest_assistant.modules.basic.disclosure_library.schemas import CompanyDisclosureCreate


CNINFO_SEARCH_URL = "http://www.cninfo.com.cn/new/hisAnnouncement/query"


def parse_cninfo_items(payload: dict[str, Any]) -> list[CompanyDisclosureCreate]:
    rows = payload.get("announcements") or payload.get("data") or []
    result: list[CompanyDisclosureCreate] = []
    for row in rows:
        title = str(row.get("announcementTitle") or row.get("title") or "").strip()
        if not title:
            continue
        adjunct_url = str(row.get("adjunctUrl") or row.get("url") or "").strip()
        source_url = adjunct_url
        if adjunct_url and not adjunct_url.startswith("http"):
            source_url = f"http://static.cninfo.com.cn/{adjunct_url.lstrip('/')}"
        publish_time = _parse_publish_time(row.get("announcementTime") or row.get("publish_time"))
        result.append(
            CompanyDisclosureCreate(
                source="cninfo",
                disclosure_type=_guess_disclosure_type(title),
                title=title,
                publish_time=publish_time,
                report_period=str(row.get("secCode") or "").strip() or None,
                source_url=source_url or None,
                parse_status="pending",
            )
        )
    return result


def fetch_cninfo_metadata(keyword: str = "", page_num: int = 1, page_size: int = 30) -> list[CompanyDisclosureCreate]:
    import json
    import urllib.parse

    data = urllib.parse.urlencode(
        {
            "pageNum": page_num,
            "pageSize": page_size,
            "column": "szse",
            "tabName": "fulltext",
            "searchkey": keyword,
            "seDate": "",
        }
    ).encode("utf-8")
    request = Request(
        CNINFO_SEARCH_URL,
        data=data,
        headers={
            "User-Agent": "Mozilla/5.0",
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        },
    )
    with urlopen(request, timeout=20) as response:
        payload = json.loads(response.read().decode("utf-8"))
    return parse_cninfo_items(payload)


def download_url(url: str) -> bytes:
    parsed = urlparse(url)
    if parsed.scheme == "file":
        return open(url2pathname(parsed.path), "rb").read()
    request = Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urlopen(request, timeout=30) as response:
        return response.read()


def _guess_disclosure_type(title: str) -> str:
    if "年度报告" in title:
        return "annual_report"
    if "季度报告" in title or "一季报" in title or "三季报" in title:
        return "quarterly_report"
    if "半年度报告" in title or "中期报告" in title:
        return "interim_report"
    return "announcement"


def _parse_publish_time(value: Any) -> datetime | None:
    if value in (None, ""):
        return None
    if isinstance(value, (int, float)):
        timestamp = float(value)
        if timestamp > 10_000_000_000:
            timestamp = timestamp / 1000
        return datetime.fromtimestamp(timestamp)
    text = str(value).strip()
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%Y/%m/%d"):
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    return None
