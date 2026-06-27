from fastapi.testclient import TestClient

from invest_assistant.bootstrap.app import create_app
from invest_assistant.bootstrap.database import Base, SessionLocal, engine
from invest_assistant.modules.basic.job_center.dispatcher import execute_job
from invest_assistant.modules.basic.job_center.registry import JOB_REGISTRY
from invest_assistant.modules.basic.stock_master.schemas import StockImportItem
from invest_assistant.modules.basic.stock_master.service import import_stocks
from invest_assistant.modules.basic.ai_audit.models import AiRequestLog
from invest_assistant.modules.alert_center.models import AlertEvent
from invest_assistant.modules.knowledge_base.models import KnowledgePrompt
from invest_assistant.modules.knowledge_base.service import resolve_prompt_content
from invest_assistant.modules.market_radar.models import Tag
from invest_assistant.modules.market_radar.models import TagHeatSnapshot
from invest_assistant.shared.time_utils import utc_now


def reset_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def login_headers(client: TestClient) -> dict[str, str]:
    token = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def seed_stock() -> int:
    db = SessionLocal()
    try:
        stock = import_stocks(
            db,
            [StockImportItem(stock_code="000001", stock_name="平安银行", market="A股", exchange="SZSE")],
        )[0]
        return stock.id
    finally:
        db.close()


def test_stock_analysis_core_flow():
    reset_db()
    stock_id = seed_stock()
    client = TestClient(create_app())
    headers = login_headers(client)

    tags = client.get("/api/market-radar/tags?type=stock", headers=headers)
    assert tags.status_code == 200
    assert tags.json() == []

    note = client.post(
        f"/api/stock-analysis/stocks/{stock_id}/notes",
        json={"note_type": "research", "title": "核心逻辑", "content": "银行科技金融受益", "related_track_id": None},
        headers=headers,
    )
    assert note.status_code == 200

    score = client.post(
        f"/api/stock-analysis/stocks/{stock_id}/scores",
        json={
            "score_date": "2026-05-14",
            "track_id": None,
            "growth_score": 7,
            "valuation_score": 6,
            "moat_score": 5,
            "risk_score": 3,
            "total_score": 15,
        },
        headers=headers,
    )
    assert score.status_code == 200

    pool = client.post("/api/stock-analysis/pool", json={"stock_id": stock_id, "status": "watching"}, headers=headers)
    assert pool.status_code == 200
    tags = client.get("/api/market-radar/tags?type=stock", headers=headers)
    assert tags.status_code == 200
    assert tags.json()[0]["stock_id"] == stock_id
    assert tags.json()[0]["name"] == "平安银行"

    group = client.post(
        "/api/stock-analysis/compare-groups",
        json={"name": "银行PK", "track_id": None, "stock_ids": str([stock_id]), "description": "同赛道对比"},
        headers=headers,
    )
    assert group.status_code == 200


def test_stock_track_relation_forward_and_reverse_flow():
    reset_db()
    stock_id = seed_stock()
    client = TestClient(create_app())
    headers = login_headers(client)
    track = client.post(
        "/api/track-discovery/tracks",
        json={"name": "AI算力", "description": "算力基础设施", "status": "active"},
        headers=headers,
    ).json()
    second_track = client.post(
        "/api/track-discovery/tracks",
        json={"name": "智能汽车", "description": "汽车智能化", "status": "active"},
        headers=headers,
    ).json()

    relation = client.post(
        f"/api/stock-analysis/stocks/{stock_id}/tracks",
        json={"track_id": track["id"], "relation_type": "core", "conviction": 0.8, "reason": "研究判断"},
        headers=headers,
    )
    assert relation.status_code == 200
    assert relation.json()["track"]["name"] == "AI算力"

    second_relation = client.post(
        f"/api/stock-analysis/stocks/{stock_id}/tracks",
        json={"track_id": second_track["id"], "relation_type": "related", "conviction": 0.5},
        headers=headers,
    )
    assert second_relation.status_code == 200

    forward = client.get(f"/api/stock-analysis/stocks/{stock_id}/tracks", headers=headers)
    assert forward.status_code == 200
    assert {item["track"]["name"] for item in forward.json()} == {"AI算力", "智能汽车"}

    reverse = client.get(f"/api/track-discovery/tracks/{track['id']}/stocks", headers=headers)
    assert reverse.status_code == 200
    assert reverse.json()[0]["stock_id"] == stock_id

    reverse_create = client.post(
        f"/api/track-discovery/tracks/{track['id']}/stocks",
        json={"stock_id": stock_id, "relation_type": "core", "conviction": 0.9, "reason": "反向更新"},
        headers=headers,
    )
    assert reverse_create.status_code == 200
    assert reverse_create.json()["conviction"] == 0.9


