from fastapi.testclient import TestClient

from invest_assistant.bootstrap.app import create_app
from invest_assistant.bootstrap.database import Base, SessionLocal, engine
from invest_assistant.modules.basic.job_center.dispatcher import execute_job
from invest_assistant.modules.basic.stock_master.schemas import StockImportItem
from invest_assistant.modules.basic.stock_master.service import import_stocks
from invest_assistant.modules.alert_center.models import AlertEvent
from invest_assistant.modules.basic.ai_audit.models import AiRequestLog
from invest_assistant.modules.knowledge_base.models import KnowledgePrompt
from invest_assistant.modules.market_radar.models import HotwordAlias, SourceItem, Tag, TagCandidate
from invest_assistant.modules.market_radar import jobs as market_radar_jobs
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


def seed_deepseek_hotword_prompt(db) -> None:
    db.add(
        KnowledgePrompt(
            prompt_key="market_radar.extract_daily_hotwords_deepseek",
            title="新闻热词抽取",
            target_task="market_radar.extract_daily_hotwords_deepseek",
            provider="deepseek",
            model="deepseek-v4-flash",
            system_prompt="测试 system prompt",
            user_prompt="测试 user prompt",
            response_format="json_object",
            status="active",
        )
    )


def test_market_radar_source_item_and_hotword_flow():
    reset_db()
    seed_stock()
    client = TestClient(create_app())
    headers = login_headers(client)

    source = client.post(
        "/api/market-radar/source-items",
        json={
            "source_type": "news",
            "source_name": "manual",
            "title": "AI算力带动平安银行科技金融关注",
            "content": "AI算力 与 平安银行 同时被市场提及，降息预期升温。",
            "source_url": "https://example.com/news/1",
            "publish_time": "2026-05-13T09:00:00",
            "related_type": "manual",
            "related_id": None,
        },
        headers=headers,
    )
    assert source.status_code == 200
    assert source.json()["title"].startswith("AI算力")
    assert source.json()["related_type"] == "manual"

    stock_tags = client.get("/api/market-radar/tags?type=stock", headers=headers)
    assert stock_tags.status_code == 200
    assert stock_tags.json() == []

    candidate = client.post(
        "/api/market-radar/tag-candidates",
        json={
            "name": "降息",
            "suggested_type": "hotword",
            "source_item_id": source.json()["id"],
            "trigger_text": "降息",
            "confidence": 0.9,
            "reason": "manual test",
            "status": "pending",
        },
        headers=headers,
    ).json()
    approved = client.post(f"/api/market-radar/tag-candidates/{candidate['id']}/approve", headers=headers)
    assert approved.status_code == 200
    hotword_tags = client.get("/api/market-radar/tags?type=hotword", headers=headers)
    assert any(item["name"] == "降息" for item in hotword_tags.json())


def test_rule_extraction_heat_and_graph_jobs():
    reset_db()
    stock_id = seed_stock()
    client = TestClient(create_app())
    headers = login_headers(client)
    assert client.post("/api/stock-analysis/pool", json={"stock_id": stock_id, "status": "watching"}, headers=headers).status_code == 200
    track = client.post(
        "/api/track-discovery/tracks",
        json={"name": "AI算力", "description": "算力基础设施", "status": "active"},
        headers=headers,
    )
    assert track.status_code == 200
    source_for_candidate = client.post(
        "/api/market-radar/source-items",
        json={"source_type": "news", "source_name": "manual", "title": "候选词", "content": "降息", "publish_time": "2026-05-13T09:00:00"},
        headers=headers,
    ).json()
    candidate = client.post(
        "/api/market-radar/tag-candidates",
        json={"name": "降息", "suggested_type": "hotword", "source_item_id": source_for_candidate["id"], "trigger_text": "降息", "confidence": 0.8},
        headers=headers,
    ).json()
    assert client.post(f"/api/market-radar/tag-candidates/{candidate['id']}/approve", headers=headers).status_code == 200
    assert (
        client.post(
            "/api/market-radar/source-items",
            json={
                "source_type": "news",
                "source_name": "manual",
                "title": "平安银行与AI算力",
                "content": "平安银行 被 AI算力 和 降息 同时提及。",
            "source_url": "https://example.com/news/2",
            "publish_time": "2026-05-13T10:00:00",
        },
            headers=headers,
        ).status_code
        == 200
    )

    db = SessionLocal()
    try:
        assert execute_job(db, "market_radar.extract_tags").success is True
        assert execute_job(db, "market_radar.aggregate_heat").success is True
        assert execute_job(db, "market_radar.aggregate_edges").success is True
    finally:
        db.close()

    rankings = client.get("/api/market-radar/rankings?type=track&window=24h", headers=headers)
    assert rankings.status_code == 200
    assert rankings.json()[0]["tag"]["name"] == "AI算力"

    graph = client.get("/api/market-radar/graphs/stock-track?window=24h", headers=headers)
    assert graph.status_code == 200
    assert graph.json()["edges"][0]["related_tag"]["name"] == "AI算力"


