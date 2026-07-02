from invest_assistant.modules.basic.mcp.auth import McpClientConfig
from invest_assistant.modules.basic.mcp.service import execute_read_tool
from invest_assistant.modules.knowledge_base import service as knowledge_service


def get_researcher_profile(*, db, client: McpClientConfig, researcher: str, limit: int = 1) -> dict:
    return execute_read_tool(
        db=db,
        client=client,
        tool_name="knowledge_base.get_researcher_profile",
        arguments={"researcher": researcher, "limit": limit},
        handler=lambda session, researcher, limit: knowledge_service.get_researcher_profile_bundle(session, researcher),
    )


def get_researcher_soul(*, db, client: McpClientConfig, soul_id: int, limit: int = 1) -> dict:
    return execute_read_tool(
        db=db,
        client=client,
        tool_name="knowledge_base.get_researcher_soul",
        arguments={"soul_id": soul_id, "limit": limit},
        handler=lambda session, soul_id, limit: knowledge_service.read_researcher_soul_bundle(session, soul_id),
    )


def get_researcher_method(*, db, client: McpClientConfig, method_id: int, limit: int = 1) -> dict:
    return execute_read_tool(
        db=db,
        client=client,
        tool_name="knowledge_base.get_researcher_method",
        arguments={"method_id": method_id, "limit": limit},
        handler=lambda session, method_id, limit: knowledge_service.read_researcher_method_bundle(session, method_id),
    )
