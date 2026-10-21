import { Table, Tag, Tooltip, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import type {
  PositionChangeReview as PositionChangeReviewData,
  PositionChangeReviewDetail,
  PositionChangeReviewRow
} from "../../types/api";
import { reasonTypeColors, reasonTypeLabels } from "./positionChangeLabels";
import { SampleCount } from "./SampleCount";

export const initialPositionChangeReview: PositionChangeReviewData = { rules: "", rows: [] };

const actionLabels: Record<string, { label: string; color: string }> = {
  add: { label: "增持", color: "red" },
  reduce: { label: "减持", color: "green" }
};

const verdictLabels: Record<string, { label: string; color: string }> = {
  correct: { label: "对", color: "success" },
  wrong: { label: "错", color: "error" },
  neutral: { label: "平", color: "default" }
};

function pnlColor(value?: number | null) {
  if (!value) return undefined;
  return value > 0 ? "#b42318" : "#047857";
}

function formatReturn(value?: number | null) {
  if (value === null || value === undefined) return <Typography.Text type="secondary">-</Typography.Text>;
  return <span style={{ color: pnlColor(value) }}>{`${(value * 100).toFixed(2)}%`}</span>;
}

/** 金额过万按"万"显示，表格里一眼能比大小 */
function formatAmount(value?: number | null, signed = false) {
  if (value === null || value === undefined) return <Typography.Text type="secondary">-</Typography.Text>;
  const sign = signed && value > 0 ? "+" : "";
  const text = Math.abs(value) >= 10000 ? `${(value / 10000).toFixed(2)}万` : value.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
  return <span style={signed ? { color: pnlColor(value) } : undefined}>{sign}{text}</span>;
}

export function sourceWinRate(rows: PositionChangeReviewRow[], reasonType: string) {
  const matched = rows.filter((row) => row.reason_type === reasonType);
  const samples = matched.reduce((sum, row) => sum + row.samples, 0);
  const correct = matched.reduce((sum, row) => sum + row.correct, 0);
  return { samples, rate: samples ? `${((correct / samples) * 100).toFixed(1)}%` : null };
}

export function positionChangeHint(rules: string) {
  return (
    <>
      效果按方向折算：增持看涨幅，减持看跌幅，正数表示判断有利。
      <br />
      调仓金额 = |股数变化| × 调仓价（手填或按调仓日收盘估算）；20 日影响 = 调仓金额 × 折算后的 20 日收益，是相对"不做这笔调仓"的估算，不是已实现盈亏。
      {rules ? <><br />评估口径：{rules}</> : null}
    </>
  );
}

const impactTitle = <Tooltip title="调仓金额 × 按方向折算的 20 日收益：增持后赚亏、减持后避开或错过的金额（估算）">20日影响</Tooltip>;

const detailColumns: ColumnsType<PositionChangeReviewDetail> = [
  { title: "日期", dataIndex: "change_date", width: 96 },
  {
    title: "标的",
    key: "stock",
    render: (_, row) => (
      <span>
        {row.stock_name || row.stock_code}
        <Typography.Text type="secondary"> {row.stock_code}{row.portfolio_name ? ` · ${row.portfolio_name}` : ""}</Typography.Text>
      </span>
    )
  },
  {
    title: "股数",
    dataIndex: "quantity_delta",
    width: 84,
    align: "right",
    render: (value: number) => <span style={{ color: pnlColor(value) }}>{value > 0 ? "+" : "−"}{Math.abs(value).toLocaleString("zh-CN")}</span>
  },
  {
    title: "成交价",
    dataIndex: "price",
    width: 88,
    align: "right",
    render: (value: number | null | undefined, row) =>
      value === null || value === undefined ? (
        <Typography.Text type="secondary">-</Typography.Text>
      ) : row.price_source === "estimated" ? (
        <Tooltip title="未填成交价，按调仓日收盘价估算">
          <span className="estimated-price">{value}</span>
        </Tooltip>
      ) : (
        value
      )
  },
  { title: "金额", dataIndex: "amount", width: 84, align: "right", render: (value?: number | null) => formatAmount(value) },
  { title: "5日", dataIndex: "effect_5d", width: 72, align: "right", render: formatReturn },
  { title: "20日", dataIndex: "effect_20d", width: 72, align: "right", render: formatReturn },
  { title: "60日", dataIndex: "effect_60d", width: 72, align: "right", render: formatReturn },
  { title: impactTitle, dataIndex: "impact_20d", width: 88, align: "right", render: (value?: number | null) => formatAmount(value, true) },
  {
    title: "对错",
    dataIndex: "verdict",
    width: 56,
    align: "center",
    render: (value?: string | null) =>
      value && verdictLabels[value] ? <Tag color={verdictLabels[value].color}>{verdictLabels[value].label}</Tag> : <Typography.Text type="secondary">-</Typography.Text>
  },
  {
    title: "关联建议",
    dataIndex: "advice_target_trade_date",
    width: 84,
    render: (value?: string | null) => (value ? value.slice(5) : <Typography.Text type="secondary">-</Typography.Text>)
  }
];

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
  { title: "调仓", dataIndex: "change_count", width: 56, align: "right" },
  { title: "标的", dataIndex: "stock_count", width: 56, align: "right" },
  { title: "调仓金额", dataIndex: "amount", width: 92, align: "right", render: (value?: number | null) => formatAmount(value) },
  { title: impactTitle, dataIndex: "impact_20d", width: 92, align: "right", render: (value?: number | null) => formatAmount(value, true) },
  {
    // 胜率按满 20 个交易日的调仓算；5 日效果满 5 日就计入，所以这里为 0 时 5 日列也可能有值
    title: <Tooltip title="已满 20 个交易日、计入胜率的调仓数；5 日效果满 5 个交易日即计入">满20日</Tooltip>,
    dataIndex: "samples",
    width: 72,
    align: "right",
    render: (value: number) => <SampleCount value={value} />
  },
  { title: "对/错/平", key: "split", width: 80, align: "center", render: (_, row) => `${row.correct}/${row.wrong}/${row.neutral}` },
  {
    title: "胜率",
    dataIndex: "win_rate",
    width: 64,
    align: "right",
    render: (value?: number | null) => (value === null || value === undefined ? "-" : `${(value * 100).toFixed(1)}%`)
  },
  { title: "5日", dataIndex: "avg_effect_5d", width: 72, align: "right", render: formatReturn },
  { title: "20日", dataIndex: "avg_effect_20d", width: 72, align: "right", render: formatReturn },
  { title: "60日", dataIndex: "avg_effect_60d", width: 72, align: "right", render: formatReturn }
];

/** 调仓来源对比：按理由来源 × 增减方向汇总，展开看每笔调仓的标的、股数、金额和事后效果 */
export function PositionChangeTable({ data, loading }: { data: PositionChangeReviewData; loading: boolean }) {
  return (
    <Table
      rowKey={(row) => `${row.reason_type}-${row.action}`}
      size="small"
      loading={loading}
      columns={columns}
      dataSource={data.rows}
      pagination={false}
      locale={{ emptyText: "暂无调仓记录" }}
      expandable={{
        expandedRowRender: (row) => (
          <Table
            rowKey="id"
            size="small"
            className="review-detail-table"
            columns={detailColumns}
            dataSource={row.changes}
            pagination={row.changes.length > 10 ? { defaultPageSize: 10, showSizeChanger: false, size: "small" } : false}
          />
        )
      }}
    />
  );
}
