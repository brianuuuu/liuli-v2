from pathlib import Path


def test_hotword_list_exposes_disable_action():
    source = Path("invest_assistant/ui/web/src/pages/market-radar/sections/TagsSection.tsx").read_text(encoding="utf-8")

    assert "disableMarketTag" in source
    assert 'useState<string | undefined>("active")' in source
    assert "删除这个热点词？" in source
    assert "热点词已停用" in source
