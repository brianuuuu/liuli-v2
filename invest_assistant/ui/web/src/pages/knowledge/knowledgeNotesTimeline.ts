export const KNOWLEDGE_NOTES_PAGE_SIZE = 20;

export type KnowledgeNoteLike = {
  id: number;
  created_at?: string | null;
  updated_at?: string | null;
};

export type KnowledgeNoteQuery = {
  status?: string;
  group_id?: number;
  tag_id?: number;
  q?: string;
  limit?: number;
  offset?: number;
};

export function groupKnowledgeNotesByDate<T extends KnowledgeNoteLike>(rows: T[]) {
  const sortedRows = [...rows].sort((a, b) => noteTime(b).localeCompare(noteTime(a)));
  const groups: Array<{ date: string; items: T[] }> = [];
  const dateMap = new Map<string, { date: string; items: T[] }>();
  
  for (const item of sortedRows) {
    const date = noteDate(item);
    if (!dateMap.has(date)) {
      const group = { date, items: [item] };
      dateMap.set(date, group);
      groups.push(group);
    } else {
      dateMap.get(date)!.items.push(item);
    }
  }
  return groups;
}

export function mergeKnowledgeNotePage<T extends { id: number }>(currentRows: T[], nextRows: T[]) {
  const seenIds = new Set(currentRows.map((item) => item.id));
  return [...currentRows, ...nextRows.filter((item) => !seenIds.has(item.id))];
}

export function refreshKnowledgeNoteQuery<T extends KnowledgeNoteQuery>(query: T): T {
  return { ...query, offset: 0 };
}

export function shouldLoadNextKnowledgeNotePage(
  target: { scrollTop: number; clientHeight: number; scrollHeight: number },
  hasMore: boolean,
  loading: boolean,
  threshold = 80
) {
  if (!hasMore || loading) return false;
  return target.scrollTop + target.clientHeight >= target.scrollHeight - threshold;
}

function noteTime(item: KnowledgeNoteLike) {
  return String(item.updated_at || item.created_at || "");
}

function noteDate(item: KnowledgeNoteLike) {
  const value = String(item.created_at || "");
  return value ? value.slice(0, 10) : "未注明日期";
}
