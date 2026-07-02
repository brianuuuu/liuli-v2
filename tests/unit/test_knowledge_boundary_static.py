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
        "knowledge_researcher_soul",
        "knowledge_researcher_method",
        "knowledge_researcher",
        "knowledge_research_feedback",
        "KnowledgeExternalSkill",
        "KnowledgeResearcherSoul",
        "KnowledgeResearcherMethod",
        "KnowledgeResearcher",
        "KnowledgeResearchFeedback",
    ]:
        assert expected in models + schemas + service + router

    for route in [
        '"/external-skills"',
        '"/external-skills/{skill_id}/export"',
        '"/researcher-souls"',
        '"/researcher-methods"',
        '"/researchers"',
        '"/research-feedback"',
    ]:
        assert route in router

    for legacy in [
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
    ]:
        assert legacy not in models + schemas + service + router


def test_knowledge_frontend_tabs_and_api_use_new_boundaries():
    navigation = read("invest_assistant/ui/web/src/app/navigation.tsx")
    page = read("invest_assistant/ui/web/src/pages/knowledge/KnowledgePage.tsx")
    api = read("invest_assistant/ui/web/src/api/knowledge.ts")

    for tab in ["知识笔记", "对内 Prompt", "对外 Skills", "研究员", "研究回流"]:
        assert tab in navigation

    for expected in [
        "listKnowledgeExternalSkills",
        "exportKnowledgeExternalSkill",
        "listKnowledgeResearcherSouls",
        "listKnowledgeResearcherMethods",
        "listKnowledgeResearchers",
        "listKnowledgeResearchFeedback",
        "/api/knowledge/external-skills",
        "/api/knowledge/researcher-souls",
        "/api/knowledge/researcher-methods",
        "/api/knowledge/researchers",
        "/api/knowledge/research-feedback",
    ]:
        assert expected in page + api

    for expected in [
        "width={920}",
        "width={820}",
        "width={520}",
        "研究员组合",
        "Soul 世界观库",
        "Method 方法论库",
        "研究时间",
        "回流时间",
        "更新时间",
    ]:
        assert expected in page

    for legacy in [
        "listKnowledgeSkills",
        "listKnowledgeAgents",
        "listKnowledgeFeedbackLogs",
        'name="file_path"',
        'name="trigger_condition"',
        'name="operation_steps"',
        'name="mcp_flow"',
        'name="report_feedback_rule"',
        "触发条件",
        "操作顺序",
        "MCP 调用流程",
        "报告回流规则",
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
    ]:
        assert expected in docs

    for legacy in [
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
