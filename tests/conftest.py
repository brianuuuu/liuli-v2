"""把测试统一改指到临时数据库，并在指错时立刻中止整轮测试。

起因：tests/unit 里有多个用例对**应用真实引擎**执行 `Base.metadata.drop_all`
（例如 test_market_radar.py 的 `reset_db`、test_remaining_phases.py 的同名函数）。
这些用例单独跑没问题，跑全量 `pytest tests/unit` 就会把 var/db/liuli.sqlite3 清空，
而且清得无声无息——测试照样绿，数据已经没了。

两道防线：
1. 在 invest_assistant 被导入之前改掉 DATABASE_URL，让 drop_all 打到 var/test-db/ 的
   一次性文件上。var/* 已在 .gitignore 里，不会污染仓库。
2. 兜底断言：引擎一旦仍指向 var/db/ 下的任何文件，`pytest.exit` 直接终止，
   不给它执行的机会。第 1 道被绕过（比如有人显式设了 DATABASE_URL）时由它拦住。
"""

import os
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
# 真实数据库及其备份都在这个目录下，测试一律不许碰
PROTECTED_DB_DIR = (REPO_ROOT / "var" / "db").resolve()
TEST_DB_DIR = REPO_ROOT / "var" / "test-db"


def _install_test_database_url() -> None:
    """必须在任何 invest_assistant 模块导入前执行：engine 是模块级单例，导入即定型。"""
    if os.environ.get("DATABASE_URL"):
        return
    TEST_DB_DIR.mkdir(parents=True, exist_ok=True)
    os.environ["DATABASE_URL"] = "sqlite:///" + (TEST_DB_DIR / "pytest.sqlite3").as_posix()


_install_test_database_url()


def _engine_file_path() -> Path | None:
    from invest_assistant.bootstrap.database import engine

    if engine.url.get_backend_name() != "sqlite" or not engine.url.database:
        return None
    path = Path(engine.url.database)
    if not path.is_absolute():
        path = Path.cwd() / path
    return path.resolve()


def pytest_configure(config: pytest.Config) -> None:
    db_path = _engine_file_path()
    if db_path is None:
        return
    if db_path.parent == PROTECTED_DB_DIR:
        pytest.exit(
            f"测试引擎指向真实数据库目录：{db_path}\n"
            f"tests/unit 里有用例会对该引擎执行 drop_all，继续跑会清空数据。\n"
            f"请改用 var/test-db/ 下的临时库，或显式设置 DATABASE_URL 后重试。",
            returncode=2,
        )
