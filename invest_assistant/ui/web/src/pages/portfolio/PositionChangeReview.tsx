import { Table, Tag, Tooltip, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { WorkbenchCard } from "../../components/common/WorkbenchCard";
import type { PositionChangeReview as PositionChangeReviewData, PositionChangeReviewRow } from "../../types/api";
import { HintTitle } from "./HintTitle";
import { reasonTypeColors, reasonTypeLabels } from "./positionChangeLabels";
import { SampleCount } from "./SampleCount";

export const initialPositionChangeReview: PositionChangeReviewData = { rules: "", rows: [] };

const actionLabels: Record<string, { label: string; color: string }> = {
  add: { label: "增持", color: "red" },
  reduce: { label: "减持", color: "green" }
};

function formatReturn(value?: number | null) {
  if (value === null || value === undefined) return <Typography.Text type="secondary">-</Typography.Text>;
  const color = value > 0 ? "#b42318" : value < 0 ? "#047857" : undefined;
  return <span style={{ color }}>{`${(value * 100).toFixed(2)}%`}</span>;
}

export function sourceWinRate(rows: PositionChangeReviewRow[], reasonType: string) {
  const matched = rows.filter((row) => row.reason_type === reasonType);
  const samples = matched.reduce((sum, row) => sum + row.samples, 0);
  const correct = matched.reduce((sum, row) => sum + row.correct, 0);
  return { samples, rate: samples ? `${((correct / samples) * 100).toFixed(1)}%` : null };
}

/** 调仓来源对比：按理由来源 × 增减方向看实际调仓的事后效果；数据由调仓复盘页统一请求 */
export function PositionChangeReview({ data, loading }: { data: PositionChangeReviewData; loading: boolean }) {
  const columns: ColumnsType<PositionChangeReviewRow> = [
    {
      title: "来源",
      dataIndex: "reason_type",
      render: (value: string) => <Tag color={reasonTypeColors[value]}>{reasonTypeLabels[value] || value}</Tag>
    },
    {
      title: "方向",
      dataIndex: "action",
      width: 64,
      render: (value: string) => <Tag color={actionLabels[value]?.color}>{actionLabels[value]?.label || value}</Tag>
    },
    { title: "调仓", dataIndex: "change_count", width: 52, align: "right" },
    {
      // 胜率按满 20 个交易日的调仓算；5 日效果满 5 日就计入，所以这里为 0 时 5 日列也可能有值
      title: <Tooltip title="已满 20 个交易日、计入胜率的调仓数；5 日效果满 5 个交易日即计入">满20日</Tooltip>,
      dataIndex: "samples",
      width: 68,
      align: "right",
      render: (value: number) => <SampleCount value={value} />
    },
    { title: "对/错/平", key: "split", width: 76, align: "center", render: (_, row) => `${row.correct}/${row.wrong}/${row.neutral}` },
    {
      title: "胜率",
      dataIndex: "win_rate",
      width: 60,
      align: "right",
      render: (value?: number | null) => (value === null || value === undefined ? "-" : `${(value * 100).toFixed(1)}%`)
    },
    { title: "5日", dataIndex: "avg_effect_5d", width: 68, align: "right", render: formatReturn },
    { title: "20日", dataIndex: "avg_effect_20d", width: 68, align: "right", render: formatReturn },
    { title: "60日", dataIndex: "avg_effect_60d", width: 68, align: "right", render: formatReturn }
  ];

  return (
    <WorkbenchCard
      title={
        <HintTitle
          title="调仓来源对比"
          hint={<>效果按方向折算：增持看涨幅，减持看跌幅，正数表示判断有利。{data.rules ? <><br />评估口径：{data.rules}</> : null}</>}
        />
      }
    >
      <Table
        rowKey={(row) => `${row.reason_type}-${row.action}`}
        size="small"
        loading={loading}
        columns={columns}
        dataSource={data.rows}
        pagination={false}
        locale={{ emptyText: "暂无调仓记录" }}
      />
    </WorkbenchCard>
  );
}
