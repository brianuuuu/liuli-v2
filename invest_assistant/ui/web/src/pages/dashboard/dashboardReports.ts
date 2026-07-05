export type ReportKind = "market" | "track" | "stock";

type ReportLike = {
  title?: string | null;
  report_type?: string | null;
  target_type?: string | null;
};

export const DEFAULT_REPORT_PAGE_SIZE = 20;

function reportText(record: ReportLike): string {
  return `${record.title || ""} ${record.report_type || ""}`.toLowerCase();
}

export function reportMatchesKind(record: ReportLike, kind: ReportKind): boolean {
  const text = reportText(record);
  if (kind === "market") {
    return record.target_type === "market" || record.target_type === "market_daily" || text.includes("market") || text.includes("市场日报") || text.includes("市场雷达日报");
  }
  if (kind === "track") return record.target_type === "track" || text.includes("track") || text.includes("赛道");
  return record.target_type === "stock" || text.includes("stock") || text.includes("标的");
}

export function reportPageParams(page: number, pageSize: number = DEFAULT_REPORT_PAGE_SIZE, kind?: ReportKind) {
  const safePage = Math.max(1, Math.floor(page || 1));
  const safePageSize = Math.max(1, Math.floor(pageSize || DEFAULT_REPORT_PAGE_SIZE));
  return {
    limit: safePageSize,
    offset: (safePage - 1) * safePageSize,
    ...(kind ? { report_kind: kind } : {})
  };
}
