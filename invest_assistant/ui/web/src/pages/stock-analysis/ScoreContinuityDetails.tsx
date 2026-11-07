import { Button, Modal, Space, Spin, Tag } from "antd";
import { useCallback, useState } from "react";
import { getReportContent } from "../../api/reports";
import { MarkdownViewer } from "../../components/common/MarkdownViewer";
import { useAsyncData } from "../../hooks/useAsyncData";
import type { StockScoreSnapshot } from "../../types/api";
import { CHECK_RESULT_LABELS, SCORE_FIELD_LABELS, continuityStatus, scoreDelta } from "../../../../shared/scoreContinuity";
import "../../../../shared/scoreContinuity.css";

export function ScoreContinuityDetails({ score }: { score: StockScoreSnapshot }) {
  const [reportId, setReportId] = useState<number | null>(null);
  const report = useAsyncData(useCallback(() => reportId == null ? Promise.resolve("") : getReportContent(reportId), [reportId]), "");
  const comparison = score.comparison;
  const status = continuityStatus(score);
  const body = score.continuity;
  const reportButton = (id: number | null | undefined, available: boolean | null | undefined, label: string) => id ? (
    <Button size="small" disabled={!available} onClick={() => setReportId(id)}>{available ? label : `${label}缺失`}</Button>
  ) : null;
  return <div className="score-continuity">
    <div className="score-continuity__links">
      {comparison?.status === "recorded" ? <strong>较 {comparison.report_time}　{scoreDelta(comparison.total_delta)}　{comparison.previous_level} → {score.investment_level}</strong> : null}
      {status ? <Tag>{status}</Tag> : null}
      {reportButton(score.report_id, score.report_available, "本次报告")}
      {reportButton(comparison?.report_id, comparison?.report_available, "比较报告")}
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
        <Space wrap><Tag>{CHECK_RESULT_LABELS[item.result] ?? item.result}</Tag>{source?.source_missing ? <Tag>原事项缺失</Tag> : null}{reportButton(source?.report_id, source?.report_available, "来源报告")}</Space>
        <p>{source?.condition ?? item.check_id}</p><p>{item.reason}</p><Evidence items={item.evidence} />
      </div>;
    })}</section> : null}
    {body?.next_checks.length ? <section><h4>后续验证</h4><ul>{body.next_checks.map((item) => <li key={item.id}>{item.condition}</li>)}</ul></section> : null}
    <Modal title="研究报告" open={reportId != null} onCancel={() => setReportId(null)} footer={null} width={900} destroyOnHidden>
      {report.loading ? <Spin /> : report.error ? <Button onClick={() => void report.refresh()}>读取失败，重试</Button> : <MarkdownViewer content={report.data} />}
    </Modal>
  </div>;
}

function Evidence({ items }: { items: string[] }) {
  return items.length ? <details><summary>依据</summary><MarkdownViewer content={items.map((item) => `- ${item}`).join("\n")} /></details> : null;
}