def test_alert_center_rule_event_flow():
    reset_db()
    client = TestClient(create_app())
    headers = login_headers(client)
    rule = client.post(
        "/api/alerts/rules",
        json={"rule_type": "heat", "target_type": "track", "target_id": 1, "condition_json": "{\"min_heat\": 10}", "enabled": True},
        headers=headers,
    )
    assert rule.status_code == 200
    db = SessionLocal()
    try:
        event = AlertEvent(rule_id=rule.json()["id"], event_level="info", title="热度预警", message="AI算力升温", status="unread")
        db.add(event)
        db.commit()
        event_id = event.id
    finally:
        db.close()
    handled = client.post(f"/api/alerts/events/{event_id}/handle", headers=headers)
    assert handled.status_code == 200
    assert handled.json()["status"] == "handled"


def test_dashboard_exposes_unhandled_todo_events_and_ai_logs():
    reset_db()
    client = TestClient(create_app())
    headers = login_headers(client)
    db = SessionLocal()
    try:
        db.add_all(
            [
                AlertEvent(rule_id=1, event_level="warning", title="规则触发预警", message="AI算力升温", status="unread"),
                AlertEvent(rule_id=2, event_level="warning", title="已处理事件", message="ignore", status="handled"),
            ]
        )
        db.add(
            AiRequestLog(
                request_id="test-request",
                provider="deepseek",
                model="deepseek-v4-flash",
                task_name="market_radar.extract_daily_hotwords_deepseek",
                status="success",
                duration_ms=12,
                total_tokens=15,
            )
        )
        db.commit()
    finally:
        db.close()

    dashboard = client.get("/api/console/dashboard", headers=headers)
    ai_logs = client.get("/api/console/ai-logs", headers=headers)

    assert dashboard.status_code == 200
    assert dashboard.json()["todo_events"][0]["title"] == "规则触发预警"
    assert all(item["status"] != "handled" for item in dashboard.json()["todo_events"])
    assert ai_logs.status_code == 200
    assert ai_logs.json()[0]["provider"] == "deepseek"
    assert ai_logs.json()[0]["total_tokens"] == 15


def test_alert_center_heat_rule_job_creates_deduplicated_event():
    reset_db()
    client = TestClient(create_app())
    headers = login_headers(client)
    track = client.post(
        "/api/track-discovery/tracks",
        json={"name": "AI算力", "description": "算力基础设施", "status": "active"},
        headers=headers,
    ).json()
    tag = track["tag"]
    rule = client.post(
        "/api/alerts/rules",
        json={
            "rule_type": "heat",
            "target_type": "track",
            "target_id": tag["id"],
            "condition_json": "{\"window\":\"24h\",\"min_heat\":5,\"event_level\":\"warning\"}",
            "enabled": True,
        },
        headers=headers,
    ).json()

    db = SessionLocal()
    try:
        db.add(
            TagHeatSnapshot(
                tag_id=tag["id"],
                window_type="24h",
                stat_time=utc_now(),
                trigger_count=6,
                source_count=3,
                heat_score=6,
                avg_count=6,
                rank_no=1,
            )
        )
        db.commit()
        first = execute_job(db, "alert_center.evaluate_rules")
        second = execute_job(db, "alert_center.evaluate_rules")
    finally:
        db.close()

    assert first.success is True
    assert first.inserted_count == 1
    assert second.success is True
    assert second.inserted_count == 0

    events = client.get("/api/alerts/events", headers=headers)
    assert events.status_code == 200
    event_items = events.json()["items"]
    assert len(event_items) == 1
    assert event_items[0]["rule_id"] == rule["id"]
    assert event_items[0]["event_level"] == "warning"
    assert "AI算力" in event_items[0]["title"]


def test_portfolio_flow():
    reset_db()
    stock_id = seed_stock()
    client = TestClient(create_app())
    headers = login_headers(client)
    portfolio = client.post("/api/portfolios", json={"name": "主组合", "base_currency": "CNY"}, headers=headers)
    assert portfolio.status_code == 200
    group = client.post(
        f"/api/portfolios/{portfolio.json()['id']}/groups",
        json={"name": "核心仓", "group_type": "core", "target_weight": 0.6, "max_stock_count": 10, "sort_order": 1, "note": "主仓位", "status": "active"},
        headers=headers,
    )
    assert group.status_code == 200
    position = client.post(
        f"/api/portfolios/{portfolio.json()['id']}/positions",
        json={"group_id": group.json()["id"], "stock_id": stock_id, "quantity": 100, "cost_price": 10.5, "current_price": 11, "target_weight": 0.2, "note": "实盘持仓", "status": "active"},
        headers=headers,
    )
    assert position.status_code == 200
    assert position.json()["group_id"] == group.json()["id"]
    db = SessionLocal()
    try:
        assert db.query(Tag).filter(Tag.type == "stock").count() == 0
    finally:
        db.close()
    review = client.post(
        f"/api/portfolios/{portfolio.json()['id']}/review",
        json={"title": "周复盘", "content": "仓位稳定", "risk_summary": "低"},
        headers=headers,
    )
    assert review.status_code == 200


