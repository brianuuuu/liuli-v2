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


def test_track_event_ai_review_buttons_are_wired_to_job():
    dashboard = Path("invest_assistant/ui/web/src/pages/dashboard/DashboardPage.tsx").read_text(encoding="utf-8")
    materials = Path("invest_assistant/ui/web/src/pages/track-discovery/sections/MaterialsSection.tsx").read_text(encoding="utf-8")
    jobs_api = Path("invest_assistant/ui/web/src/api/jobs.ts").read_text(encoding="utf-8")

    assert 'TRACK_EVENT_REVIEW_JOB_NAME = "track_discovery.review_track_events_deepseek"' in jobs_api
    assert "TRACK_EVENT_REVIEW_JOB_NAME" in dashboard
    assert "一键 AI 审核赛道材料" in dashboard
    assert "TRACK_EVENT_REVIEW_JOB_NAME" in materials
    assert "AI审核全部" in materials


def test_track_materials_default_loading_excludes_ignored_and_uses_global_page_api():
    materials = Path("invest_assistant/ui/web/src/pages/track-discovery/sections/MaterialsSection.tsx").read_text(encoding="utf-8")
    api = Path("invest_assistant/ui/web/src/api/trackDiscovery.ts").read_text(encoding="utf-8")

    assert "export async function listTrackDiscoveryMaterials" in api
    assert '"/api/track-discovery/materials"' in api
    assert 'status: options.statuses?.join(",")' in api
    assert 'const DEFAULT_MATERIAL_STATUSES = ["pending", "confirmed"]' in materials
    assert "listTrackDiscoveryMaterials({" in materials
    assert "statuses: materialStatuses" in materials
    assert "limit: MATERIAL_PAGE_LIMIT" in materials
    assert "const tracksList = await listTracks();" not in materials
    assert "tracksList.map(async" not in materials


def test_track_material_ignore_removes_row_locally_without_full_refresh():
    materials = Path("invest_assistant/ui/web/src/pages/track-discovery/sections/MaterialsSection.tsx").read_text(encoding="utf-8")

    assert "dismissedMaterialIds" in materials
    assert "setDismissedMaterialIds" in materials
    ignore_branch_start = materials.index('if (newStatus === "ignored"')
    ignore_branch = materials[ignore_branch_start : materials.index("return;", ignore_branch_start)]
    assert "setDismissedMaterialIds" in ignore_branch
    assert "materials.refresh()" not in ignore_branch


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
    for label in ["知识笔记", "对内 Prompt", "对外 Skills", "研究员", "研究回流"]:
        assert label in navigation
    assert "listKnowledgePrompts" in page
    assert "System Prompt" in page
    assert "User Prompt" in page
    assert "createKnowledgePrompt" in page
    assert "deleteKnowledgePrompt" in page
    assert "listKnowledgeExternalSkills" in page
    assert "listKnowledgeResearchers" in page
    assert "researcher_code" in page
    assert "display_name" in page
    assert "listKnowledgeResearcherSouls" not in page + api
    assert "listKnowledgeResearcherMethods" not in page + api
    assert "listKnowledgeResearchFeedback" in page
    assert "export async function listKnowledgePrompts" in api
    assert "export async function listKnowledgeExternalSkills" in api


def test_stock_score_comparison_uses_rating_center_columns_and_actions():
    compare = Path("invest_assistant/ui/web/src/pages/stock-analysis/sections/CompareSection.tsx").read_text(encoding="utf-8")
    detail = Path("invest_assistant/ui/web/src/pages/stock-analysis/StockDetailPage.tsx").read_text(encoding="utf-8")
    api = Path("invest_assistant/ui/web/src/api/stockAnalysis.ts").read_text(encoding="utf-8")
    types = Path("invest_assistant/ui/web/src/types/api.ts").read_text(encoding="utf-8")

    for expected in [
        "报告时间",
        "研究员",
        "等级",
        "壁垒",
        "管理",
        "治理",
        "战略",
        "确定性",
        "成长",
        "雷达图",
        "查看",
        "删除",
        "business_moat_score",
        "management_score",
        "governance_score",
        "strategy_score",
        "certainty_score",
        "investment_level",
        "deleteStockScore",
    ]:
        assert expected in compare + detail + api + types

    score_section = compare[compare.index("const scoreColumns") : compare.index("const valuationColumns")]
    for legacy in [
        "评分日期",
        "估值",
        "风险",
        "score_date",
        "track_id",
        "valuation_score",
        "risk_score",
    ]:
        assert legacy not in score_section
    assert 'dataIndex: "moat_score"' not in score_section


def test_prompt_editor_is_compact_and_modern():
    source = Path("invest_assistant/ui/web/src/pages/knowledge/KnowledgePage.tsx").read_text(encoding="utf-8")

    assert "Space.Compact" not in source
    assert "width={980}" in source
    assert "compactPromptFormStyle" in source
    assert source.count("Row gutter={12}") >= 3
    assert "rows={6}" in source
    assert "rows={12}" in source


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


def test_heat_trend_chart_uses_selected_window_and_date_axis():
    rankings = Path("invest_assistant/ui/web/src/pages/market-radar/sections/RankingsSection.tsx").read_text(encoding="utf-8")
    shared = Path("invest_assistant/ui/web/src/pages/market-radar/sections/shared.tsx").read_text(encoding="utf-8")

    assert "selected?.window_type" in rankings
    assert "smoothHeatTrendRows" in shared
    assert "原始" in shared
    assert "平滑" in shared
    assert "windowType?: string" in shared
    assert "rows.filter((item) => !windowType || item.window_type === windowType)" in shared
    assert "dateAxisLabels" in shared
    assert "previousDateLabel" in shared
    assert "formatDateLabel(item.stat_time)" in shared
    assert "HEAT_TREND_LINE_COLOR" in shared
    assert "#19d9a3" in shared
    assert "axisPointer:" in shared
    assert 'type: "shadow"' in shared
    assert "showSymbol: true" in shared
    assert "symbolSize: 8" in shared
    assert "rgba(25, 217, 163, 0.18)" in shared
    assert 'name: `${title || "热度"}`' in shared
    assert 'name: `${title || "热度"} 原始`' not in shared


def test_heat_rankings_table_uses_tag_hits_and_rank_movement():
    rankings = Path("invest_assistant/ui/web/src/pages/market-radar/sections/RankingsSection.tsx").read_text(encoding="utf-8")

    assert 'title: "标签命中"' in rankings
    assert "trigger_count" in rankings
    assert "source_count" not in rankings
    assert "change_ratio" not in rankings
    assert 'title: "排名变化"' in rankings
    assert "rankChangeBaselineLabel" not in rankings
    assert "formatRankMovement" in rankings


def test_track_dashboard_removes_heat_trend_chart():
    section = Path("invest_assistant/ui/web/src/pages/track-discovery/sections/OverviewSection.tsx").read_text(encoding="utf-8")

    assert 'title="赛道热度趋势"' not in section
    assert "ChartCard" not in section
    assert "trendOption" not in section
    assert "trendWindow" not in section
    assert 'title="今日赛道简表"' in section
    assert 'title: "状态"' in section
    assert "StatusTag" in section
    assert 'title: "信息流"' in section
    assert 'title: "当天热度"' not in section
    assert 'title: "材料"' in section
    assert 'title: "确认"' in section
    assert 'title: "已处理"' in section
    assert 'title: "待处理"' in section
    assert 'className="track-dashboard-ranking-card"' in section
