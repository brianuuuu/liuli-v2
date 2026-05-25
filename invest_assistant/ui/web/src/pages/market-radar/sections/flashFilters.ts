type TaggedSourceItem = {
  source_tags?: Array<{
    tag?: { id: number } | null;
  }>;
};

type FlashFilterOptions = {
  activeTagId?: number | null;
};

export function filterFlashRows<T extends TaggedSourceItem>(rows: T[], filters: FlashFilterOptions) {
  const activeTagId = filters.activeTagId ?? null;
  if (activeTagId === null) return rows;

  return rows.filter((item) => item.source_tags?.some((sourceTag) => sourceTag.tag?.id === activeTagId));
}
