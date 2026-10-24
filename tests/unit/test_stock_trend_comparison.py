"""标的对比"趋势"页：标的池每只标的取最新一份趋势研究，没有快照的字段为空。"""

from datetime import date

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import invest_assistant.modules.basic.report_library.models  # noqa: F401  # 快照 report_id 的 FK 目标表
from invest_assistant.bootstrap.database import Base
from invest_assistant.modules.basic.stock_master.models import Stock
from invest_assistant.modules.stock_analysis import service as stock_service
from invest_assistant.modules.stock_analysis.models import StockPoolItem, StockTrendSnapshot


def make_session():
    """内存库，不碰 var/db 下的任何文件。"""
    engine = create_engine("sqlite:///:memory:", future=True)
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine, future=True)()


def test_trend_comparison_takes_latest_snapshot_per_pool_stock():
    db = make_session()
    try:
        studied = Stock(symbol="300750.SZ", stock_code="300750", stock_name="宁德时代", exchange="SZSE")
        fresh = Stock(symbol="000001.SZ", stock_code="000001", stock_name="平安银行", exchange="SZSE")
        db.add_all([studied, fresh])
        db.flush()
        db.add_all(
            [
                StockPoolItem(stock_id=studied.id, status="watching", source="manual"),
                StockPoolItem(stock_id=fresh.id, status="candidate", source="manual"),
                StockTrendSnapshot(stock_id=studied.id, research_date=date(2026, 10, 1), trend_level="T3", stock_stage="蓄势"),
                StockTrendSnapshot(
                    stock_id=studied.id,
                    research_date=date(2026, 10, 20),
                    trend_level="T1",
                    suggested_group="focused",
                    priority_rank=2,
                    company_position="核心龙头",
                    stock_stage="主升初期",
                    core_logic="新判断",
                ),
            ]
        )
        db.commit()

        rows = {row["stock_name"]: row for row in stock_service.list_trend_comparison(db)}

        row = rows["宁德时代"]
        assert (row["status"], row["trend_level"], row["stock_stage"], row["research_date"]) == ("watching", "T1", "主升初期", date(2026, 10, 20))
        assert (row["suggested_group"], row["priority_rank"], row["company_position"], row["core_logic"]) == ("focused", 2, "核心龙头", "新判断")
        empty = rows["平安银行"]
        assert empty["trend_id"] is None and empty["trend_level"] is None
    finally:
        db.close()
