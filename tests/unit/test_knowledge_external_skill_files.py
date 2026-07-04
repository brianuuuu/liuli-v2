from pathlib import Path

import pytest

from invest_assistant.modules.knowledge_base import service


def write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


@pytest.fixture()
def skill_root(tmp_path, monkeypatch):
    root = tmp_path / "external" / "skills"
    root.mkdir(parents=True)
    monkeypatch.setattr(service, "EXTERNAL_SKILL_ROOT", root)
    monkeypatch.setattr(service, "EXTERNAL_ROOT", root.parent)
    monkeypatch.setattr(service, "PROJECT_ROOT", tmp_path)
    return root


def test_scan_external_skills_reads_skill_directories_from_frontmatter(skill_root):
    write(
        skill_root / "alpha-skill" / "SKILL.md",
        "---\nname: Alpha Skill\ndescription: Alpha description\nstatus: draft\nversion: 1.2.0\n---\n\n# Alpha\n",
    )
    write(skill_root / "fallback-skill" / "SKILL.md", "# Fallback\n")
    write(skill_root / "ignored-without-skill" / "README.md", "# Ignored\n")

    items = service.scan_external_skills()

    assert [item.slug for item in items] == ["alpha-skill", "fallback-skill"]
    assert items[0].name == "Alpha Skill"
    assert items[0].description == "Alpha description"
    assert items[0].status == "draft"
    assert items[0].version == "1.2.0"
    assert items[0].skill_path == "alpha-skill/SKILL.md"
    assert items[1].name == "fallback-skill"
    assert items[1].description == ""
    assert items[1].status == "active"
    assert items[1].version is None


def test_list_external_skill_files_returns_read_only_tree(skill_root):
    write(skill_root / "alpha-skill" / "SKILL.md", "---\nname: Alpha\n---\n")
    write(skill_root / "alpha-skill" / "references" / "guide.md", "# Guide\n")
    write(skill_root / "alpha-skill" / "scripts" / "run.py", "print('ok')\n")

    tree = service.list_external_skill_files("alpha-skill")

    assert tree.name == "alpha-skill"
    assert tree.path == "alpha-skill"
    assert tree.type == "directory"
    assert [child.name for child in tree.children] == ["references", "scripts", "SKILL.md"]
    references = tree.children[0]
    assert references.children[0].path == "alpha-skill/references/guide.md"


def test_read_external_skill_file_rejects_directories_missing_files_and_path_escape(skill_root):
    write(skill_root / "alpha-skill" / "SKILL.md", "---\nname: Alpha\n---\n\n# Alpha\n")
    write(skill_root / "alpha-skill" / "references" / "guide.md", "# Guide\n")

    content = service.read_external_skill_file("alpha-skill/references/guide.md")

    assert content.path == "alpha-skill/references/guide.md"
    assert content.content == "# Guide\n"

    for invalid_path, expected in [
        ("../outside.md", "external skill file path is outside root"),
        ("alpha-skill", "external skill path is not a file"),
        ("alpha-skill/missing.md", "external skill file not found"),
    ]:
        with pytest.raises(ValueError, match=expected):
            service.read_external_skill_file(invalid_path)
