/**
 * 待处理报告卡片的展示拆分。回流标题的约定格式是「研究对象-YYYY-MM-DD-报告类型」，
 * 这里只负责把报告类型拆出来单独高亮，能不能导入由后端判定，端上不复刻解析规则。
 */
const REPORT_TITLE_RE = /^(.+)-(\d{4}-\d{2}-\d{2})-(.+)$/;

export type PendingReportTitle = {
  subject: string;
  reportType: string;
};

export function splitPendingReportTitle(title: string): PendingReportTitle {
  const match = REPORT_TITLE_RE.exec(String(title ?? "").trim());
  if (!match) return { subject: String(title ?? "").trim(), reportType: "" };
  return { subject: match[1].trim(), reportType: match[3].trim() };
}
