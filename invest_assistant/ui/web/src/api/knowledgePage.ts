import type { KnowledgeNotePage, KnowledgeNoteQuery } from "./knowledge";

export function normalizeKnowledgeNotePage(raw: unknown, query: KnowledgeNoteQuery = {}): KnowledgeNotePage {
  const limit = query.limit ?? 20;
  const offset = query.offset ?? 0;
  if (Array.isArray(raw)) {
    const items = raw.map(normalizeKnowledgeNote);
    return {
      items,
      total: items.length,
      limit,
      offset,
      has_more: false
    };
  }
  const page = raw as Partial<KnowledgeNotePage> | null | undefined;
  const items = Array.isArray(page?.items) ? page.items.map(normalizeKnowledgeNote) : [];
  return {
    items,
    total: Number(page?.total ?? items.length),
    limit: Number(page?.limit ?? limit),
    offset: Number(page?.offset ?? offset),
    has_more: Boolean(page?.has_more)
  };
}

function normalizeKnowledgeNote<T extends { tags?: unknown }>(item: T): T {
  return {
    ...item,
    tags: Array.isArray(item.tags) ? item.tags : []
  };
}
