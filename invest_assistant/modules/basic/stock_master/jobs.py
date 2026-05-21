from dataclasses import asdict

from invest_assistant.bootstrap.database import SessionLocal
from invest_assistant.modules.basic.job_center.types import JobDefinition, JobResult
from invest_assistant.modules.basic.stock_master import service


def _fetch_a_stock_items():
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


def sync_stock_basic_job(**kwargs) -> JobResult:
    try:
        items = _fetch_a_stock_items()
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
        extra=asdict(result),
    )


JOBS = [
    JobDefinition(
        job_name="stock_master.sync_stock_basic",
        module_name="stock_master",
        display_name="同步股票基础库",
        description="阶段 1 仅注册任务定义，真实 AkShare 同步在后续阶段实现",
        handler=sync_stock_basic_job,
        trigger_type="manual",
    )
]
