import json
from typing import Any


def dumps_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


def loads_json(value: str | None) -> Any:
    if not value:
        return None
    return json.loads(value)
