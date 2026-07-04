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
