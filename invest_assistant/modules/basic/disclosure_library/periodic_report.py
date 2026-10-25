"""定期报告（年报、半年报、季报）的识别与报告期解析。

只认标题以正式报告名结尾的公告，例如"万东医疗2026年第三季度报告"。摘要、英文版、
更正后版本、问询函、提示性公告都不以报告名结尾，自然排除；业绩预告、业绩快报也不算。
"""

import re

PERIODIC_DISCLOSURE_TYPES = ("annual_report", "interim_report", "quarterly_report")

_REPORT_SUFFIX_PERIOD = {
    "半年度报告": "Q2",
    "中期报告": "Q2",
    "第一季度报告": "Q1",
    "一季度报告": "Q1",
    "第三季度报告": "Q3",
    "三季度报告": "Q3",
    "年度报告": "Q4",
}
# 长的报告名放前面，免得"半年度报告"被"年度报告"先匹配走。
_PERIODIC_TITLE_PATTERN = re.compile(
    r"(\d{4})\s*年\s*(" + "|".join(sorted(_REPORT_SUFFIX_PERIOD, key=len, reverse=True)) + r")$"
)
_REPORT_PERIOD_PATTERN = re.compile(r"(\d{4})\s*-?\s*Q\s*([1-4])", re.IGNORECASE)


def periodic_report_period(title: str | None) -> str | None:
    """定期报告标题解析出 `YYYY-QN` 报告期，非定期报告正文返回 None。"""
    match = _PERIODIC_TITLE_PATTERN.search(re.sub(r"\s+", "", title or ""))
    if match is None:
        return None
    return f"{match.group(1)}-{_REPORT_SUFFIX_PERIOD[match.group(2)]}"


def normalize_report_period(value: str | None) -> str | None:
    """把 `2026Q3`、`2026-q3` 之类统一成 `2026-Q3`，认不出来返回 None。"""
    match = _REPORT_PERIOD_PATTERN.search(value or "")
    return f"{match.group(1)}-Q{match.group(2)}" if match else None


def guess_disclosure_type(title: str) -> str:
    if "半年度报告" in title or "中期报告" in title:
        return "interim_report"
    if "季度报告" in title or "一季报" in title or "三季报" in title:
        return "quarterly_report"
    if "年度报告" in title:
        return "annual_report"
    return "announcement"
