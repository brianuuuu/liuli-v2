from invest_assistant.modules.basic.mcp.auth import McpClientConfig
from invest_assistant.modules.basic.mcp.service import execute_read_tool, execute_write_tool
from invest_assistant.modules.knowledge_base import service as knowledge_service


def get_researcher_profile(*, db, client: McpClientConfig, researcher: str, limit: int = 1) -> dict:
    return execute_read_tool(
        db=db,
        client=client,
        tool_name="knowledge_base.get_researcher_profile",
        arguments={"researcher": researcher, "limit": limit},
        handler=lambda session, researcher, limit: knowledge_service.get_researcher_profile_bundle(session, researcher),
    )


def upload_research_feedback(
    *,
    db,
    client: McpClientConfig,
    title: str,
    markdown: str,
    researcher_code: str | None = None,
    skill_name: str | None = None,
    business_module: str | None = None,
    source: str = "mcp",
    status: str = "received",
    now=None,
) -> dict:
    def handler(
        session,
        title: str,
        markdown: str,
        researcher_code: str | None = None,
        skill_name: str | None = None,
        business_module: str | None = None,
        source: str = "mcp",
        status: str = "received",
        now=None,
    ) -> dict:
        feedback, report_id, content_size = knowledge_service.upload_research_feedback(
            session,
            title=title,
            markdown=markdown,
            researcher_code=researcher_code,
            skill_name=skill_name,
            business_module=business_module,
            source=source,
            status=status,
            now=now,
        )
        return {
            "feedback_id": feedback.id,
            "report_id": report_id,
            "report_path": feedback.report_path,
            "title": feedback.title,
            "researcher_code": feedback.researcher_code,
            "skill_name": feedback.skill_name,
            "business_module": feedback.business_module,
            "source": feedback.source,
            "status": feedback.status,
            "content_size": content_size,
        }

    return execute_write_tool(
        db=db,
        client=client,
        tool_name="knowledge_base.upload_research_feedback",
        arguments={
            "title": title,
            "markdown": markdown,
            "researcher_code": researcher_code,
            "skill_name": skill_name,
            "business_module": business_module,
            "source": source,
            "status": status,
            "now": now,
        },
        handler=handler,
    )
