export type ScoreContinuityFields = {
  report_id?: number | null;
  report_available?: boolean | null;
  previous_snapshot_id?: number | null;
  continuity?: {
    previous_report_id: number | null;
    change_reasons: Array<{ field: string; type: string; reason: string; evidence: string[] }>;
    previous_checks: Array<{ report_id: number; check_id: string; result: string; reason: string; evidence: string[] }>;
    next_checks: Array<{ id: string; condition: string }>;
  } | null;
  comparison?: {
    status: "recorded" | "legacy" | "no_baseline" | "baseline_missing" | "report_only";
    baseline_id: number | null;
    report_time: string | null;
    report_id: number | null;
    report_available: boolean;
    previous_level: string | null;
    total_delta: number | null;
    method_changed: boolean;
    dimensions: Array<{ field: string; previous: number; current: number; delta: number }>;
  } | null;
  check_sources?: Array<{ report_id: number; check_id: string; condition: string | null; source_missing: boolean; report_available: boolean }>;
};

export const SCORE_FIELD_LABELS: Record<string, string> = {
  business_moat_score: "壁垒", management_score: "管理", governance_score: "治理", strategy_score: "战略",
  certainty_score: "确定性", growth_score: "成长", total_score: "总分", investment_level: "等级",
  core_logic: "核心逻辑", primary_risk: "主要风险",
};

export const CHECK_RESULT_LABELS: Record<string, string> = {
  supported: "得到支持", weakened: "被削弱", invalidated: "被证伪", pending: "待验证", insufficient_evidence: "证据不足",
};

export function scoreDelta(value: number | null | undefined): string {
  if (value == null) return "—";
  if (value === 0) return "持平";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
}

export function continuityStatus(score: ScoreContinuityFields): string | null {
  if (!score.continuity) return "未记录连续性";
  if (score.comparison?.status === "baseline_missing") return "比较来源已删除";
  if (score.comparison?.status === "report_only") return "比较报告未关联评分";
  if (score.continuity.previous_report_id == null) return "暂无比较基准";
  if (score.comparison?.method_changed) return "评分口径变化";
  if (score.comparison?.status === "recorded") return "评分口径未核实";
  return null;
}
