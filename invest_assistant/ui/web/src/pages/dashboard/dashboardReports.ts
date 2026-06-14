export type ReportKind = "market" | "track" | "stock";

type ReportLike = {
  source_module?: string | null;
  report_type?: string | null;
  target_type?: string | null;
};

export const DEFAULT_REPORT_PAGE_SIZE = 20;

function reportText(record: ReportLike): string {
  return `${record.source_module || ""} ${record.report_type || ""} ${record.target_type || ""}`.toLowerCase();
}

export function reportMatchesKind(record: ReportLike, kind: ReportKind): boolean {
  const text = reportText(record);
  if (kind === "market") {
    return record.target_type === "market_daily" || (record.source_module === "market_radar" && record.report_type === "daily");
  }
  if (kind === "track") return text.includes("track") || text.includes("赛道");
  return text.includes("stock") || text.includes("标的");
}

export function reportPageParams(page: number, pageSize: number = DEFAULT_REPORT_PAGE_SIZE) {
  const safePage = Math.max(1, Math.floor(page || 1));
  const safePageSize = Math.max(1, Math.floor(pageSize || DEFAULT_REPORT_PAGE_SIZE));
  return {
    limit: safePageSize,
    offset: (safePage - 1) * safePageSize
  };
}
