from time import perf_counter

from sqlalchemy import select

from invest_assistant.bootstrap.database import SessionLocal
from invest_assistant.modules.basic.ai_audit.service import create_ai_request_log
from invest_assistant.modules.basic.job_center.types import JobDefinition, JobResult
from invest_assistant.modules.basic.system_config.service import get_runtime_state, set_runtime_state
from invest_assistant.modules.knowledge_base.service import get_active_prompt_by_key
from invest_assistant.modules.stock_analysis import ai as stock_ai
from invest_assistant.modules.stock_analysis import service as stock_service
from invest_assistant.modules.stock_analysis.models import StockMaterial
from invest_assistant.services.deepseek import client as deepseek_client

REVIEW_STOCK_EVENTS_JOB_NAME = "stock_analysis.review_stock_events_deepseek"
SYNC_DAILY_BARS_JOB_NAME = "stock_analysis.sync_daily_bars"
DEFAULT_STOCK_EVENT_REVIEW_MODEL = "deepseek-v4-pro"
DEFAULT_REVIEW_BATCH_SIZE = 20
DEFAULT_REVIEW_MAX_ITEMS = 100
REVIEW_STOCK_EVENTS_STATE_NAMESPACE = f"job.{REVIEW_STOCK_EVENTS_JOB_NAME}"
REVIEW_MATERIAL_CURSOR_KEY = "last_material_id"


