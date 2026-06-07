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
