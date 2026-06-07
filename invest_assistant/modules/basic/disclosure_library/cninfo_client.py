from datetime import date, datetime
from functools import lru_cache
from typing import Any
from urllib.parse import urlparse
from urllib.request import Request, url2pathname, urlopen

from invest_assistant.modules.basic.disclosure_library.schemas import CompanyDisclosureCreate


CNINFO_SEARCH_URL = "http://www.cninfo.com.cn/new/hisAnnouncement/query"
CNINFO_STOCK_LIST_URL = "http://www.cninfo.com.cn/new/data/szse_stock.json"
CNINFO_CATEGORY_MAP = {
    "年报": "category_ndbg_szsh",
    "半年报": "category_bndbg_szsh",
    "一季报": "category_yjdbg_szsh",
    "三季报": "category_sjdbg_szsh",
    "业绩预告": "category_yjygjxz_szsh",
    "权益分派": "category_qyfpxzcs_szsh",
    "董事会": "category_dshgg_szsh",
    "监事会": "category_jshgg_szsh",
    "股东大会": "category_gddh_szsh",
    "日常经营": "category_rcjy_szsh",
    "公司治理": "category_gszl_szsh",
    "中介报告": "category_zj_szsh",
    "首发": "category_sf_szsh",
    "增发": "category_zf_szsh",
    "股权激励": "category_gqjl_szsh",
    "配股": "category_pg_szsh",
    "解禁": "category_jj_szsh",
    "公司债": "category_gszq_szsh",
    "可转债": "category_kzzq_szsh",
    "其他融资": "category_qtrz_szsh",
    "股权变动": "category_gqbd_szsh",
    "补充更正": "category_bcgz_szsh",
    "澄清致歉": "category_cqdq_szsh",
    "风险提示": "category_fxts_szsh",
    "特别处理和退市": "category_tbclts_szsh",
    "退市整理期": "category_tszlq_szsh",
}


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
    import urllib.parse

    payload = {
        "pageNum": page_num,
        "pageSize": page_size,
        "column": "szse",
        "tabName": "fulltext",
        "searchkey": keyword,
        "seDate": "",
    }
    data = urllib.parse.urlencode(payload).encode("utf-8")
    request = Request(
        CNINFO_SEARCH_URL,
        data=data,
        headers={
            "User-Agent": "Mozilla/5.0",
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        },
    )
    with urlopen(request, timeout=20) as response:
        response_payload = _loads_json(response.read())
    return parse_cninfo_items(response_payload)


@lru_cache()
def get_stock_org_id_map() -> dict[str, str]:
    request = Request(CNINFO_STOCK_LIST_URL, headers={"User-Agent": "Mozilla/5.0"})
    with urlopen(request, timeout=20) as response:
        payload = _loads_json(response.read())
    return {
        str(item.get("code") or "").strip(): str(item.get("orgId") or "").strip()
        for item in payload.get("stockList", [])
        if str(item.get("code") or "").strip() and str(item.get("orgId") or "").strip()
    }


def fetch_stock_announcements(
    stock_code: str,
    start_date: str | date,
    end_date: str | date,
    page_size: int = 30,
    max_pages: int = 2,
    category: str = "",
) -> list[CompanyDisclosureCreate]:
    code = str(stock_code or "").strip()
    if not code:
        return []
    org_id = get_stock_org_id_map().get(code)
    if not org_id:
        raise RuntimeError(f"cninfo orgId not found for stock {code}")

    rows: list[CompanyDisclosureCreate] = []
    page_limit = max(int(max_pages), 1)
    size = max(int(page_size), 1)
    date_range = f"{_format_cninfo_date(start_date)}~{_format_cninfo_date(end_date)}"
    for page_num in range(1, page_limit + 1):
        payload = {
            "pageNum": str(page_num),
            "pageSize": str(size),
            "column": "szse",
            "tabName": "fulltext",
            "plate": "",
            "stock": f"{code},{org_id}",
            "searchkey": "",
            "secid": "",
            "category": CNINFO_CATEGORY_MAP.get(category, category or ""),
            "trade": "",
            "seDate": date_range,
            "sortName": "",
            "sortType": "",
            "isHLtitle": "true",
        }
        response_payload = _post_cninfo_query(payload)
        page_items = parse_cninfo_items(response_payload)
        rows.extend(page_items)
        if len(page_items) < size:
            break
    return rows


def _post_cninfo_query(payload: dict[str, Any]) -> dict[str, Any]:
    import urllib.parse

    data = urllib.parse.urlencode(payload).encode("utf-8")
    request = Request(
        CNINFO_SEARCH_URL,
        data=data,
        headers={
            "User-Agent": "Mozilla/5.0",
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "Referer": "http://www.cninfo.com.cn/new/commonUrl/pageOfSearch?url=disclosure/list/search",
        },
    )
    with urlopen(request, timeout=20) as response:
        return _loads_json(response.read())


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


def _format_cninfo_date(value: str | date) -> str:
    if isinstance(value, date):
        return value.isoformat()
    text = str(value or "").strip()
    if len(text) == 8 and text.isdigit():
        return f"{text[:4]}-{text[4:6]}-{text[6:]}"
    return text


def _loads_json(data: bytes) -> dict[str, Any]:
    import json

    return json.loads(data.decode("utf-8"))