def test_cls_market_flash_job_inserts_only_new_source_items(monkeypatch):
    reset_db()
    rows = [
        {"标题": "AI算力快讯", "内容": "财联社电，AI算力产业链升温。", "发布日期": "2026-05-17", "发布时间": "09:30:00"},
        {"标题": "低空经济快讯", "内容": "财联社电，低空经济政策持续推进。", "发布日期": "2026-05-17", "发布时间": "09:35:00"},
    ]
    monkeypatch.setattr(market_radar_jobs, "_fetch_cls_rows", lambda limit: rows[:limit])
    client = TestClient(create_app())
    headers = login_headers(client)

    db = SessionLocal()
    try:
        first = execute_job(db, "market_radar.fetch_news", params={"limit": 2})
        second = execute_job(db, "market_radar.fetch_news", params={"limit": 2})
    finally:
        db.close()

    assert first.success is True
    assert first.fetched_count == 2
    assert first.inserted_count == 2
    assert second.success is True
    assert second.fetched_count == 2
    assert second.inserted_count == 0
    assert second.skipped_count == 2

    sources = client.get("/api/market-radar/source-items", headers=headers)
    assert sources.status_code == 200
    assert len(sources.json()) == 2
    assert sources.json()[0]["source_name"] == "财联社"
    assert sources.json()[0]["source_type"] == "news"


def test_cls_market_flash_sync_endpoint_returns_insert_stats(monkeypatch):
    reset_db()
    rows = [
        {"标题": "机器人快讯", "内容": "财联社电，机器人产业链出现新进展。", "发布日期": "2026-05-17", "发布时间": "10:30:00"},
    ]
    monkeypatch.setattr(market_radar_jobs, "_fetch_cls_rows", lambda limit: rows[:limit])
    client = TestClient(create_app())
    headers = login_headers(client)

    first = client.post("/api/market-radar/source-items/sync-cls", json={"limit": 100}, headers=headers)
    second = client.post("/api/market-radar/source-items/sync-cls", json={"limit": 100}, headers=headers)

    assert first.status_code == 200
    assert first.json()["success"] is True
    assert first.json()["inserted_count"] == 1
    assert second.status_code == 200
    assert second.json()["success"] is True
    assert second.json()["inserted_count"] == 0
    assert second.json()["skipped_count"] == 1

    sources = client.get("/api/market-radar/source-items", headers=headers)
    assert len(sources.json()) == 1
    assert sources.json()[0]["title"] == "机器人快讯"


def test_tag_candidate_approve_reject_and_merge():
    reset_db()
    client = TestClient(create_app())
    headers = login_headers(client)
    source = client.post(
        "/api/market-radar/source-items",
        json={
            "source_type": "news",
            "source_name": "manual",
            "title": "新热点",
            "content": "新的市场词语出现",
            "source_url": None,
            "publish_time": "2026-05-13T11:00:00",
        },
        headers=headers,
    ).json()
    candidate = client.post(
        "/api/market-radar/tag-candidates",
        json={
            "name": "机器人",
            "suggested_type": "track",
            "source_item_id": source["id"],
            "trigger_text": "机器人",
            "confidence": 0.8,
            "reason": "manual test",
            "status": "pending",
        },
        headers=headers,
    ).json()

    approved = client.post(f"/api/market-radar/tag-candidates/{candidate['id']}/approve", headers=headers)
    assert approved.status_code == 200
    assert approved.json()["status"] == "approved"

    tags = client.get("/api/market-radar/tags?type=track", headers=headers)
    assert any(item["name"] == "机器人" for item in tags.json())


