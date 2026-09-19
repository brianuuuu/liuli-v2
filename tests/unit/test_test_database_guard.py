"""护栏自测：跑全量时真实数据库必须碰不到。

这个文件保护的是 tests/conftest.py 本身——护栏一旦被误删或改坏，
下一次 `pytest tests/unit` 就会重新把 var/db/liuli.sqlite3 清空，
而且不会有任何用例变红。所以这里直接断言护栏的两道防线都在。
"""

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
CONFTEST = REPO_ROOT / "tests" / "conftest.py"


def test_engine_never_points_at_the_real_database_directory():
    from invest_assistant.bootstrap.database import engine

    assert engine.url.get_backend_name() == "sqlite"
    db_path = Path(engine.url.database)
    if not db_path.is_absolute():
        db_path = Path.cwd() / db_path
    assert db_path.resolve().parent != (REPO_ROOT / "var" / "db").resolve()


def test_drop_all_in_tests_cannot_reach_the_real_database():
    """tests/unit 里确实有用例对应用引擎 drop_all，这不是假设。"""
    sources = [path.read_text(encoding="utf-8") for path in (REPO_ROOT / "tests" / "unit").glob("*.py")]
    assert any("Base.metadata.drop_all(bind=engine)" in text for text in sources)

    from invest_assistant.bootstrap.database import engine

    assert "var/test-db" in engine.url.database.replace("\\", "/")


def test_conftest_keeps_both_guard_layers():
    source = CONFTEST.read_text(encoding="utf-8")
    # 第 1 道：导入前改指
    assert "_install_test_database_url()" in source
    assert 'os.environ["DATABASE_URL"]' in source
    # 第 2 道：指错就终止，不是只打一条警告
    assert "pytest.exit(" in source
