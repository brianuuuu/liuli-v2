from dataclasses import asdict

from invest_assistant.bootstrap.database import SessionLocal
from invest_assistant.modules.basic.job_center.types import JobDefinition, JobResult
from invest_assistant.modules.basic.stock_master import service
from invest_assistant.services.akshare.client import fetch_a_stock_code_name_rows
from invest_assistant.services.tushare.client import fetch_a_stock_basic_rows


def _build_items_from_tushare_rows(rows: list[dict]):
    items = []
    for row in rows:
        code = row.get("symbol") or str(row.get("ts_code") or "").split(".", maxsplit=1)[0]
        item = service.build_a_stock_item(code, row.get("name"))
        if item is not None:
            items.append(item)
    if not items:
        raise RuntimeError("Tushare stock list is empty")
    return items


def _build_items_from_akshare_rows(rows: list[dict]):
    items = []
    for row in rows:
        item = service.build_a_stock_item(row.get("code"), row.get("name"))
        if item is not None:
            items.append(item)
    if not items:
        raise RuntimeError("AkShare stock list is empty")
    return items


def _fetch_a_stock_items():
    errors = []
    try:
        return _build_items_from_tushare_rows(fetch_a_stock_basic_rows()), "tushare"
    except Exception as exc:
        errors.append(str(exc))

    try:
        return _build_items_from_akshare_rows(fetch_a_stock_code_name_rows()), "akshare"
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
