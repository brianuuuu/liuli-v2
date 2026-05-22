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
