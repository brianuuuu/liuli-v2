from invest_assistant.bootstrap.database import SessionLocal
from invest_assistant.modules.basic.disclosure_library import service
from invest_assistant.modules.basic.job_center.types import JobDefinition, JobResult


def fetch_cninfo_job(keyword: str = "", page_num: int = 1, page_size: int = 30, **kwargs) -> JobResult:
    db = SessionLocal()
    try:
        items = service.fetch_cninfo(db, keyword=keyword, page_num=page_num, page_size=page_size)
        return JobResult(
            success=True,
            message=f"fetched {len(items)} cninfo disclosures",
            fetched_count=len(items),
            inserted_count=len(items),
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


def to_market_radar_job(disclosure_id: int, **kwargs) -> JobResult:
    db = SessionLocal()
    try:
        item = service.get_disclosure(db, int(disclosure_id))
        if item is None:
            return JobResult(success=False, message="disclosure not found")
        service.disclosure_to_source_item(db, item)
        return JobResult(success=True, message="created market radar source item", processed_count=1, inserted_count=1)
    except Exception as exc:
        return JobResult(success=False, message=str(exc))
    finally:
        db.close()


JOBS = [
    JobDefinition(
        job_name="disclosure_library.fetch_cninfo",
        module_name="disclosure_library",
        display_name="拉取巨潮公告财报",
        description="拉取巨潮公告/财报元数据并写入 company_disclosure",
        handler=fetch_cninfo_job,
        trigger_type="manual",
        timeout_seconds=180,
        max_retries=1,
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
    JobDefinition(
        job_name="disclosure_library.to_market_radar",
        module_name="disclosure_library",
        display_name="公告写入市场雷达",
        description="将公告/财报内容转换为 market_radar.source_item",
        handler=to_market_radar_job,
        trigger_type="manual",
        timeout_seconds=120,
        max_retries=0,
    ),
]
