from datetime import date, datetime, timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from invest_assistant.bootstrap.database import Base
from invest_assistant.modules.basic.stock_master.models import Stock
from invest_assistant.modules.knowledge_base.models import KnowledgeNote
from invest_assistant.modules.market_radar.models import SourceItem, Tag, TagHeatSnapshot, TrackTagRelation
from invest_assistant.modules.stock_analysis.models import StockTrackRelation
from invest_assistant.modules.track_discovery import router, service
from invest_assistant.modules.track_discovery.models import Track, TrackMaterial, TrackTrendSnapshot
from invest_assistant.shared.time_utils import beijing_now


def make_session() -> Session:
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})

    import invest_assistant.modules.basic.auth.models  # noqa: F401
    import invest_assistant.modules.basic.ai_audit.models  # noqa: F401
    import invest_assistant.modules.basic.disclosure_library.models  # noqa: F401
    import invest_assistant.modules.basic.job_center.models  # noqa: F401
    import invest_assistant.modules.basic.report_library.models  # noqa: F401
    import invest_assistant.modules.basic.stock_master.models  # noqa: F401
    import invest_assistant.modules.basic.system_config.models  # noqa: F401
    import invest_assistant.modules.alert_center.models  # noqa: F401
    import invest_assistant.modules.knowledge_base.models  # noqa: F401
    import invest_assistant.modules.market_radar.models  # noqa: F401
    import invest_assistant.modules.portfolio.models  # noqa: F401
    import invest_assistant.modules.stock_analysis.models  # noqa: F401
    import invest_assistant.modules.track_discovery.models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)()


def trend_snapshot(
    track_id: int,
    research_date: date,
    *,
    grade: str,
    heat_tier: str,
    market_heat: float,
    **overrides,
) -> TrackTrendSnapshot:
    """六维评分全部必填，用例只关心评级和热度档位时其余维度给一个固定值。"""
    values = {
        "market_heat_score": market_heat,
        "growth_speed_score": 7.0,
        "concentration_score": 7.0,
        "cycle_resilience_score": 7.0,
        "current_market_size_score": 7.0,
        "future_market_size_score": 7.0,
        "overall_score": 7.0,
        "track_grade": grade,
        "heat_tier": heat_tier,
        "headline_cycle": "long",
    }
    values.update(overrides)
    return TrackTrendSnapshot(track_id=track_id, research_date=research_date, **values)


def add_heat(db: Session, tag_id: int, window: str, stat_time: datetime, heat_score: float) -> None:
    db.add(
        TagHeatSnapshot(
            tag_id=tag_id,
            window_type=window,
            stat_time=stat_time,
            trigger_count=int(heat_score),
            source_count=1,
            heat_score=heat_score,
            avg_count=heat_score,
            rank_no=1,
        )
    )


def test_track_detail_missing_track_returns_none_and_router_404():
    db = make_session()

    assert service.get_track_detail(db, 404) is None
    with pytest.raises(HTTPException) as exc:
        router.get_track_detail(404, db)
    assert exc.value.status_code == 404


def test_track_detail_returns_stable_empty_structure():
    db = make_session()
    track = Track(name="机器人", status="candidate", industry_phase="intro", market_phase="latent", confidence_level="low")
    db.add(track)
    db.commit()

    detail = service.get_track_detail(db, track.id)

    assert detail["track"]["name"] == "机器人"
    assert detail["summary"] == {
        "tag_count": 0,
        "material_count": 0,
        "pending_material_count": 0,
        "high_importance_material_count": 0,
        "bound_stock_count": 0,
        "latest_heat_score": None,
        "last_updated_at": track.updated_at,
    }
    assert detail["heat_trends"] == []
    assert detail["latest_snapshot"] is None
    assert detail["trend_snapshots"] == []
    assert detail["materials"] == []
    assert detail["stocks"] == []
    assert detail["tags"] == []


