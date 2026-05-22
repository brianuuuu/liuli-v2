from dataclasses import asdict

from invest_assistant.bootstrap.config import get_settings
from invest_assistant.bootstrap.database import SessionLocal
from invest_assistant.modules.basic.job_center.types import JobDefinition, JobResult
from invest_assistant.modules.basic.stock_master import service
from invest_assistant.modules.basic.system_config.models import SystemConfig

TUSHARE_TOKEN_CONFIG_KEYS = ("tushare-token", "tushare_token", "TUSHARE_TOKEN")


def _get_tushare_token() -> str:
    db = SessionLocal()
    try:
        for config_key in TUSHARE_TOKEN_CONFIG_KEYS:
            config = db.query(SystemConfig).filter(SystemConfig.config_key == config_key).one_or_none()
            if config is not None and config.enabled and config.config_value.strip():
                return config.config_value.strip()
    finally:
        db.close()
    return get_settings().tushare_token.strip()


def _fetch_tushare_a_stock_items_with_token(token: str):
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

    items = []
    for _, row in df.iterrows():
        code = row.get("symbol") or str(row.get("ts_code") or "").split(".", maxsplit=1)[0]
        item = service.build_a_stock_item(code, row.get("name"))
        if item is not None:
            items.append(item)
    if not items:
        raise RuntimeError("Tushare stock list is empty")
    return items


def _fetch_tushare_a_stock_items():
    return _fetch_tushare_a_stock_items_with_token(_get_tushare_token())


def _fetch_akshare_a_stock_items():
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

    items = []
    for _, row in df.iterrows():
        item = service.build_a_stock_item(row.get("code"), row.get("name"))
        if item is not None:
            items.append(item)
    if not items:
        raise RuntimeError("AkShare stock list is empty")
    return items


def _fetch_a_stock_items():
    errors = []
    try:
        return _fetch_tushare_a_stock_items(), "tushare"
    except Exception as exc:
        errors.append(str(exc))

    try:
        return _fetch_akshare_a_stock_items(), "akshare"
    except Exception as exc:
        errors.append(str(exc))

    raise RuntimeError("; ".join(errors))


def sync_stock_basic_job(**kwargs) -> JobResult:
    try:
        items, source = _fetch_a_stock_items()
    except Exception as exc:
        return JobResult(success=False, message=str(exc))

    db = SessionLocal()
    try:
        result = service.sync_a_stock_basics(db, items)
    except Exception as exc:
        db.rollback()
        return JobResult(success=False, message=f"sync stock basic failed: {exc}")
    finally:
        db.close()

    return JobResult(
        success=True,
        message=(
            f"synced {result.total} A-share stocks "
            f"(SSE {result.sse}, SZSE {result.szse}, BJ {result.bj})"
        ),
        fetched_count=result.total,
        inserted_count=result.inserted,
        updated_count=result.updated,
        processed_count=result.total + result.disabled,
        extra={**asdict(result), "source": source},
    )


JOBS = [
    JobDefinition(
        job_name="stock_master.sync_stock_basic",
        module_name="stock_master",
        display_name="同步股票基础库",
        description="从 Tushare 同步 A 股基础库，失败时使用 AkShare 兜底",
        handler=sync_stock_basic_job,
        trigger_type="manual",
    )
]
