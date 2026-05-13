from typing import Any


def ok(data: Any = None, message: str = "ok") -> dict[str, Any]:
    return {"success": True, "message": message, "data": data}
