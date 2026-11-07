import json
import re


def extract_trailing_json_payload(markdown: str) -> dict | list:
    """取报告末尾的最终 JSON。单份报告是对象，组合报告是同构对象组成的数组。"""
    content = str(markdown or "").strip()
    if not content:
        raise ValueError("报告内容为空")
    fenced_match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```\s*$", content, re.IGNORECASE)
    candidates = []
    if fenced_match:
        candidates.append(fenced_match.group(1).strip())
    candidates.append(content)
    decoder = json.JSONDecoder()
    for candidate in candidates:
        text = str(candidate or "").strip()
        if not text:
            continue
        try:
            parsed = json.loads(text)
            if isinstance(parsed, (dict, list)):
                return parsed
        except Exception:
            pass
        for index in range(len(text) - 1, -1, -1):
            if text[index] not in "{[":
                continue
            fragment = text[index:].strip()
            try:
                parsed, end = decoder.raw_decode(fragment)
            except Exception:
                continue
            if isinstance(parsed, (dict, list)) and not fragment[end:].strip():
                return parsed
    raise ValueError("未在报告末尾解析到 JSON")


def extract_trailing_json_object(markdown: str) -> dict:
    payload = extract_trailing_json_payload(markdown)
    if not isinstance(payload, dict):
        raise ValueError("报告末尾的 JSON 必须是对象")
    return payload
