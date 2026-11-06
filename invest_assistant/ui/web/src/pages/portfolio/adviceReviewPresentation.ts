import type { AdjustAdviceItem, AdjustAdviceReport, AdjustAdviceReviews } from "../../types/api";

export type ReviewKind = "signal" | "risk";
export type ReviewRecord = {
  key: string;
  report: AdjustAdviceReport;
  item: AdjustAdviceItem;
  inclusion: "counted" | "repeat" | "not_touched" | "pending" | "unknown";
  latestRisk?: { date: string; level: string };
};
export type ReviewGroup = {
  key: string;
  code: string;
  action?: string;
  samples: number;
  correct: number;
  wrong: number;
  neutral: number;
  hits: number;
  rate: number | null;
  avgEffect: number | null;
  pending: number;
  records: ReviewRecord[];
  stocks: { id: number; name: string; code: string }[];
};

const directional = (item: AdjustAdviceItem) => item.action === "add" || item.action === "reduce";
const alerting = (item: AdjustAdviceItem) => item.risk_level === "warning" || item.risk_level === "severe";
const recordKey = (report: AdjustAdviceReport, item: AdjustAdviceItem) => `${report.id}:${item.id}`;
const stockScope = (report: AdjustAdviceReport, item: AdjustAdviceItem) => `${report.portfolio_id ?? "all"}:${report.researcher_code ?? ""}:${item.stock_id}`;

/** 只用于说明明细是否计入后台样本，去重顺序与后台 _episode_samples 一致；不重算胜率。 */
function signalMembership(reports: AdjustAdviceReport[], complete: boolean) {
  const membership = new Map<string, ReviewRecord["inclusion"]>();
  const previous = new Map<number | null, Map<number, AdjustAdviceItem>>();
  const episodes = new Map<string, boolean>();
  for (const report of reports) {
    const lastItems = previous.get(report.portfolio_id);
    for (const item of report.items.filter(directional)) {
      const key = `${report.portfolio_id ?? "all"}:${item.stock_id}`;
      const last = lastItems?.get(item.stock_id);
      if (!last || last.action !== item.action || last.execution_status === "executed" || last.execution_status === "partial" || !episodes.has(key)) {
        episodes.set(key, false);
      }
      let status: ReviewRecord["inclusion"] = "pending";
      if (item.trigger_status === "not_touched") status = "not_touched";
      else if (item.verdict != null && item.trigger_status === "touched") {
        status = complete ? (episodes.get(key) ? "repeat" : "counted") : "unknown";
        episodes.set(key, true);
      }
      membership.set(recordKey(report, item), status);
    }
    previous.set(report.portfolio_id, new Map(report.items.map((item) => [item.stock_id, item])));
  }
  return membership;
}

export function buildAdviceReviewGroups(data: AdjustAdviceReviews, kind: ReviewKind) {
  const reports = [...data.reports].sort((a, b) => a.target_trade_date.localeCompare(b.target_trade_date) || a.id - b.id);
  const complete = reports.length >= data.summary.report_count;
  const membership = kind === "signal" ? signalMembership(reports, complete) : new Map<string, ReviewRecord["inclusion"]>();
  const latest = new Map<string, { report: AdjustAdviceReport; item: AdjustAdviceItem }>();
  for (const report of reports) for (const item of report.items) latest.set(stockScope(report, item), { report, item });
  const groups = new Map<string, ReviewGroup>();
  const getGroup = (code: string, action?: string) => {
    const key = action ? `${action}:${code}` : code;
    if (!groups.has(key)) groups.set(key, {
      key, code, action, samples: 0, correct: 0, wrong: 0, neutral: 0, hits: 0,
      rate: null, avgEffect: null, pending: 0, records: [], stocks: []
    });
    return groups.get(key)!;
  };
  if (kind === "signal") {
    for (const row of data.signal_stats.by_signal) Object.assign(getGroup(row.signal_code || "unknown", row.action), {
      samples: row.samples, correct: row.correct, wrong: row.wrong, neutral: row.neutral,
      rate: row.samples ? row.win_rate : null, avgEffect: row.samples ? row.avg_effect_20d : null
    });
  } else {
    for (const row of data.risk_stats) Object.assign(getGroup(row.risk_code || "unknown"), {
      samples: row.samples, hits: row.hits, rate: row.samples ? row.hit_rate : null
    });
  }
  for (const report of [...reports].reverse()) {
    for (const item of report.items) {
      if (kind === "signal" ? !directional(item) : !alerting(item) && item.risk_verdict == null) continue;
      const group = getGroup((kind === "signal" ? item.primary_signal_code : item.primary_risk_code) || "unknown", kind === "signal" ? item.action : undefined);
      const pending = (kind === "signal" ? item.verdict : item.risk_verdict) == null;
      const last = latest.get(stockScope(report, item));
      group.records.push({
        key: recordKey(report, item), report, item,
        inclusion: kind === "signal" ? membership.get(recordKey(report, item))! : pending ? "pending" : "counted",
        latestRisk: kind === "risk" && last && last.report.id !== report.id
          ? { date: last.report.target_trade_date, level: last.item.risk_level } : undefined
      });
      if (pending) group.pending++;
      if (!group.stocks.some((stock) => stock.id === item.stock_id)) group.stocks.push({ id: item.stock_id, name: item.stock_name, code: item.stock_code });
    }
  }
  return { complete, groups: [...groups.values()] };
}

export function directionEffect(item: AdjustAdviceItem): number | null {
  if (item.return_20d == null || !Number.isFinite(item.return_20d) || !directional(item)) return null;
  return item.action === "reduce" ? -item.return_20d : item.return_20d;
}

export function riskExcess(item: AdjustAdviceItem): number | null {
  if (item.return_20d == null || item.benchmark_return_20d == null || !Number.isFinite(item.return_20d) || !Number.isFinite(item.benchmark_return_20d)) return null;
  return item.return_20d - item.benchmark_return_20d;
}
