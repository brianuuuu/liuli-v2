from pathlib import Path

import tomllib


ROOT = Path(__file__).resolve().parents[2]


def test_project_is_named_liuli():
    data = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))
    assert data["project"]["name"] == "liuli"


def test_runtime_directories_are_ignored_but_present():
    assert (ROOT / "var").exists()
    gitignore = (ROOT / ".gitignore").read_text(encoding="utf-8")
    assert "var/*" in gitignore
    assert "!var/.gitkeep" in gitignore
