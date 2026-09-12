import type { KnowledgeResearchFeedbackImportResult } from "../../api/knowledge";

/**
 * 研究回流导入结果提示。
 * 趋势报告的最终 JSON 永远是数组，单标的就是长度 1，所以统一按条数提示，没有单份特例。
 */
export function formatFeedbackImportSummary(result: KnowledgeResearchFeedbackImportResult): string {
  const message = result.message || "导入成功";
  if (typeof result.success_count === "number") {
    const failures = (result.failures || []).slice(0, 3).map(describeImportFailure);
    return failures.length ? `${message}；${failures.join("；")}` : message;
  }
  if (result.score?.id) return `${message}：评分 ID ${result.score.id}`;
  if (result.valuation?.id) return `${message}：估值 ID ${result.valuation.id}`;
  return message;
}

export function describeImportFailure(failure: { index: number; stock?: string | null; error: string }): string {
  return `${failure.stock || `第 ${failure.index + 1} 条`}：${failure.error}`;
}

/** 有失败条目时用 warning 提示，避免"全绿"掩盖掉没进来的标的。 */
export function hasImportFailure(result: KnowledgeResearchFeedbackImportResult): boolean {
  return typeof result.failure_count === "number" && result.failure_count > 0;
}
