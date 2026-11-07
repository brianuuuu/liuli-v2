import { Link } from "react-router-dom";
import type { StockScoreSnapshot } from "../types/api";
import { CHECK_RESULT_LABELS, SCORE_FIELD_LABELS, continuityStatus, scoreDelta } from "../../../../shared/scoreContinuity";
import "../../../../shared/scoreContinuity.css";

export function ScoreContinuityDetails({ score }: { score: StockScoreSnapshot }) {
  const body = score.continuity;
  const comparison = score.comparison;
  const status = continuityStatus(score);
  const reportLink = (id: number | null | undefined, available: boolean | null | undefined, label: string) => id ? (
    available ? <Link to={`/reports/${id}`}>{label}</Link> : <span className="score-continuity__muted">{label}缺失</span>
  ) : null;
  return <div className="score-continuity">
    <div className="score-continuity__links">
      {comparison?.status === "recorded" ? <strong>较 {comparison.report_time}　{scoreDelta(comparison.total_delta)}　{comparison.previous_level} → {score.investment_level}</strong> : null}
      {status ? <span className="score-continuity__muted">{status}</span> : null}
      {reportLink(score.report_id, score.report_available, "本次报告")}
      {reportLink(comparison?.report_id, comparison?.report_available, "比较报告")}
      {score.report_id == null ? <span className="score-continuity__muted">原报告未关联</span> : null}
    </div>
    {body?.change_reasons.length ? <section><h4>变动说明</h4>{body.change_reasons.map((item, index) => {
      const dimension = comparison?.dimensions.find((entry) => entry.field === item.field);
      return <div className="score-continuity__item" key={`${item.field}-${index}`}>
        <strong>{SCORE_FIELD_LABELS[item.field] ?? item.field}{dimension ? `　${dimension.previous} → ${dimension.current}（${scoreDelta(dimension.delta)}）` : ""}</strong>
        <p>{item.reason}</p><Evidence items={item.evidence} />
      </div>;
    })}</section> : null}
    {body?.previous_checks.length ? <section><h4>历史验证</h4>{body.previous_checks.map((item) => {
      const source = score.check_sources?.find((entry) => entry.report_id === item.report_id && entry.check_id === item.check_id);
      return <div className="score-continuity__item" key={`${item.report_id}-${item.check_id}`}>
        <strong>{CHECK_RESULT_LABELS[item.result] ?? item.result}{source?.source_missing ? " · 原事项缺失" : ""}</strong>
        <p>{source?.condition ?? item.check_id}</p><p>{item.reason}</p>
        {reportLink(source?.report_id, source?.report_available, "来源报告")}<Evidence items={item.evidence} />
      </div>;
    })}</section> : null}
    {body?.next_checks.length ? <section><h4>后续验证</h4><ul>{body.next_checks.map((item) => <li key={item.id}>{item.condition}</li>)}</ul></section> : null}
  </div>;
}

function Evidence({ items }: { items: string[] }) {
  return items.length ? <details><summary>依据</summary><ul>{items.map((item, index) => <li key={index}>{item}</li>)}</ul></details> : null;
}
