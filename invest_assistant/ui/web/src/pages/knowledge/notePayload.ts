import type { KnowledgeNote, KnowledgeNotePayload } from "../../api/knowledge";

/** 更新笔记是整体覆盖，局部修改（如只改分组、标签）也要带上其余字段。 */
export function noteToPayload(note: KnowledgeNote): KnowledgeNotePayload {
  return {
    title: note.title,
    content: note.content,
    note_type: note.note_type,
    group_id: note.group_id ?? null,
    related_module: note.related_module ?? null,
    related_id: note.related_id ?? null,
    tags: note.tags_text ?? null,
    tag_ids: note.tags.map((tag) => tag.id),
    status: note.status
  };
}
