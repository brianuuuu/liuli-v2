"""富途牛牛官网快讯接口。

之前经 akshare 的 stock_info_global_futu 转手，它请求的就是同一个地址，但只留标题、内容、时间、链接四列，
把 level（重要标记）和翻页游标都丢了，时间也按运行机器的本地时区转成不带时区的字符串，而且没设超时。
这里直接请求，原样返回每条快讯的字段，由调用方决定怎么用。

接口不是公开 API，没有文档和兼容承诺，也没有公开的限流规则；调用方应保持低频，失败时不要连续重试。
"""

from dataclasses import dataclass

import requests

FUTU_FLASH_URL = "https://news.futunn.com/news-site-api/main/get-flash-list"
FUTU_REQUEST_TIMEOUT_SECONDS = 15
FUTU_REQUEST_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)"
    " Chrome/111.0.0.0 Safari/537.36"
}


@dataclass(frozen=True)
class FutuFlashPage:
    news: list[dict]
    # 下一页（更早的快讯）的游标，原样回传给 seq_mark
    next_seq_mark: str | None
    has_more: bool


def fetch_futu_flash_page(seq_mark: str | None = None, page_size: int = 100) -> FutuFlashPage:
    """取一页快讯，从新到旧。seq_mark 为空取最新一页。"""
    params = {"pageSize": str(max(int(page_size), 1))}
    if seq_mark:
        params["seqMark"] = seq_mark
    try:
        response = requests.get(
            FUTU_FLASH_URL,
            params=params,
            headers=FUTU_REQUEST_HEADERS,
            timeout=FUTU_REQUEST_TIMEOUT_SECONDS,
        )
    except requests.RequestException as exc:
        raise RuntimeError(f"failed to fetch Futu news: {exc}") from exc
    if response.status_code != 200:
        # 429/403 多半是被限流或拦截，报出状态码方便从任务日志里认出来
        raise RuntimeError(f"failed to fetch Futu news: HTTP {response.status_code}")
    try:
        payload = response.json()
    except ValueError as exc:
        raise RuntimeError("failed to fetch Futu news: response is not JSON") from exc
    if payload.get("code") != 0:
        raise RuntimeError(f"failed to fetch Futu news: code={payload.get('code')} message={payload.get('message')}")
    data = (payload.get("data") or {}).get("data") or {}
    return FutuFlashPage(
        news=list(data.get("news") or []),
        next_seq_mark=data.get("seqMark") or None,
        has_more=bool(data.get("hasMore")),
    )
