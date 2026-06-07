from pathlib import Path


def test_console_data_sources_include_stock_daily_bars():
    source = Path("invest_assistant/modules/console/router.py").read_text(encoding="utf-8")

    assert "StockDailyBar" in source
    assert "stock_daily_bar" in source
    assert "stock_analysis.sync_daily_bars" in source
    assert "日线行情（Tushare）" in source
