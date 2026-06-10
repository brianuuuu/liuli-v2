from invest_assistant.modules.knowledge_base.schemas import KnowledgeNoteCreate
from invest_assistant.modules.knowledge_base.service import _derive_note_title, _note_payload_data


def test_derive_note_title_uses_first_non_empty_line():
    assert _derive_note_title("\n  第一行标题  \n第二行正文") == "第一行标题"


def test_derive_note_title_truncates_long_first_line():
    content = "一" * 81
    assert _derive_note_title(content) == f"{'一' * 80}..."


def test_note_payload_data_falls_back_to_content_title_when_title_missing():
    payload = KnowledgeNoteCreate(content="  自动标题\n正文  ", note_type="review")

    data = _note_payload_data(payload, {})

    assert data["title"] == "自动标题"
    assert data["content"] == "  自动标题\n正文  "
