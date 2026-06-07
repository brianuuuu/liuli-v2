from invest_assistant.bootstrap.database import SessionLocal
from invest_assistant.modules.basic.disclosure_library import service
from invest_assistant.modules.basic.job_center.types import JobDefinition, JobResult


def fetch_stock_announcements_job(
    stock_code: str | None = None,
    days: int = 30,
    pool_status: str = "focused,watching,candidate",
    page_size: int = 30,
    max_pages: int = 2,
    **kwargs,
) -> JobResult:
    db = SessionLocal()
    try:
        return service.fetch_stock_announcements(
            db,
            stock_code=stock_code,
            days=days,
            pool_status=pool_status,
            page_size=page_size,
            max_pages=max_pages,
            auto_to_source_item=False,
        )
    except Exception as exc:
        return JobResult(success=False, message=str(exc))
    finally:
        db.close()


def download_file_job(disclosure_id: int, **kwargs) -> JobResult:
    db = SessionLocal()
    try:
        item = service.get_disclosure(db, int(disclosure_id))
        if item is None:
            return JobResult(success=False, message="disclosure not found")
        service.download_disclosure_file(db, item)
        return JobResult(success=True, message="downloaded disclosure file", processed_count=1, updated_count=1)
    except Exception as exc:
        return JobResult(success=False, message=str(exc))
    finally:
        db.close()


def parse_pdf_job(disclosure_id: int, **kwargs) -> JobResult:
    db = SessionLocal()
    try:
        item = service.get_disclosure(db, int(disclosure_id))
        if item is None:
            return JobResult(success=False, message="disclosure not found")
        service.parse_disclosure_file(db, item)
        return JobResult(success=True, message="parsed disclosure file", processed_count=1, updated_count=1)
    except Exception as exc:
        return JobResult(success=False, message=str(exc))
    finally:
        db.close()


JOBS = [
    JobDefinition(
        job_name="disclosure_library.fetch_stock_announcements",
        module_name="disclosure_library",
        display_name="拉取标的公告",
        description="按标的池从巨潮拉取最近公告，写入公告库",
        handler=fetch_stock_announcements_job,
        trigger_type="both",
        cron_expr="30 8 * * *",
        timeout_seconds=900,
        max_retries=1,
        params_schema={
            "stock_code": {"type": "string", "label": "特定股票代码", "placeholder": "选填，输入6位股票代码"},
            "days": {"type": "number", "label": "最近天数", "default": 30, "min": 1},
            "pool_status": {"type": "string", "label": "标的池状态", "default": "focused,watching,candidate"},
            "page_size": {"type": "number", "label": "每页公告数", "default": 30, "min": 1},
            "max_pages": {"type": "number", "label": "每只最多页数", "default": 2, "min": 1},
        },
        tags=["announcement", "cninfo", "stock_pool"],
    ),
    JobDefinition(
        job_name="disclosure_library.download_file",
        module_name="disclosure_library",
        display_name="下载公告财报文件",
        description="按 source_url 下载公告/财报文件并归档到 var/raw/disclosures",
        handler=download_file_job,
        trigger_type="manual",
        timeout_seconds=300,
        max_retries=1,
    ),
    JobDefinition(
        job_name="disclosure_library.parse_pdf",
        module_name="disclosure_library",
        display_name="解析公告财报文件",
        description="解析公告/财报文件并写入 var/processed/disclosures",
        handler=parse_pdf_job,
        trigger_type="manual",
        timeout_seconds=300,
        max_retries=1,
    ),
]
