from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def read_source(relative_path: str) -> str:
    return (ROOT / relative_path).read_text(encoding="utf-8")


def test_deepseek_hotword_merge_job_chain_is_removed():
    sources = {
        "market_radar/jobs.py": read_source("invest_assistant/modules/market_radar/jobs.py"),
        "deepseek/client.py": read_source("invest_assistant/services/deepseek/client.py"),
        "knowledge_base/service.py": read_source("invest_assistant/modules/knowledge_base/service.py"),
        "console/router.py": read_source("invest_assistant/modules/console/router.py"),
    }

    forbidden_terms = [
        "market_radar.suggest_hotword_merges_deepseek",
        "DEEPSEEK_HOTWORD_MERGE",
        "MERGE_SIMILARITY_THRESHOLD",
        "_suggest_hotword_merges",
        "suggest_hotword_merges",
        "DeepSeek 热词近义合并建议",
        "merge_suggestion",
    ]
    for path, source in sources.items():
        for term in forbidden_terms:
            assert term not in source, f"{term} should be removed from {path}"


def test_workbench_no_longer_exposes_hotword_merge_operation():
    dashboard_source = read_source("invest_assistant/ui/web/src/pages/dashboard/DashboardPage.tsx")

    assert "AI 热词合并建议" not in dashboard_source
    assert "ai-hotword-merge" not in dashboard_source
    assert "market_radar.suggest_hotword_merges_deepseek" not in dashboard_source
