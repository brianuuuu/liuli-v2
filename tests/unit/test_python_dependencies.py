import tomllib
from pathlib import Path


def test_runtime_dependencies_include_akshare_used_by_services():
    pyproject = tomllib.loads(Path("pyproject.toml").read_text(encoding="utf-8"))
    dependencies = pyproject["project"]["dependencies"]

    assert any(dependency.startswith("akshare") for dependency in dependencies)
