import { Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useMemo } from "react";
import { getPositionChangeReview } from "../../api/portfolio";
import { WorkbenchCard } from "../../components/common/WorkbenchCard";
import { useAsyncData } from "../../hooks/useAsyncData";
import type { PositionChangeReview as PositionChangeReviewData, PositionChangeReviewRow } from "../../types/api";
import { reasonTypeColors, reasonTypeLabels } from "./positionChangeLabels";

// 与微操复盘同一个门槛：样本不足时胜率只作参考
const MIN_SAMPLES = 10;

const actionLabels: Record<string, { label: string; color: string }> = {
  add: { label: "加仓", color: "red" },
  reduce: { label: "减仓", color: "green" }
};

function formatReturn(value?: number | null) {
  if (value === null || value === undefined) return <Typography.Text type="secondary">-</Typography.Text>;
  const color = value > 0 ? "#b42318" : value < 0 ? "#047857" : undefined;
  return <span style={{ color }}>{`${(value * 100).toFixed(2)}%`}</span>;
}

function sourceWinRate(rows: PositionChangeReviewRow[], reasonType: string) {
  const matched = rows.filter((row) => row.reason_type === reasonType);
  const samples = matched.reduce((sum, row) => sum + row.samples, 0);
  const correct = matched.reduce((sum, row) => sum + row.correct, 0);
  return { samples, text: samples ? `${((correct / samples) * 100).toFixed(1)}%` : "-" };
}

export function PositionChangeReview({ portfolioId }: { portfolioId: number | null }) {
  const review = useAsyncData<PositionChangeReviewData>(
    useCallback(() => getPositionChangeReview(portfolioId), [portfolioId]),
    { rules: "", rows: [] }
  );
  const rows = review.data.rows;
  const aiRate = useMemo(() => sourceWinRate(rows, "ai_advice"), [rows]);
  const personalRate = useMemo(() => sourceWinRate(rows, "personal"), [rows]);

  const columns: ColumnsType<PositionChangeReviewRow> = [
    {
      title: "理由来源",
      dataIndex: "reason_type",
      render: (value: string) => <Tag color={reasonTypeColors[value]}>{reasonTypeLabels[value] || value}</Tag>
    },
    {
      title: "方向",
      dataIndex: "action",
      width: 70,
      render: (value: string) => <Tag color={actionLabels[value]?.color}>{actionLabels[value]?.label || value}</Tag>
    },
    { title: "调仓数", dataIndex: "change_count", width: 80, align: "right" },
    { title: "已评估", dataIndex: "samples", width: 80, align: "right" },
    { title: "对 / 错 / 平", key: "split", width: 110, render: (_, row) => `${row.correct} / ${row.wrong} / ${row.neutral}` },
    {
      title: "20日胜率",
      dataIndex: "win_rate",
      width: 90,
      align: "right",
      render: (value?: number | null) => (value === null || value === undefined ? "-" : `${(value * 100).toFixed(1)}%`)
    },
    { title: "5日效果", dataIndex: "avg_effect_5d", width: 90, align: "right", render: formatReturn },
    { title: "20日效果", dataIndex: "avg_effect_20d", width: 90, align: "right", render: formatReturn },
    { title: "60日效果", dataIndex: "avg_effect_60d", width: 90, align: "right", render: formatReturn }
  ];

  return (
    <WorkbenchCard title="调仓来源对比">
      <div className="portfolio-summary metric-grid portfolio-review-metrics">
        <div className="metric-panel"><div className="metric-panel-label">AI建议 20 日胜率</div><div className="metric-panel-value">{aiRate.text}</div><Typography.Text type="secondary">样本 {aiRate.samples}</Typography.Text></div>
        <div className="metric-panel"><div className="metric-panel-label">个人判断 20 日胜率</div><div className="metric-panel-value">{personalRate.text}</div><Typography.Text type="secondary">样本 {personalRate.samples}</Typography.Text></div>
      </div>
      <Table
        rowKey={(row) => `${row.reason_type}-${row.action}`}
        size="small"
        loading={review.loading}
        columns={columns}
        dataSource={rows}
        pagination={false}
        rowClassName={(row) => (row.samples < MIN_SAMPLES ? "adjust-advice-thin-sample" : "")}
        locale={{ emptyText: "暂无调仓记录" }}
      />
      <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
        效果按方向折算：加仓看涨幅，减仓看跌幅，正数表示判断有利。样本不足 {MIN_SAMPLES} 条的行置灰。{review.data.rules ? `评估口径：${review.data.rules}` : ""}
      </Typography.Paragraph>
    </WorkbenchCard>
  );
}