def test_knowledge_base_flow_and_placeholder_jobs_removed():
    reset_db()
    client = TestClient(create_app())
    headers = login_headers(client)
    note = client.post(
        "/api/knowledge/notes",
        json={"title": "复盘原则", "content": "证据优先", "note_type": "principle", "related_module": None, "related_id": None, "tags": "复盘", "status": "active"},
        headers=headers,
    )
    assert note.status_code == 200
    skill = client.post(
        "/api/knowledge/skills",
        json={"title": "证据检查", "skill_type": "analysis", "principle": "先看证据", "description": "检查证据链", "input_schema": "{}", "output_schema": "{}", "prompt_template": "检查 {target}", "status": "active"},
        headers=headers,
    )
    assert skill.status_code == 200
    agent = client.post(
        "/api/knowledge/agents",
        json={"name": "赛道复盘Agent", "target_module": "track_discovery", "description": "复盘赛道", "skills_json": "[]", "workflow_json": "[]", "status": "active"},
        headers=headers,
    )
    assert agent.status_code == 200
    run = client.post(f"/api/knowledge/agents/{agent.json()['id']}/run", headers=headers)
    assert run.status_code == 200
    removed_jobs = {
        "knowledge_base.extract_skills",
        "knowledge_base.compile_agents",
        "track_discovery.collect_evidence",
        "track_discovery.refresh_related_stocks",
        "track_discovery.generate_candidates",
        "track_discovery.collect_materials",
        "track_discovery.refresh_bound_stocks",
    }
    assert removed_jobs.isdisjoint(JOB_REGISTRY)


def test_knowledge_prompt_crud_uses_soft_delete():
    reset_db()
    client = TestClient(create_app())
    headers = login_headers(client)

    created = client.post(
        "/api/knowledge/prompts",
        json={
            "prompt_key": "custom.prompt.test",
            "title": "新闻热词抽取",
            "target_task": "custom.prompt.test",
            "provider": "deepseek",
            "model": "deepseek-v4-flash",
            "system_prompt": "只返回合法JSON",
            "user_prompt": "抽取热词",
            "response_format": "json_object",
            "status": "active",
        },
        headers=headers,
    )
    assert created.status_code == 200
    assert created.json()["prompt_key"] == "custom.prompt.test"

    updated = client.put(
        f"/api/knowledge/prompts/{created.json()['id']}",
        json={**created.json(), "title": "今日新闻热词", "user_prompt": "抽取今日新闻热词"},
        headers=headers,
    )
    assert updated.status_code == 200
    assert updated.json()["title"] == "今日新闻热词"
    assert updated.json()["user_prompt"] == "抽取今日新闻热词"

    listed = client.get("/api/knowledge/prompts", headers=headers)
    assert listed.status_code == 200
    assert any(item["prompt_key"] == "custom.prompt.test" for item in listed.json())

    deleted = client.delete(f"/api/knowledge/prompts/{created.json()['id']}", headers=headers)
    assert deleted.status_code == 200
    assert deleted.json()["status"] == "deleted"

    listed_after_delete = client.get("/api/knowledge/prompts", headers=headers)
    assert listed_after_delete.status_code == 200
    assert all(item["prompt_key"] != "custom.prompt.test" for item in listed_after_delete.json())


def test_create_app_seeds_default_deepseek_hotword_prompt_once():
    reset_db()
    create_app()

    db = SessionLocal()
    try:
        prompt = db.query(KnowledgePrompt).filter(KnowledgePrompt.prompt_key == "market_radar.extract_daily_hotwords_deepseek").one()
        assert prompt.title == "DeepSeek 新闻热词候选"
        assert prompt.provider == "deepseek"
        assert prompt.model == "deepseek-v4-flash"
        assert prompt.response_format == "json_object"
        assert prompt.status == "active"
        assert prompt.system_prompt.endswith("/system.md")
        assert prompt.user_prompt.endswith("/user.md")
        resolved_prompt = resolve_prompt_content(prompt)
        assert "只返回合法JSON" in resolved_prompt.system_prompt
        assert "投资研究" in resolved_prompt.system_prompt
        assert "产业链" in resolved_prompt.user_prompt
        assert "不要返回新闻短句" in resolved_prompt.user_prompt
        assert "如果新闻只是在讲" in resolved_prompt.user_prompt
        prompt.title = "用户自定义标题"
        db.commit()
    finally:
        db.close()

    create_app()

    db = SessionLocal()
    try:
        prompts = db.query(KnowledgePrompt).filter(KnowledgePrompt.prompt_key == "market_radar.extract_daily_hotwords_deepseek").all()
        merge_prompts = db.query(KnowledgePrompt).filter(KnowledgePrompt.prompt_key == "market_radar.suggest_hotword_merges_deepseek").all()
        assert len(prompts) == 1
        assert len(merge_prompts) == 0
        assert prompts[0].title == "用户自定义标题"
    finally:
        db.close()
