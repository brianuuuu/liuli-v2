import { Tag, Tooltip, Typography } from "antd";
import type { TrackCycleView, TrackCycleViews, TrackResearchSource } from "../../types/api";
import { buildCycleCells, scoreSourceText, verificationStatus } from "./trackTrendPresentation";

const directionLabels = { positive: "向好", neutral: "中性", negative: "承压", uncertain: "待验证" };
const directionColors = { positive: "red", neutral: "default", negative: "green", uncertain: "gold" };
const confidenceLabels = { high: "高", medium: "中", low: "低" };

function sourceDescription(source: TrackResearchSource) {
  return `${source.research_date} · 快照 #${source.snapshot_id}${source.report_id ? ` · 报告 #${source.report_id}` : ""}`;
}

export function CycleJudgmentCell({ view }: { view?: TrackCycleView | null }) {
  if (!view) return <Typography.Text type="secondary">未覆盖</Typography.Text>;
  return (
    <Tooltip trigger={["hover", "focus"]} title={<>
      <div>{view.judgment}</div>
      <div>置信度：{confidenceLabels[view.confidence]}</div>
      <div>{sourceDescription(view)}</div>
    </>}>
      <span className="track-research-cell" tabIndex={0}>
        <Tag color={directionColors[view.direction]}>{directionLabels[view.direction]}</Tag>
        <small>{view.research_date}</small>
      </span>
    </Tooltip>
  );
}

export function CycleJudgments({ views }: { views?: TrackCycleViews | null }) {
  return (
    <div className="track-cycle-views">
      {buildCycleCells(views).map((cell) => (
        <div key={cell.cycle}>
          <div className="track-cycle-label">{cell.label} <small>{cell.window}</small></div>
          <CycleJudgmentCell view={cell.view} />
        </div>
      ))}
    </div>
  );
}

/** 始终展示实际评分日期；最新报告未评分时明确标记历史评分。 */
export function ScoreSource({ source, latestSnapshotId }: { source?: TrackResearchSource | null; latestSnapshotId?: number | null }) {
  if (!source) return null;
  return <Tooltip title={`评分来源：${sourceDescription(source)}`}>
    <small className="track-score-source">{scoreSourceText(source, latestSnapshotId)}</small>
  </Tooltip>;
}

export function VerificationDate({ date, note }: { date?: string | null; note?: string | null }) {
  const status = verificationStatus(date);
  if (!status) return null;
  const label = status === "overdue" ? "已到期" : status === "due" ? "今日验证" : "待验证";
  return <Tooltip title={note || "验证事项未填写"}>
    <span className="track-verification-date">
      <Tag color={status === "overdue" ? "orange" : status === "due" ? "gold" : undefined}>{label}</Tag>
      <small>{date}</small>
    </span>
  </Tooltip>;
}
