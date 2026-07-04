from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_knowledge_backend_uses_new_boundary_names():
    models = read("invest_assistant/modules/knowledge_base/models.py")
    schemas = read("invest_assistant/modules/knowledge_base/schemas.py")
    service = read("invest_assistant/modules/knowledge_base/service.py")
    router = read("invest_assistant/modules/knowledge_base/router.py")

    for expected in [
        "knowledge_external_skill",
        "knowledge_researcher",
        "knowledge_research_feedback",
        "KnowledgeExternalSkill",
        "KnowledgeResearcher",
        "KnowledgeResearchFeedback",
    ]:
        assert expected in models + schemas + service + router

    for expected in [
        "researcher_code: Mapped[str]",
        "display_name: Mapped[str]",
        "profile_path: Mapped[str]",
        "profile_hash: Mapped[str | None]",
        "researcher_code: str",
        "display_name: str",
        "profile_content: str = \"\"",
        "intro: str = \"\"",
        "soul: str = \"\"",
        "method: str = \"\"",
        "RESEARCHER_PROFILE_ROOT",
        "format_researcher_profile_markdown",
        "parse_researcher_profile_markdown",
    ]:
        assert expected in models + schemas + service

    for route in [
        '"/external-skills"',
        '"/external-skills/{skill_id}/export"',
        '"/researchers"',
        '"/research-feedback"',
    ]:
        assert route in router

    for legacy in [
        "knowledge_researcher_soul",
        "knowledge_researcher_method",
        "KnowledgeResearcherSoul",
        "KnowledgeResearcherMethod",
        '"/researcher-souls"',
        '"/researcher-methods"',
        "soul_id",
        "method_id",
        "KnowledgeSkill",
        "KnowledgeAgent",
        "KnowledgeFeedbackLog",
        "trigger_condition",
        "operation_steps",
        "mcp_flow",
        "report_feedback_rule",
        '"/skills"',
        '"/agents"',
        '"/agents/{agent_id}/run"',
        '"/feedback-logs"',
        "researcher soul is in use",
        "researcher method is in use",
    ]:
        assert legacy not in models + schemas + service + router


def test_knowledge_frontend_tabs_and_api_use_new_boundaries():
    navigation = read("invest_assistant/ui/web/src/app/navigation.tsx")
    page = read("invest_assistant/ui/web/src/pages/knowledge/KnowledgePage.tsx")
    api = read("invest_assistant/ui/web/src/api/knowledge.ts")
    css = read("invest_assistant/ui/web/src/styles/global.css")

    for tab in ["知识笔记", "对内 Prompt", "对外 Skills", "研究员", "研究回流"]:
        assert tab in navigation

    for expected in [
        "listKnowledgeExternalSkills",
        "exportKnowledgeExternalSkill",
        "listKnowledgeResearchers",
        "listKnowledgeResearchFeedback",
        "/api/knowledge/external-skills",
        "/api/knowledge/researchers",
        "/api/knowledge/research-feedback",
    ]:
        assert expected in page + api

    for expected in [
        "width={920}",
        "width={860}",
        "Tabs",
        "新增研究员",
        "MarkdownViewer",
        "createPortal",
        "full-screen-reader-overlay",
        "查看",
        "getApiErrorDetail",
        "研究时间",
        "回流时间",
        "更新时间",
    ]:
        assert expected in page

    for expected in [
        "researcher_code: string",
        "display_name: string",
        "profile_path: string",
        "profile_hash?: string | null",
        "profile_content: string",
        "intro: string",
        "soul: string",
        "method: string",
        'name="researcher_code"',
        'label="编号"',
        'name="display_name"',
        'label="展示名称"',
        'name="intro"',
        'label="简介"',
        'name="soul"',
        'label="价值观"',
        'name="method"',
        'label="方法论"',
    ]:
        assert expected in page + api

    payload_start = api.index("export type KnowledgeResearcherPayload = {")
    payload_end = api.index("};", payload_start)
    payload_block = api[payload_start:payload_end]
    assert "profile_content" not in payload_block

    for expected in [
        ".data-panel-toolbar .ant-segmented",
        ".data-panel-toolbar .ant-segmented .ant-segmented-item-selected",
        "var(--ll-accent-soft)",
    ]:
        assert expected in css

    for legacy in [
        "listKnowledgeSkills",
        "listKnowledgeAgents",
        "listKnowledgeFeedbackLogs",
        "listKnowledgeResearcherSouls",
        "listKnowledgeResearcherMethods",
        "createKnowledgeResearcherSoul",
        "createKnowledgeResearcherMethod",
        "/api/knowledge/researcher-souls",
        "/api/knowledge/researcher-methods",
        'name="file_path"',
        'name="soul_id"',
        'name="method_id"',
        'name="trigger_condition"',
        'name="operation_steps"',
        'name="mcp_flow"',
        'name="report_feedback_rule"',
        "触发条件",
        "操作顺序",
        "MCP 调用流程",
        "报告回流规则",
        "研究员组合",
        "Soul 世界观库",
        "Method 方法论库",
        "新增 Soul",
        "新增 Method",
        "判断风格",
        "风险偏好",
        "研究禁区",
        "适用场景",
        '"/api/knowledge/skills"',
        '"/api/knowledge/agents"',
        '"/api/knowledge/feedback-logs"',
        '{ key: "skills", label: "Skills" }',
        '{ key: "agents", label: "Agents" }',
        '{ key: "feedback", label: "反哺记录" }',
    ]:
        assert legacy not in navigation + page + api


def test_authoritative_docs_remove_old_internal_agent_boundary():
    docs = "\n".join(
        [
            read("docs/liuli_system_spec.md"),
            read("README.md"),
            read("docs/liuli_mcp_design.md"),
        ]
    )

    for expected in [
        "对外 Skills",
        "研究员",
        "研究回流",
        "knowledge_external_skill",
        "knowledge_researcher",
        "knowledge_research_feedback",
        "researcher_code, display_name, profile_path, profile_hash, status",
        "external/researchers/{researcher_code}/profile.md",
        "researcher_code: analyst_001",
        "display_name: A股标的研究员",
        "## 简介 intro",
        "## 价值观 soul",
        "## 方法论 method",
    ]:
        assert expected in docs

    for legacy in [
        "knowledge_researcher_soul",
        "knowledge_researcher_method",
        "get_researcher_soul",
        "get_researcher_method",
        "soul_id",
        "method_id",
        "knowledge_skill",
        "knowledge_agent",
        "knowledge_feedback_log",
        "trigger_condition",
        "operation_steps",
        "mcp_flow",
        "report_feedback_rule",
        "agent_service.py",
        "agent_runner.py",
        "tool_registry.py",
        "Agent YAML",
        "/api/knowledge/skills",
        "/api/knowledge/agents",
        "/api/knowledge/feedback-logs",
    ]:
        assert legacy not in docs
