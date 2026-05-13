from invest_assistant.modules.basic.job_center.types import JobDefinition, JobResult


def fetch_cninfo_job(**kwargs) -> JobResult:
    return JobResult(success=True, message="cninfo fetch is not implemented in phase 1")


def parse_pdf_job(**kwargs) -> JobResult:
    return JobResult(success=True, message="pdf parse is not implemented in phase 1")


JOBS = [
    JobDefinition(
        job_name="disclosure_library.fetch_cninfo",
        module_name="disclosure_library",
        display_name="拉取巨潮公告财报",
        description="阶段 1 仅注册任务定义，真实拉取在后续阶段实现",
        handler=fetch_cninfo_job,
        trigger_type="manual",
    ),
    JobDefinition(
        job_name="disclosure_library.parse_pdf",
        module_name="disclosure_library",
        display_name="解析公告财报 PDF",
        description="阶段 1 仅注册任务定义，真实 PDF 解析在后续阶段实现",
        handler=parse_pdf_job,
        trigger_type="manual",
    ),
]
