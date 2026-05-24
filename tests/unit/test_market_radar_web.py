from pathlib import Path


def test_hotword_list_exposes_disable_action():
    source = Path("invest_assistant/ui/web/src/pages/market-radar/sections/TagsSection.tsx").read_text(encoding="utf-8")

    assert "disableMarketTag" in source
    assert 'useState<string | undefined>("active")' in source
    assert "删除这个热点词？" in source
    assert "热点词已停用" in source


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


def test_candidate_merge_ui_supports_deepseek_suggestions_and_manual_target():
    section = Path("invest_assistant/ui/web/src/pages/market-radar/sections/CandidatesSection.tsx").read_text(encoding="utf-8")
    api = Path("invest_assistant/ui/web/src/api/marketRadar.ts").read_text(encoding="utf-8")
    types = Path("invest_assistant/ui/web/src/types/api.ts").read_text(encoding="utf-8")

    assert "建议合并" in section
    assert "suggested_target_tag_id" in section
    assert "merge_similarity" in section
    assert "merge_reason" in section
    assert "mergeTargetId" in section
    assert "listMarketTags(\"hotword\")" in section
    assert "target_tag_id" in api
    assert "mergeTagCandidate(candidateId: number, targetTagId?: number" in api
    assert "suggested_target_tag_id?: number | null" in types
    assert "merge_similarity?: number | null" in types


def test_candidate_ui_exposes_promote_track_action():
    section = Path("invest_assistant/ui/web/src/pages/market-radar/sections/CandidatesSection.tsx").read_text(encoding="utf-8")
    api = Path("invest_assistant/ui/web/src/api/marketRadar.ts").read_text(encoding="utf-8")

    assert "promoteTagCandidateToTrack" in section
    assert "转赛道" in section
    assert "候选已转为赛道" in section
    assert "promote-track" in api