def test_direct_hotword_creation_creates_tag_and_aliases():
    reset_db()
    client = TestClient(create_app())
    headers = login_headers(client)

    response = client.post(
        "/api/market-radar/hotwords",
        json={"name": "普通市场词", "aliases": ["市场词", "普通词"], "status": "active"},
        headers=headers,
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["tag"]["name"] == "普通市场词"
    assert payload["tag"]["type"] == "hotword"
    assert payload["tag"]["status"] == "active"
    assert {item["alias"] for item in payload["aliases"]} == {"市场词", "普通词"}
    db = SessionLocal()
    try:
        assert db.query(Tag).filter(Tag.type == "hotword").count() == 1
    finally:
        db.close()


def test_deepseek_daily_hotword_job_creates_new_candidates_and_info_event(monkeypatch):
    reset_db()
    db = SessionLocal()
    try:
        db.add_all(
            [
                KnowledgePrompt(
                    prompt_key="market_radar.extract_daily_hotwords_deepseek",
                    title="新闻热词抽取",
                    target_task="market_radar.extract_daily_hotwords_deepseek",
                    provider="deepseek",
                    model="deepseek-v4-flash",
                    system_prompt="测试 system prompt",
                    user_prompt="测试 user prompt",
                    response_format="json_object",
                    status="active",
                ),
                SourceItem(
                    source_type="news",
                    source_name="财联社",
                    title="AI算力产业链持续升温",
                    content="AI服务器订单增长，算力基础设施需求保持高景气。",
                    publish_time=utc_now(),
                ),
                SourceItem(
                    source_type="announcement",
                    source_name="公告",
                    title="公告不参与",
                    content="这条不是 news 类型。",
                    publish_time=utc_now(),
                ),
            ]
        )
        db.commit()
    finally:
        db.close()

    captured = {}

    def fake_extract_hotwords(news, prompt, model):
        captured["news"] = news
        captured["prompt"] = prompt
        captured["model"] = model
        return {
            "hotwords": [
                {"name": "AI算力", "score": 9, "reason": "算力基础设施需求升温。"},
                {"name": "人形机器人", "score": 7, "reason": "产业链方向集中出现。"},
            ],
            "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
        }

    monkeypatch.setattr("invest_assistant.services.deepseek.client.extract_hotwords", fake_extract_hotwords)

    db = SessionLocal()
    try:
        result = market_radar_jobs.extract_daily_hotwords_deepseek_job()
        candidates = db.query(TagCandidate).order_by(TagCandidate.name.asc()).all()
        events = db.query(AlertEvent).all()
        logs = db.query(AiRequestLog).all()
    finally:
        db.close()

    assert result.success is True
    assert result.processed_count == 1
    assert result.inserted_count == 2
    assert captured["model"] == "deepseek-v4-flash"
    assert captured["prompt"].system_prompt == "测试 system prompt"
    assert captured["prompt"].user_prompt == "测试 user prompt"
    assert set(captured["news"][0].keys()) == {"title", "content", "publish_time"}
    assert [candidate.name for candidate in candidates] == ["AI算力", "人形机器人"]
    assert all(candidate.suggested_type == "hotword" for candidate in candidates)
    assert all(candidate.source_item_id is None for candidate in candidates)
    assert candidates[0].confidence in {0.7, 0.9}
    assert all("DeepSeek score=" in (candidate.reason or "") for candidate in candidates)
    assert len(events) == 1
    assert events[0].event_level == "info"
    assert events[0].status == "unread"
    assert "今日新增 2 个新闻热词候选" == events[0].title
    assert "AI算力 9/10" in events[0].message
    assert len(logs) == 1
    assert logs[0].provider == "deepseek"
    assert logs[0].status == "success"
    assert logs[0].total_tokens == 15


def test_deepseek_daily_hotword_job_filters_existing_tags_aliases_and_candidates(monkeypatch):
    reset_db()
    db = SessionLocal()
    try:
        existing = Tag(name="AI算力", type="hotword", status="active")
        alias_tag = Tag(name="机器人", type="hotword", status="active")
        db.add_all([existing, alias_tag])
        db.flush()
        seed_deepseek_hotword_prompt(db)
        db.add(HotwordAlias(tag_id=alias_tag.id, alias="人形机器人", source="manual", status="active"))
        db.add(TagCandidate(name="低空经济", suggested_type="hotword", trigger_text="低空经济", status="pending"))
        db.add(SourceItem(source_type="news", source_name="财联社", title="今日新闻", content="AI算力 人形机器人 低空经济", publish_time=utc_now()))
        db.commit()
    finally:
        db.close()

    monkeypatch.setattr(
        "invest_assistant.services.deepseek.client.extract_hotwords",
        lambda news, prompt, model: {
            "hotwords": [
                {"name": "AI算力", "score": 9, "reason": "已有正式标签。"},
                {"name": "人形机器人", "score": 8, "reason": "已有别名。"},
                {"name": "低空经济", "score": 7, "reason": "已有候选。"},
            ],
            "usage": {},
        },
    )

    result = market_radar_jobs.extract_daily_hotwords_deepseek_job()

    db = SessionLocal()
    try:
        candidates = db.query(TagCandidate).all()
        events = db.query(AlertEvent).all()
    finally:
        db.close()

    assert result.success is True
    assert result.inserted_count == 0
    assert len(candidates) == 1
    assert candidates[0].name == "低空经济"
    assert events == []


def test_deepseek_daily_hotword_job_skips_when_today_has_no_news(monkeypatch):
    reset_db()
    called = False

    def fake_extract_hotwords(news, model):
        nonlocal called
        called = True
        return {"hotwords": [], "usage": {}}

    monkeypatch.setattr("invest_assistant.services.deepseek.client.extract_hotwords", fake_extract_hotwords)

    result = market_radar_jobs.extract_daily_hotwords_deepseek_job()

    assert result.success is True
    assert result.processed_count == 0
    assert result.skipped_count == 1
    assert called is False


def test_deepseek_daily_hotword_job_records_failed_ai_audit(monkeypatch):
    reset_db()
    db = SessionLocal()
    try:
        seed_deepseek_hotword_prompt(db)
        db.add(SourceItem(source_type="news", source_name="财联社", title="今日新闻", content="AI算力", publish_time=utc_now()))
        db.commit()
    finally:
        db.close()

    def fake_extract_hotwords(news, prompt, model):
        raise RuntimeError("deepseek unavailable")

    monkeypatch.setattr("invest_assistant.services.deepseek.client.extract_hotwords", fake_extract_hotwords)

    result = market_radar_jobs.extract_daily_hotwords_deepseek_job()

    db = SessionLocal()
    try:
        logs = db.query(AiRequestLog).all()
    finally:
        db.close()

    assert result.success is False
    assert "deepseek unavailable" in result.message
    assert len(logs) == 1
    assert logs[0].status == "failed"
    assert "deepseek unavailable" in (logs[0].error_message or "")


def test_deepseek_daily_hotword_job_fails_when_prompt_missing(monkeypatch):
    reset_db()
    db = SessionLocal()
    try:
        db.add(SourceItem(source_type="news", source_name="财联社", title="今日新闻", content="AI算力", publish_time=utc_now()))
        db.commit()
    finally:
        db.close()

    called = False

    def fake_extract_hotwords(news, prompt, model):
        nonlocal called
        called = True
        return {"hotwords": [], "usage": {}}

    monkeypatch.setattr("invest_assistant.services.deepseek.client.extract_hotwords", fake_extract_hotwords)

    result = market_radar_jobs.extract_daily_hotwords_deepseek_job()

    db = SessionLocal()
    try:
        logs = db.query(AiRequestLog).all()
    finally:
        db.close()

    assert result.success is False
    assert "active prompt" in result.message
    assert called is False
    assert len(logs) == 1
    assert logs[0].status == "failed"
    assert "active prompt" in (logs[0].error_message or "")
