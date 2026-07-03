from pathlib import Path
import sqlite3

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

import invest_assistant.modules.basic.stock_master.models  # noqa: F401
import invest_assistant.modules.track_discovery.models  # noqa: F401
from invest_assistant.bootstrap.database import Base
from invest_assistant.modules.knowledge_base import service
from invest_assistant.modules.knowledge_base.models import KnowledgeResearcher
from invest_assistant.modules.knowledge_base.schemas import KnowledgeResearcherCreate


def make_session(tmp_path: Path):
    db_path = tmp_path / "researchers.sqlite3"
    engine = create_engine(f"sqlite:///{db_path.as_posix()}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    service.ensure_knowledge_base_schema(engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False), engine


def patch_researcher_roots(monkeypatch, tmp_path: Path) -> Path:
    knowledge_root = tmp_path / "invest_assistant" / "modules" / "knowledge_base"
    external_root = knowledge_root / "external"
    researcher_root = external_root / "researchers"
    researcher_root.mkdir(parents=True)
    monkeypatch.setattr(service, "KNOWLEDGE_BASE_ROOT", knowledge_root)
    monkeypatch.setattr(service, "EXTERNAL_ROOT", external_root)
    monkeypatch.setattr(service, "RESEARCHER_PROFILE_ROOT", researcher_root)
    return knowledge_root


def test_researcher_profile_create_update_and_read_round_trip(tmp_path, monkeypatch):
    knowledge_root = patch_researcher_roots(monkeypatch, tmp_path)
    SessionLocal, _ = make_session(tmp_path)
    db = SessionLocal()

    created = service.create_researcher(
        db,
        KnowledgeResearcherCreate(
            researcher_code="analyst_001",
            display_name="A股标的研究员",
            status="active",
            intro="专注 A 股标的评级。",
            soul="证据优先，拒绝叙事漂移。",
            method="先看赛道，再看财务兑现。",
        ),
    )

    assert created.researcher_code == "analyst_001"
    assert created.display_name == "A股标的研究员"
    assert created.profile_path == "external/researchers/analyst_001/profile.md"
    assert created.profile_hash
    assert created.intro == "专注 A 股标的评级。"
    assert created.soul == "证据优先，拒绝叙事漂移。"
    assert created.method == "先看赛道，再看财务兑现。"
    assert (knowledge_root / created.profile_path).read_text(encoding="utf-8") == (
        "## 简介 intro\n\n"
        "专注 A 股标的评级。\n\n"
        "## 价值观 soul\n\n"
        "证据优先，拒绝叙事漂移。\n\n"
        "## 方法论 method\n\n"
        "先看赛道，再看财务兑现。\n"
    )

    updated = service.update_researcher(
        db,
        service.get_researcher(db, created.id),
        KnowledgeResearcherCreate(
            researcher_code="analyst_001",
            display_name="A股公司质量研究员",
            status="archived",
            intro="更新简介",
            soul="更新价值观",
            method="更新方法论",
        ),
    )

    assert updated.display_name == "A股公司质量研究员"
    assert updated.status == "archived"
    assert updated.intro == "更新简介"
    assert updated.soul == "更新价值观"
    assert updated.method == "更新方法论"
    assert updated.profile_hash != created.profile_hash


def test_researcher_profile_parser_returns_empty_missing_sections(tmp_path, monkeypatch):
    knowledge_root = patch_researcher_roots(monkeypatch, tmp_path)
    profile_path = knowledge_root / "external" / "researchers" / "analyst_002" / "profile.md"
    profile_path.parent.mkdir(parents=True)
    profile_path.write_text("## 简介 intro\n\n只有简介。", encoding="utf-8")
    SessionLocal, _ = make_session(tmp_path)
    db = SessionLocal()
    item = KnowledgeResearcher(
        researcher_code="analyst_002",
        display_name="缺段落研究员",
        profile_path="external/researchers/analyst_002/profile.md",
        profile_hash="old",
        status="active",
    )
    db.add(item)
    db.commit()

    read = service.list_researchers(db)[0]

    assert read.intro == "只有简介。"
    assert read.soul == ""
    assert read.method == ""


def test_researcher_code_is_unique(tmp_path, monkeypatch):
    patch_researcher_roots(monkeypatch, tmp_path)
    SessionLocal, _ = make_session(tmp_path)
    db = SessionLocal()
    payload = KnowledgeResearcherCreate(
        researcher_code="analyst_001",
        display_name="研究员一",
        status="active",
        intro="简介",
        soul="价值观",
        method="方法论",
    )
    service.create_researcher(db, payload)

    try:
        service.create_researcher(db, payload.model_copy(update={"display_name": "研究员二"}))
    except ValueError as exc:
        assert "researcher_code already exists" in str(exc)
    else:
        raise AssertionError("expected duplicate researcher_code to fail")


def test_migration_merges_legacy_researcher_tables_into_profile_files(tmp_path):
    from tools.dev.migrate_knowledge_researchers_single_table import migrate_knowledge_researchers

    db_path = tmp_path / "liuli.sqlite3"
    knowledge_root = tmp_path / "invest_assistant" / "modules" / "knowledge_base"
    soul_path = knowledge_root / "external" / "souls" / "rating-soul.md"
    method_path = knowledge_root / "external" / "methods" / "rating-method.md"
    soul_path.parent.mkdir(parents=True)
    method_path.parent.mkdir(parents=True)
    soul_path.write_text("旧价值观正文", encoding="utf-8")
    method_path.write_text("旧方法论正文", encoding="utf-8")
    con = sqlite3.connect(db_path)
    con.executescript(
        """
        CREATE TABLE knowledge_researcher_soul (
          id INTEGER PRIMARY KEY, name TEXT, file_path TEXT, version TEXT, file_hash TEXT, created_at TEXT, updated_at TEXT
        );
        CREATE TABLE knowledge_researcher_method (
          id INTEGER PRIMARY KEY, name TEXT, file_path TEXT, version TEXT, file_hash TEXT, created_at TEXT, updated_at TEXT
        );
        CREATE TABLE knowledge_researcher (
          id INTEGER PRIMARY KEY, name TEXT NOT NULL, soul_id INTEGER NOT NULL, method_id INTEGER NOT NULL,
          status TEXT NOT NULL, created_at TEXT, updated_at TEXT, code TEXT, description TEXT
        );
        CREATE TABLE knowledge_research_feedback (
          id INTEGER PRIMARY KEY, researcher_id INTEGER
        );
        INSERT INTO knowledge_researcher_soul VALUES
          (2, '价值观', 'invest_assistant/modules/knowledge_base/external/souls/rating-soul.md', '1.0', NULL, '2026-01-01', '2026-01-02');
        INSERT INTO knowledge_researcher_method VALUES
          (3, '方法论', 'invest_assistant/modules/knowledge_base/external/methods/rating-method.md', '1.0', NULL, '2026-01-01', '2026-01-02');
        INSERT INTO knowledge_researcher VALUES
          (1, '标的评级师', 2, 3, 'disabled', '2026-01-01', '2026-01-03', 'analyst_001', '旧简介');
        INSERT INTO knowledge_research_feedback VALUES (9, 1);
        """
    )
    con.commit()
    con.close()

    result = migrate_knowledge_researchers(db_path, project_root=tmp_path, backup_dir=tmp_path / "recovery")

    assert result.backup_path is not None
    assert result.backup_path.exists()
    con = sqlite3.connect(db_path)
    columns = [row[1] for row in con.execute("PRAGMA table_info(knowledge_researcher)").fetchall()]
    tables = {row[0] for row in con.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
    row = con.execute("SELECT id, researcher_code, display_name, profile_path, status FROM knowledge_researcher").fetchone()
    feedback_researcher_id = con.execute("SELECT researcher_id FROM knowledge_research_feedback WHERE id = 9").fetchone()[0]
    con.close()

    assert columns == ["id", "researcher_code", "display_name", "profile_path", "profile_hash", "status", "created_at", "updated_at"]
    assert "knowledge_researcher_soul" not in tables
    assert "knowledge_researcher_method" not in tables
    assert row == (1, "analyst_001", "标的评级师", "external/researchers/analyst_001/profile.md", "archived")
    assert feedback_researcher_id == 1
    assert (knowledge_root / "external" / "researchers" / "analyst_001" / "profile.md").read_text(encoding="utf-8") == (
        "## 简介 intro\n\n"
        "旧简介\n\n"
        "## 价值观 soul\n\n"
        "旧价值观正文\n\n"
        "## 方法论 method\n\n"
        "旧方法论正文\n"
    )
