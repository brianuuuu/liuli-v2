import json
from pathlib import Path

from invest_assistant.services.deepseek import client as deepseek_client

TEST_TMP_ROOT = Path("var/cache/test-ai-debug")


def ensure_test_tmp_root():
    TEST_TMP_ROOT.mkdir(parents=True, exist_ok=True)


def make_log_path(name: str) -> Path:
    ensure_test_tmp_root()
    path = TEST_TMP_ROOT / name / "ai_debug.log"
    path.parent.mkdir(parents=True, exist_ok=True)
    for item in path.parent.glob("ai_debug.log*"):
        item.unlink()
    return path


class DummyPrompt:
    target_task = "market_radar.extract_daily_hotwords_deepseek"
    prompt_key = "market_radar.extract_daily_hotwords_deepseek"
    system_prompt = "system prompt"
    user_prompt = "user prompt"
    response_format = "json_object"


class DummyResponse:
    def __init__(self, raw: str):
        self.raw = raw

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return False

    def read(self):
        return self.raw.encode("utf-8")


def read_log_entries(path: Path) -> list[dict]:
    content = path.read_text(encoding="utf-8")
    decoder = json.JSONDecoder()
    entries = []
    index = 0
    while index < len(content):
        while index < len(content) and content[index].isspace():
            index += 1
        if index >= len(content):
            break
        entry, index = decoder.raw_decode(content, index)
        entries.append(entry)
    return entries


def test_ai_debug_log_is_not_written_when_system_config_is_missing(monkeypatch):
    log_path = make_log_path("disabled")
    monkeypatch.setattr("invest_assistant.services.ai_debug_logger.AI_DEBUG_LOG_PATH", log_path)
    monkeypatch.setattr("invest_assistant.services.ai_debug_logger.is_ai_debug_log_enabled", lambda: False)

    from invest_assistant.services.ai_debug_logger import write_ai_debug_log

    write_ai_debug_log(
        provider="deepseek",
        model="deepseek-v4-flash",
        task_name="test.task",
        endpoint="https://api.deepseek.com/chat/completions",
        request_payload={"message": "hello"},
        raw_response="{}",
        parsed_response={},
        status="success",
        duration_ms=1,
    )

    assert not log_path.exists()


def test_deepseek_success_writes_full_request_and_response_without_api_key(monkeypatch):
    log_path = make_log_path("success")
    monkeypatch.setattr("invest_assistant.services.ai_debug_logger.AI_DEBUG_LOG_PATH", log_path)
    monkeypatch.setattr("invest_assistant.services.ai_debug_logger.is_ai_debug_log_enabled", lambda: True)
    monkeypatch.setattr(deepseek_client, "get_deepseek_api_key", lambda: "secret-api-key")

    raw_response = json.dumps(
        {
            "choices": [{"message": {"content": json.dumps({"hotwords": [{"name": "AI"}]})}}],
            "usage": {"prompt_tokens": 3, "completion_tokens": 2, "total_tokens": 5},
        }
    )
    monkeypatch.setattr(deepseek_client.request, "urlopen", lambda req, timeout: DummyResponse(raw_response))

    result = deepseek_client.extract_hotwords([{"title": "news"}], DummyPrompt(), "deepseek-v4-flash")

    assert result["hotwords"] == [{"name": "AI"}]
    assert result["usage"]["total_tokens"] == 5
    log_content = log_path.read_text(encoding="utf-8")
    assert '\n  "provider": "deepseek"' in log_content
    [entry] = read_log_entries(log_path)
    assert entry["provider"] == "deepseek"
    assert entry["model"] == "deepseek-v4-flash"
    assert entry["task_name"] == "market_radar.extract_daily_hotwords_deepseek"
    assert entry["status"] == "success"
    assert entry["request_payload"]["messages"][0]["content"] == "system prompt"
    assert entry["raw_response"] == raw_response
    assert entry["parsed_response"]["hotwords"] == [{"name": "AI"}]
    assert "secret-api-key" not in log_path.read_text(encoding="utf-8")


def test_deepseek_failure_writes_failed_debug_log(monkeypatch):
    log_path = make_log_path("failure")
    monkeypatch.setattr("invest_assistant.services.ai_debug_logger.AI_DEBUG_LOG_PATH", log_path)
    monkeypatch.setattr("invest_assistant.services.ai_debug_logger.is_ai_debug_log_enabled", lambda: True)
    monkeypatch.setattr(deepseek_client, "get_deepseek_api_key", lambda: "secret-api-key")

    def fail_request(req, timeout):
        raise OSError("network down")

    monkeypatch.setattr(deepseek_client.request, "urlopen", fail_request)

    try:
        deepseek_client.extract_hotwords([{"title": "news"}], DummyPrompt(), "deepseek-v4-flash")
    except RuntimeError as exc:
        assert "deepseek request failed" in str(exc)
    else:
        raise AssertionError("expected RuntimeError")

    [entry] = read_log_entries(log_path)
    assert entry["status"] == "failed"
    assert "network down" in entry["error_message"]
    assert entry["request_payload"]["model"] == "deepseek-v4-flash"


def test_ai_debug_log_rotates_three_files_at_ten_megabytes(monkeypatch):
    log_path = make_log_path("rotate")
    monkeypatch.setattr("invest_assistant.services.ai_debug_logger.AI_DEBUG_LOG_PATH", log_path)
    monkeypatch.setattr("invest_assistant.services.ai_debug_logger.MAX_AI_DEBUG_LOG_BYTES", 10)
    monkeypatch.setattr("invest_assistant.services.ai_debug_logger.is_ai_debug_log_enabled", lambda: True)

    log_path.write_text("current-file-over-limit", encoding="utf-8")
    log_path.with_name("ai_debug.log.1").write_text("previous-file", encoding="utf-8")
    log_path.with_name("ai_debug.log.2").write_text("oldest-file", encoding="utf-8")

    from invest_assistant.services.ai_debug_logger import write_ai_debug_log

    write_ai_debug_log(
        provider="deepseek",
        model="deepseek-v4-flash",
        task_name="test.task",
        endpoint="https://api.deepseek.com/chat/completions",
        request_payload={"message": "new"},
        raw_response="{}",
        parsed_response={},
        status="success",
        duration_ms=1,
    )

    assert "new" in log_path.read_text(encoding="utf-8")
    assert log_path.with_name("ai_debug.log.1").read_text(encoding="utf-8") == "current-file-over-limit"
    assert log_path.with_name("ai_debug.log.2").read_text(encoding="utf-8") == "previous-file"