def test_track_detail_aggregates_materials_stocks_tags_heat_and_snapshots():
    db = make_session()
    # 热度点必须落在详情接口的近 90 天窗口内，所以取当前时间而不是写死日期：
    # 写死的那天迟早会滑出窗口，用例会在某天毫无征兆地变红。
    now = beijing_now()
    track = Track(
        name="机器人",
        description="机器人产业链",
        status="active",
        current_view="订单兑现预期提升",
        industry_phase="expansion",
        market_phase="accelerate",
        confidence_level="high",
    )
    stock = Stock(stock_code="300001", stock_name="重点科技", symbol="300001.SZ")
    inactive_stock = Stock(stock_code="600001", stock_name="观察制造", symbol="600001.SH")
    active_tag = Tag(name="机器人", type="track", status="active")
    archived_tag = Tag(name="执行器", type="track", status="active")
    db.add_all([track, stock, inactive_stock, active_tag, archived_tag])
    db.flush()

    db.add_all(
        [
            TrackTagRelation(track_id=track.id, tag_id=active_tag.id, source="manual", status="active"),
            TrackTagRelation(track_id=track.id, tag_id=archived_tag.id, source="manual", status="archived"),
        ]
    )
    add_heat(db, active_tag.id, "24h", now, 42)
    add_heat(db, archived_tag.id, "24h", now, 999)
    add_heat(db, active_tag.id, "7d", now - timedelta(days=1), 31)
    add_heat(db, active_tag.id, "7d", now, 45)

    source = SourceItem(
        source_type="news",
        source_name="manual",
        title="机器人订单提升",
        content="机器人订单和核心零部件关注度提升",
        publish_time=now,
    )
    note = KnowledgeNote(title="机器人复盘", content="复盘材料", note_type="review")
    db.add_all([source, note])
    db.flush()

    db.add_all(
        [
            TrackMaterial(
                track_id=track.id,
                material_type="source_item",
                material_id=source.id,
                direction="support",
                importance_level="high",
                status="pending",
            ),
            TrackMaterial(
                track_id=track.id,
                material_type="knowledge_note",
                material_id=note.id,
                direction="neutral",
                importance_level="medium",
                status="confirmed",
            ),
            StockTrackRelation(stock_id=stock.id, track_id=track.id, relation_type="core", conviction=0.9, reason="核心受益", status="active"),
            StockTrackRelation(stock_id=inactive_stock.id, track_id=track.id, relation_type="watch", conviction=0.3, status="disabled"),
            trend_snapshot(track.id, date(2026, 5, 30), grade="B", heat_tier="T2", market_heat=5.5),
            trend_snapshot(track.id, date(2026, 5, 31), grade="A", heat_tier="T1", market_heat=7.5),
            trend_snapshot(track.id, date(2026, 5, 31), grade="S", heat_tier="T0", market_heat=9.5, market_capital="执行器链条升温"),
        ]
    )
    db.commit()

    detail = service.get_track_detail(db, track.id)

    assert detail["summary"]["tag_count"] == 1
    assert detail["summary"]["material_count"] == 2
    assert detail["summary"]["pending_material_count"] == 1
    assert detail["summary"]["high_importance_material_count"] == 1
    assert detail["summary"]["bound_stock_count"] == 1
    assert detail["summary"]["latest_heat_score"] == 42
    assert [item["tag"]["name"] for item in detail["tags"]] == ["机器人"]
    material_titles = {item["material_type"]: item["material_title"] for item in detail["materials"]}
    assert material_titles["source_item"] == "机器人订单提升"
    assert material_titles["knowledge_note"] == "机器人复盘"
    assert detail["stocks"][0]["stock_name"] == "重点科技"
    assert detail["stocks"][0]["stock_code"] == "300001"
    assert detail["stocks"][1]["stock_name"] == "观察制造"
    assert detail["latest_snapshot"]["track_grade"] == "S"
    assert detail["latest_snapshot"]["market_capital"] == "执行器链条升温"
    # 同日多份按 id 倒序，最新一份排最前
    assert [item["research_date"] for item in detail["trend_snapshots"]] == [date(2026, 5, 31), date(2026, 5, 31), date(2026, 5, 30)]
    assert [item["track_grade"] for item in detail["trend_snapshots"]] == ["S", "A", "B"]
    heat_24h = next(item for item in detail["heat_trends"] if item["window_type"] == "24h")
    assert heat_24h["points"][0]["heat_score"] == 42
