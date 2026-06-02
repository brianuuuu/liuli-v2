from pathlib import Path


def test_hotword_list_exposes_disable_action():
    source = Path("invest_assistant/ui/web/src/pages/market-radar/sections/TagsSection.tsx").read_text(encoding="utf-8")

    assert "listHotwords" in source
    assert 'useState<string | undefined>("active")' in source
    assert "标签词" in source
    assert "description" in source


def test_dashboard_exposes_todo_events_card():
    source = Path("invest_assistant/ui/web/src/pages/dashboard/DashboardPage.tsx").read_text(encoding="utf-8")

    assert "listAlertEvents" in source
    assert "待办事件" in source
    assert "handled" in source


def test_console_ai_logs_use_audit_columns():
    source = Path("invest_assistant/ui/web/src/pages/console/sections.tsx").read_text(encoding="utf-8")
    api_source = Path("invest_assistant/ui/web/src/api/console.ts").read_text(encoding="utf-8")

    assert source.index('dataIndex: "created_at"') < source.index('dataIndex: "task_name"')
    assert source.index('dataIndex: "task_name"') < source.index('dataIndex: "provider"')
    assert 'title: "相关任务"' in source
    assert 'dataIndex: "provider"' in source
    assert 'dataIndex: "model"' in source
    assert 'dataIndex: "task_name"' in source
    assert 'dataIndex: "total_tokens"' in source
    assert 'dataIndex: "duration_ms"' in source
    assert "export type AiRequestLog" in api_source


def test_stock_event_ai_review_buttons_are_wired_to_job():
    dashboard = Path("invest_assistant/ui/web/src/pages/dashboard/DashboardPage.tsx").read_text(encoding="utf-8")
    events = Path("invest_assistant/ui/web/src/pages/stock-analysis/sections/EventsSection.tsx").read_text(encoding="utf-8")
    jobs_api = Path("invest_assistant/ui/web/src/api/jobs.ts").read_text(encoding="utf-8")

    assert 'STOCK_EVENT_REVIEW_JOB_NAME = "stock_analysis.review_stock_events_deepseek"' in jobs_api
    assert "STOCK_EVENT_REVIEW_JOB_NAME" in dashboard
    assert "一键 AI 审核标的材料" in dashboard
    assert "STOCK_EVENT_REVIEW_JOB_NAME" in events
    assert "AI审核全部" in events


def test_system_config_section_supports_delete_and_typed_value_editor():
    source = Path("invest_assistant/ui/web/src/pages/console/sections/SystemConfigSection.tsx").read_text(encoding="utf-8")
    api_source = Path("invest_assistant/ui/web/src/api/systemConfig.ts").read_text(encoding="utf-8")

    assert "deleteSystemConfig" in source
    assert "删除这个系统配置？" in source
    assert "配置已删除" in source
    assert "valueType === \"boolean\"" in source
    assert "valueType === \"json\"" in source
    assert "export async function deleteSystemConfig" in api_source


def test_system_config_editor_is_compact():
    source = Path("invest_assistant/ui/web/src/pages/console/sections/SystemConfigSection.tsx").read_text(encoding="utf-8")

    assert "Space.Compact" not in source
    assert "preserve={false}" not in source
    assert "useEffect" in source
    assert "configValueForEditor" in source
    assert "width={560}" in source
    assert "rows={5}" in source
    assert "rows={2}" in source
    assert "compactConfigMetaStyle" in source


def test_knowledge_menu_replaces_review_and_principles_with_prompt():
    navigation = Path("invest_assistant/ui/web/src/app/navigation.tsx").read_text(encoding="utf-8")
    page = Path("invest_assistant/ui/web/src/pages/knowledge/KnowledgePage.tsx").read_text(encoding="utf-8")
    api = Path("invest_assistant/ui/web/src/api/knowledge.ts").read_text(encoding="utf-8")

    assert "复盘沉淀" not in navigation
    assert "分析准则" not in navigation
    assert '{ key: "prompts", label: "Prompt" }' in navigation
    assert "listKnowledgePrompts" in page
    assert "System Prompt" in page
    assert "User Prompt" in page
    assert "createKnowledgePrompt" in page
    assert "deleteKnowledgePrompt" in page
    assert "export async function listKnowledgePrompts" in api


def test_prompt_editor_is_compact_and_modern():
    source = Path("invest_assistant/ui/web/src/pages/knowledge/KnowledgePage.tsx").read_text(encoding="utf-8")

    assert "Space.Compact" not in source
    assert "width={620}" in source
    assert "compactPromptFormStyle" in source
    assert source.count("Row gutter={12}") >= 3
    assert "rows={2}" in source
    assert "rows={3}" in source


def test_ai_suggestion_ui_supports_manual_approval_target():
    section = Path("invest_assistant/ui/web/src/pages/market-radar/sections/CandidatesSection.tsx").read_text(encoding="utf-8")
    api = Path("invest_assistant/ui/web/src/api/marketRadar.ts").read_text(encoding="utf-8")
    types = Path("invest_assistant/ui/web/src/types/api.ts").read_text(encoding="utf-8")

    assert "AI 推荐词" in section
    assert "target_type" in section
    assert "target_id" in section
    assert "target_name" in section
    assert "approveAiTagSuggestion" in section
    assert "/api/market-radar/ai-tag-suggestions" in api
    assert "export type AiTagSuggestion" in types


def test_ai_suggestion_approve_ui_edits_final_tag_before_submit():
    section = Path("invest_assistant/ui/web/src/pages/market-radar/sections/CandidatesSection.tsx").read_text(encoding="utf-8")
    api = Path("invest_assistant/ui/web/src/api/marketRadar.ts").read_text(encoding="utf-8")

    assert "approving" in section
    assert "final_tag_name" in section
    assert "通过 AI 推荐词" in section
    assert "submitApprove" in section
    assert "approveAiTagSuggestion" in section
    assert "approveAiTagSuggestion" in api


def test_track_candidate_ui_exposes_physical_delete():
    section = Path("invest_assistant/ui/web/src/pages/track-discovery/sections/ThesesSection.tsx").read_text(encoding="utf-8")
    api = Path("invest_assistant/ui/web/src/api/trackDiscovery.ts").read_text(encoding="utf-8")

    assert "deleteTrack" in section
    assert 'record.status === "candidate"' in section
    assert "物理删除这个候选赛道？" in section
    assert "候选赛道已删除" in section
    assert "export async function deleteTrack" in api


def test_ai_suggestion_ui_uses_status_specific_actions():
    section = Path("invest_assistant/ui/web/src/pages/market-radar/sections/CandidatesSection.tsx").read_text(encoding="utf-8")
    api = Path("invest_assistant/ui/web/src/api/marketRadar.ts").read_text(encoding="utf-8")

    assert 'title: "操作"' in section
    assert 'record.status === "rejected"' in section
    assert 'record.status !== "pending"' in section
    assert "恢复" in section
    assert "AI 推荐词已恢复" in section
    assert "restoreAiTagSuggestion" in section
    assert "restore" in api
