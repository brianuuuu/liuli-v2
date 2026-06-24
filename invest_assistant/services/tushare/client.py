from datetime import datetime
import math

from invest_assistant.bootstrap.config import get_settings
from invest_assistant.bootstrap.database import SessionLocal
from invest_assistant.modules.basic.system_config.models import SystemConfig

TUSHARE_TOKEN_CONFIG_KEYS = ("tushare-token", "tushare_token", "TUSHARE_TOKEN")


def get_tushare_token() -> str:
    db = SessionLocal()
    try:
        for config_key in TUSHARE_TOKEN_CONFIG_KEYS:
            config = db.query(SystemConfig).filter(SystemConfig.config_key == config_key).one_or_none()
            if config is not None and config.enabled and config.config_value.strip():
                return config.config_value.strip()
    finally:
        db.close()
    return get_settings().tushare_token.strip()


def fetch_a_stock_basic_rows() -> list[dict]:
    token = get_tushare_token()
    if not token:
        raise RuntimeError("tushare token is not configured")

    try:
        import tushare as ts
    except Exception as exc:
        raise RuntimeError(f"tushare is unavailable: {exc}") from exc

    try:
        ts.set_token(token)
        pro = ts.pro_api(token)
        df = pro.stock_basic(exchange="", list_status="L", fields="ts_code,symbol,name")
    except Exception as exc:
        raise RuntimeError(f"failed to fetch A-share stock list from Tushare: {exc}") from exc

    required_columns = {"ts_code", "name"}
    missing_columns = required_columns - set(df.columns)
    if missing_columns:
        raise RuntimeError(f"Tushare stock list missing columns: {', '.join(sorted(missing_columns))}")
    return [dict(row) for _, row in df.iterrows()]


def fetch_a_stock_daily_bar_rows(
    ts_code: str,
    *,
    start_date: str,
    end_date: str,
    adj: str = "qfq",
    ma: list[int] | None = None,
) -> list[dict]:
    token = get_tushare_token()
    if not token:
        raise RuntimeError("tushare token is not configured")

    try:
        import tushare as ts
    except Exception as exc:
        raise RuntimeError(f"tushare is unavailable: {exc}") from exc

    ma_windows = ma or [5, 20, 60, 250]
    try:
        ts.set_token(token)
        df = ts.pro_bar(
            ts_code=ts_code,
            start_date=start_date,
            end_date=end_date,
            freq="D",
            adj=adj,
            ma=ma_windows,
        )
    except Exception as exc:
        raise RuntimeError(f"failed to fetch daily bars from Tushare for {ts_code}: {exc}") from exc

    if df is None or getattr(df, "empty", False):
        return []

    required_columns = {"trade_date", "open", "high", "low", "close"}
    missing_columns = required_columns - set(df.columns)
    if missing_columns:
        raise RuntimeError(f"Tushare daily bars missing columns: {', '.join(sorted(missing_columns))}")

    rows: list[dict] = []
    for _, row in df.iterrows():
        payload = dict(row)
        payload.setdefault("ts_code", ts_code)
        rows.append(payload)
    return rows


def fetch_realtime_quote_rows(symbols: list[str]) -> list[dict]:
    normalized_symbols = [str(symbol or "").strip().upper() for symbol in symbols if str(symbol or "").strip()]
    if not normalized_symbols:
        return []

    try:
        import tushare as ts
    except Exception as exc:
        raise RuntimeError(f"tushare is unavailable: {exc}") from exc

    primary_error: Exception | None = None
    token = get_tushare_token()
    if token and hasattr(ts, "realtime_quote"):
        try:
            ts.set_token(token)
            frame = ts.realtime_quote(ts_code=",".join(normalized_symbols))
            rows = _normalize_realtime_frame(frame, source="tushare.realtime_quote")
            if rows:
                return rows
        except Exception as exc:
            primary_error = exc

    if hasattr(ts, "get_realtime_quotes"):
        try:
            bare_codes = [_bare_stock_code(symbol) for symbol in normalized_symbols]
            frame = ts.get_realtime_quotes(bare_codes)
            rows = _normalize_realtime_frame(frame, source="tushare.get_realtime_quotes")
            if rows:
                return rows
        except Exception as exc:
            if primary_error is not None:
                raise RuntimeError(f"failed to fetch realtime quotes: {primary_error}; fallback failed: {exc}") from exc
            raise RuntimeError(f"failed to fetch realtime quotes: {exc}") from exc

    if primary_error is not None:
        raise RuntimeError(f"failed to fetch realtime quotes: {primary_error}") from primary_error
    raise RuntimeError("tushare realtime quote API is unavailable")


def _normalize_realtime_frame(frame, *, source: str) -> list[dict]:
    if frame is None or getattr(frame, "empty", False):
        return []
    columns = set(getattr(frame, "columns", []))
    required = {"price", "pre_close"}
    if not required.issubset(columns):
        missing = ", ".join(sorted(required - columns))
        raise RuntimeError(f"Tushare realtime quote missing columns: {missing}")

    rows: list[dict] = []
    for _, row in frame.iterrows():
        payload = dict(row)
        price = _float_or_none(payload.get("price"))
        pre_close = _float_or_none(payload.get("pre_close"))
        stock_code = _bare_stock_code(payload.get("code") or payload.get("ts_code") or payload.get("symbol"))
        if price is None or pre_close is None or not stock_code:
            continue
        rows.append(
            {
                "stock_code": stock_code,
                "price": price,
                "pre_close": pre_close,
                "quote_time": _parse_quote_time(payload.get("date"), payload.get("time")),
                "source": source,
            }
        )
    return rows


def _bare_stock_code(value) -> str:
    text = str(value or "").strip().upper()
    if "." in text:
        text = text.split(".", 1)[0]
    return text


def _parse_quote_time(date_value, time_value) -> datetime | None:
    date_text = str(date_value or "").strip()
    time_text = str(time_value or "").strip()
    if not date_text:
        return None
    for fmt, text_value in (
        ("%Y-%m-%d %H:%M:%S", f"{date_text} {time_text or '00:00:00'}"),
        ("%Y%m%d %H:%M:%S", f"{date_text} {time_text or '00:00:00'}"),
        ("%Y-%m-%d", date_text),
        ("%Y%m%d", date_text),
    ):
        try:
            return datetime.strptime(text_value[: len(fmt.replace('%', '')) + 8] if fmt.endswith("%S") else text_value, fmt)
        except ValueError:
            continue
    return None


def _float_or_none(value) -> float | None:
    if value is None:
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(parsed) or math.isinf(parsed):
        return None
    return parsed
