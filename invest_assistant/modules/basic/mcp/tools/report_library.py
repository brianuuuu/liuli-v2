from invest_assistant.modules.basic.mcp.auth import McpClientConfig
from invest_assistant.modules.basic.mcp.service import execute_read_tool, execute_write_tool
from invest_assistant.modules.basic.report_library import service as report_service


def list_reports(*, db, client: McpClientConfig, limit: int = 50, offset: int = 0) -> dict:
    return execute_read_tool(
        db=db,
        client=client,
        tool_name="report_library.list_reports",
        arguments={"limit": limit, "offset": offset},
        handler=report_service.list_reports_page,
    )


def read_report_content(*, db, client: McpClientConfig, report_id: int, limit: int = 1) -> dict:
    def handler(session, report_id: int, limit: int) -> dict:
        report = report_service.get_report(session, report_id)
        if report is None:
            raise FileNotFoundError("report not found")
        path = report_service.resolve_report_path(report)
        if not path.exists():
            raise FileNotFoundError("report file not found")
        return {
            "report_id": report.id,
            "title": report.title,
            "content": path.read_text(encoding="utf-8"),
        }

    return execute_read_tool(
        db=db,
        client=client,
        tool_name="report_library.read_report_content",
        arguments={"report_id": report_id, "limit": limit},
        handler=handler,
    )


def upload_markdown_report(*, db, client: McpClientConfig, title: str, source_module: str, markdown: str, now=None) -> dict:
    def handler(session, title: str, source_module: str, markdown: str, now=None) -> dict:
        report, content_size = report_service.create_markdown_report_file_and_index(
            session,
            title=title,
            source_module=source_module,
            markdown=markdown,
            now=now,
        )
        return {
            "report_id": report.id,
            "title": report.title,
            "source_module": report.source_module,
            "file_path": report.file_path,
            "status": report.status,
            "content_size": content_size,
        }

    return execute_write_tool(
        db=db,
        client=client,
        tool_name="report_library.upload_markdown_report",
        arguments={"title": title, "source_module": source_module, "markdown": markdown, "now": now},
        handler=handler,
    )