def _positive_int(value, default: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return max(parsed, 1)


def _runtime_state_int_value(value: str | None) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def _review_material_cursor(db, namespace: str) -> tuple[int, str | None]:
    state = get_runtime_state(db, namespace, REVIEW_MATERIAL_CURSOR_KEY)
    state_value = state.state_value if state is not None else None
    return _runtime_state_int_value(state_value), state_value


def _pending_stock_materials(db, max_items: int, cursor: int = 0) -> list[StockMaterial]:
    return list(
        db.scalars(
            select(StockMaterial)
            .where(StockMaterial.status == "pending", StockMaterial.id > cursor)
            .order_by(StockMaterial.id.asc())
            .limit(max_items)
        )
    )


def _chunks(rows: list[StockMaterial], size: int):
    for index in range(0, len(rows), size):
        yield rows[index:index + size]


def _log_ai_call(
    db,
    *,
    model: str,
    status: str,
    started: float,
    usage: dict | None = None,
    error_message: str | None = None,
) -> None:
    usage = usage or {}
    create_ai_request_log(
        db,
        provider="deepseek",
        model=model,
        task_name=REVIEW_STOCK_EVENTS_JOB_NAME,
        status=status,
        duration_ms=int((perf_counter() - started) * 1000),
        prompt_tokens=int(usage.get("prompt_tokens") or 0),
        completion_tokens=int(usage.get("completion_tokens") or 0),
        total_tokens=int(usage.get("total_tokens") or 0),
        error_message=error_message,
    )


def review_stock_events_deepseek_job(
    model: str | None = None,
    batch_size: int = DEFAULT_REVIEW_BATCH_SIZE,
    max_items: int = DEFAULT_REVIEW_MAX_ITEMS,
    ignore_watermark: bool = False,
    **kwargs,
) -> JobResult:
    db = SessionLocal()
    try:
        batch_limit = _positive_int(batch_size, DEFAULT_REVIEW_BATCH_SIZE)
        item_limit = _positive_int(max_items, DEFAULT_REVIEW_MAX_ITEMS)
        old_cursor, old_state = _review_material_cursor(db, REVIEW_STOCK_EVENTS_STATE_NAMESPACE)
        effective_cursor = 0 if ignore_watermark else old_cursor
        pending_materials = _pending_stock_materials(db, item_limit, effective_cursor)
        if not pending_materials:
            return JobResult(
                success=True,
                message="no pending stock materials after watermark",
                processed_count=0,
                skipped_count=1,
                extra={
                    "old_cursor": old_cursor,
                    "new_cursor": old_cursor,
                    "state_namespace": REVIEW_STOCK_EVENTS_STATE_NAMESPACE,
                    "state_key": REVIEW_MATERIAL_CURSOR_KEY,
                    "ignore_watermark": ignore_watermark,
                },
            )

        prompt = get_active_prompt_by_key(db, REVIEW_STOCK_EVENTS_JOB_NAME)
        active_model = str(model or getattr(prompt, "model", None) or DEFAULT_STOCK_EVENT_REVIEW_MODEL).strip()
        if prompt is None:
            message = f"active prompt not found: {REVIEW_STOCK_EVENTS_JOB_NAME}"
            create_ai_request_log(
                db,
                provider="deepseek",
                model=active_model,
                task_name=REVIEW_STOCK_EVENTS_JOB_NAME,
                status="failed",
                duration_ms=0,
                error_message=message,
            )
            return JobResult(success=False, message=message, processed_count=len(pending_materials))

        processed_count = 0
        updated_count = 0
        skipped_count = 0
        confirmed_count = 0
        ignored_count = 0
        for batch in _chunks(pending_materials, batch_limit):
            started = perf_counter()
            try:
                review = stock_ai.review_stock_materials(db, batch, prompt, active_model, deepseek_client)
            except Exception as exc:
                _log_ai_call(db, model=active_model, status="failed", started=started, error_message=str(exc))
                return JobResult(
                    success=False,
                    message=str(exc),
                    processed_count=processed_count + len(batch),
                    updated_count=updated_count,
                    skipped_count=skipped_count,
                    extra={
                        "model": active_model,
                        "confirmed_count": confirmed_count,
                        "ignored_count": ignored_count,
                        "old_cursor": old_cursor,
                        "new_cursor": old_cursor,
                        "state_namespace": REVIEW_STOCK_EVENTS_STATE_NAMESPACE,
                        "state_key": REVIEW_MATERIAL_CURSOR_KEY,
                    },
                )

            _log_ai_call(db, model=active_model, status="success", started=started, usage=review["usage"])
            decisions = review["decisions"]
            for material in batch:
                decision = decisions.get(material.id)
                if decision is None:
                    skipped_count += 1
                    continue
                material.status = decision["status"]
                material.impact_direction = decision["impact_direction"]
                material.importance_level = decision["importance_level"]
                material.note = decision["note"]
                updated_count += 1
                if material.status == "confirmed":
                    confirmed_count += 1
                elif material.status == "ignored":
                    ignored_count += 1
            new_cursor = max(old_cursor, int(batch[-1].id))
            set_runtime_state(
                db,
                REVIEW_STOCK_EVENTS_STATE_NAMESPACE,
                REVIEW_MATERIAL_CURSOR_KEY,
                str(new_cursor),
                value_type="int",
                ext={
                    "job_name": REVIEW_STOCK_EVENTS_JOB_NAME,
                    "old_state": old_state,
                    "processed_count": processed_count + len(batch),
                    "updated_count": updated_count,
                    "skipped_count": skipped_count,
                    "model": active_model,
                },
                commit=False,
            )
            db.commit()
            old_cursor = new_cursor
            processed_count += len(batch)

        return JobResult(
            success=True,
            message=f"reviewed {processed_count} pending stock materials",
            processed_count=processed_count,
            updated_count=updated_count,
            skipped_count=skipped_count,
            extra={
                "model": active_model,
                "confirmed_count": confirmed_count,
                "ignored_count": ignored_count,
                "old_cursor": _runtime_state_int_value(old_state),
                "new_cursor": old_cursor,
                "state_namespace": REVIEW_STOCK_EVENTS_STATE_NAMESPACE,
                "state_key": REVIEW_MATERIAL_CURSOR_KEY,
                "ignore_watermark": ignore_watermark,
            },
        )
    finally:
        db.close()


def sync_daily_bars_job(
    stock_code: str | None = None,
    pool_status: str = "focused,watching,candidate",
    years: int = 3,
    adj: str = "qfq",
    force_refresh: bool = False,
    max_stocks: int = 200,
    **kwargs,
) -> JobResult:
    db = SessionLocal()
    try:
        return stock_service.sync_daily_bars(
            db,
            stock_code=stock_code,
            pool_status=pool_status,
            years=_positive_int(years, 3),
            adj=str(adj or "qfq"),
            force_refresh=bool(force_refresh),
            max_stocks=_positive_int(max_stocks, 200),
        )
    finally:
        db.close()


JOBS = [
    JobDefinition(
        job_name=SYNC_DAILY_BARS_JOB_NAME,
        module_name="stock_analysis",
        display_name="同步标的日线行情",
        description="按标的池同步 A 股前复权日线行情，并缓存 K 线和 MA 指标",
        handler=sync_daily_bars_job,
        trigger_type="both",
        cron_expr="30 18 * * 1-5",
        timeout_seconds=1800,
        max_retries=1,
        params_schema={
            "stock_code": {"type": "string", "label": "股票代码", "default": ""},
            "pool_status": {"type": "string", "label": "标的池状态", "default": "focused,watching,candidate"},
            "years": {"type": "number", "label": "同步年数", "default": 3, "min": 1},
            "adj": {"type": "string", "label": "复权", "default": "qfq"},
            "force_refresh": {"type": "boolean", "label": "强制刷新", "default": False},
            "max_stocks": {"type": "number", "label": "最多标的", "default": 200, "min": 1},
        },
        tags=["stock_analysis", "daily_bar", "tushare"],
    ),
    JobDefinition(
        job_name=REVIEW_STOCK_EVENTS_JOB_NAME,
        module_name="stock_analysis",
        display_name="AI审核标的事件",
        description="审核待处理标的事件是否值得纳入标的材料库，作为长期分析素材",
        handler=review_stock_events_deepseek_job,
        trigger_type="manual",
        timeout_seconds=900,
        max_retries=0,
        params_schema={
            "model": {"type": "string", "label": "模型", "default": DEFAULT_STOCK_EVENT_REVIEW_MODEL},
            "batch_size": {"type": "number", "label": "每批数量", "default": DEFAULT_REVIEW_BATCH_SIZE, "min": 1},
            "max_items": {"type": "number", "label": "最多处理", "default": DEFAULT_REVIEW_MAX_ITEMS, "min": 1},
            "ignore_watermark": {"type": "boolean", "label": "忽略水位重跑", "default": False},
        },
        tags=["stock_analysis", "ai_review", "stock_material"],
    )
]
