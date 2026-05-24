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
