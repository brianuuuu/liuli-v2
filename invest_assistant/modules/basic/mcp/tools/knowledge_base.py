from invest_assistant.modules.basic.mcp.auth import McpClientConfig
from invest_assistant.modules.basic.mcp.service import execute_read_tool, execute_write_tool
from invest_assistant.modules.knowledge_base import service as knowledge_service


def get_researcher_profile(*, db, client: McpClientConfig, researcher: str) -> dict:
    return execute_read_tool(
        db=db,
        client=client,
        tool_name="knowledge_base.get_researcher_profile",
        arguments={"researcher": researcher},
        handler=knowledge_service.get_researcher_profile_bundle,
    )


def create_note(*, db, client: McpClientConfig, content: str) -> dict:
    def handler(session, content: str) -> dict:
        note, duplicated = knowledge_service.create_note_from_mcp(
            session,
            content=content,
            client_name=client.name,
        )
        return {
            "note_id": note.id,
            "title": note.title,
            "content": note.content,
            "note_type": note.note_type,
            "created_at": note.created_at,
            # 命中幂等窗口时回的是已有那条，调用方据此知道没有新建
            "duplicated": duplicated,
        }

    return execute_write_tool(
        db=db,
        client=client,
        tool_name="knowledge_base.create_note",
        arguments={"content": content},
        handler=handler,
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
