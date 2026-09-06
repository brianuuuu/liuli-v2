"""MCP 层的返回投影。

详情类 service 会一次性返回完整对象（评分/估值历史、材料、公告、笔记等），
Web 和 H5 依赖这个完整结构，所以裁剪只做在 MCP 包装层，不改业务 service。
"""

HEAD = "head"
TAIL = "tail"


def select_sections(payload: dict, sections, section_fields: dict[str, tuple[str, ...]]) -> None:
    """按 section 名保留字段，未选中的 section 对应字段整段移除。"""
    wanted = set(sections)
    for name, fields in section_fields.items():
        if name in wanted:
            continue
        for field in fields:
            payload.pop(field, None)


def resolve_sections(sections, section_fields: dict[str, tuple[str, ...]], default: tuple[str, ...]) -> tuple[str, ...]:
    if not sections:
        return default
    unknown = [name for name in sections if name not in section_fields]
    if unknown:
        raise ValueError(f"unsupported sections: {', '.join(sorted(unknown))}; allowed: {', '.join(sorted(section_fields))}")
    return tuple(sections)


def trim_field(payload: dict, field: str, limit: int | None, keep: str = HEAD) -> bool:
    """把列表字段截到 limit 条，并写入 {field}_total 告知原始条数。返回是否发生截断。"""
    rows = payload.get(field)
    if limit is None or not isinstance(rows, list):
        return False
    size = max(0, int(limit))
    if len(rows) <= size:
        return False
    payload[f"{field}_total"] = len(rows)
    payload[field] = rows[-size:] if keep == TAIL else rows[:size]
    return True


def truncate_text(rows, field: str, max_chars: int | None) -> bool:
    """按字符数截断列表里每行的长文本字段，行内标记 {field}_truncated 和 {field}_length。"""
    if not max_chars or int(max_chars) <= 0 or not isinstance(rows, list):
        return False
    size = int(max_chars)
    truncated = False
    for row in rows:
        if not isinstance(row, dict):
            continue
        text = row.get(field)
        if isinstance(text, str) and len(text) > size:
            row[field] = text[:size]
            row[f"{field}_truncated"] = True
            row[f"{field}_length"] = len(text)
            truncated = True
    return truncated
