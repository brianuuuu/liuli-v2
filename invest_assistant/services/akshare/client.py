import json
import re


def fetch_a_stock_code_name_rows() -> list[dict]:
    try:
        import akshare as ak
    except Exception as exc:
        raise RuntimeError(f"akshare is unavailable: {exc}") from exc

    try:
        df = ak.stock_info_a_code_name()
    except Exception as exc:
        raise RuntimeError(f"failed to fetch A-share stock list from AkShare: {exc}") from exc

    required_columns = {"code", "name"}
    missing_columns = required_columns - set(df.columns)
    if missing_columns:
        raise RuntimeError(f"AkShare stock list missing columns: {', '.join(sorted(missing_columns))}")
    return [dict(row) for _, row in df.iterrows()]


def fetch_cls_news_rows(limit: int) -> list[dict]:
    try:
        import akshare as ak
    except Exception as exc:
        raise RuntimeError(f"akshare is unavailable: {exc}") from exc

    try:
        df = ak.stock_info_global_cls(symbol="全部")
    except Exception as exc:
        raise RuntimeError(f"failed to fetch CLS news: {exc}") from exc

    return [dict(row) for _, row in df.head(max(int(limit), 1)).iterrows()]


def fetch_futu_news_rows(limit: int) -> list[dict]:
    try:
        import akshare as ak
    except Exception as exc:
        raise RuntimeError(f"akshare is unavailable: {exc}") from exc

    try:
        df = ak.stock_info_global_futu()
    except Exception as exc:
        raise RuntimeError(f"failed to fetch Futu news: {exc}") from exc

    return [dict(row) for _, row in df.head(max(int(limit), 1)).iterrows()]


def _strip_eastmoney_markup(value) -> str:
    text_value = str(value or "").strip()
    text_value = re.sub(r"<[^>]+>", "", text_value)
    text_value = text_value.replace("\r\n", " ").replace("\n", " ").replace("\u3000", "")
    return re.sub(r"\s+", " ", text_value).strip()


def _parse_jsonp_payload(text: str) -> dict:
    body = str(text or "").strip()
    match = re.match(r"^[^(]*\((.*)\)\s*$", body, flags=re.S)
    if match:
        body = match.group(1)
    return json.loads(body)


def _eastmoney_article_url(row: dict) -> str | None:
    article_code = str(row.get("code") or row.get("-") or "").strip()
    if article_code:
        return f"http://finance.eastmoney.com/a/{article_code}.html"
    source_url = str(row.get("url") or row.get("新闻链接") or "").strip()
    return source_url or None


def _eastmoney_requests_module():
    try:
        import akshare as ak

        return ak.stock_news_em.__globals__.get("requests")
    except Exception:
        import requests

        return requests


def fetch_eastmoney_stock_news_rows(stock_code: str, limit: int = 50, page_size: int = 10) -> list[dict]:
    code = str(stock_code or "").strip()
    if not code:
        return []
    max_rows = max(int(limit), 1)
    page_size = max(int(page_size), 1)
    requests = _eastmoney_requests_module()
    url = "https://search-api-web.eastmoney.com/search/jsonp"
    callback = "jQuery35101792940631092459_1764599530165"
    headers = {
        "accept": "*/*",
        "accept-encoding": "gzip, deflate, br, zstd",
        "accept-language": "en,zh-CN;q=0.9,zh;q=0.8",
        "cache-control": "no-cache",
        "connection": "keep-alive",
        "cookie": "qgqp_b_id=652bf4c98a74e210088f372a17d4e27b; st_nvi=ulN5JAj9FUocz3p4klMME9f20; emshistory=%5B%22603777%22%5D; nid18=010d039dd427dc4d187090491f47d7ad; nid18_create_time=1764582801999; gviem=gSdeY51VWSuTzM3kWaagtf560; gviem_create_time=1764582801999; st_si=55269775884615; st_pvi=66803244437563; st_sp=2025-11-19%2014%3A19%3A16; st_inirUrl=https%3A%2F%2Fso.eastmoney.com%2Fnews%2Fs; st_sn=2; st_psi=20251201223210488-118000300905-0940816858; st_asi=delete",
        "host": "search-api-web.eastmoney.com",
        "pragma": "no-cache",
        "referer": "https://so.eastmoney.com/news/s?keyword=603777",
        "sec-ch-ua": '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "script",
        "sec-fetch-mode": "no-cors",
        "sec-fetch-site": "same-site",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
    }
    rows: list[dict] = []
    page_index = 1
    while len(rows) < max_rows:
        inner_param = {
            "uid": "",
            "keyword": code,
            "type": ["cmsArticleWebOld"],
            "client": "web",
            "clientType": "web",
            "clientVersion": "curr",
            "param": {
                "cmsArticleWebOld": {
                    "searchScope": "default",
                    "sort": "default",
                    "pageIndex": page_index,
                    "pageSize": page_size,
                    "preTag": "<em>",
                    "postTag": "</em>",
                }
            },
        }
        response = requests.get(
            url,
            params={
                "cb": callback,
                "param": json.dumps(inner_param, ensure_ascii=False),
                "_": "1764599530176",
            },
            headers=headers,
            timeout=15,
        )
        payload = _parse_jsonp_payload(response.text)
        page_rows = list(payload.get("result", {}).get("cmsArticleWebOld") or [])
        for row in page_rows:
            rows.append(
                {
                    "关键词": code,
                    "新闻标题": _strip_eastmoney_markup(row.get("title") or row.get("新闻标题")),
                    "新闻内容": _strip_eastmoney_markup(row.get("content") or row.get("新闻内容")),
                    "发布时间": str(row.get("date") or row.get("发布时间") or "").strip(),
                    "文章来源": str(row.get("mediaName") or row.get("文章来源") or "").strip(),
                    "新闻链接": _eastmoney_article_url(row),
                }
            )
            if len(rows) >= max_rows:
                break
        if len(page_rows) < page_size:
            break
        page_index += 1
    return rows
