import { Table, Tag, Tooltip, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import type {
  PositionChangeReview as PositionChangeReviewData,
  PositionChangeReviewDetail,
  PositionChangeReviewRow
} from "../../types/api";
import { reasonTypeColors, reasonTypeLabels } from "./positionChangeLabels";

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

const columns: ColumnsType<PositionChangeReviewDetail> = [
  { title: "日期", dataIndex: "change_date", width: 104 },
  {
    title: "来源",
    dataIndex: "reason_type",
    width: 96,
    render: (value: string) => <Tag color={reasonTypeColors[value]}>{reasonTypeLabels[value] || value}</Tag>
  },
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
    title: "方向",
    dataIndex: "action",
    width: 64,
    render: (value: string) => <Tag color={actionLabels[value]?.color}>{actionLabels[value]?.label || value}</Tag>
  },
  {
    title: "股数",
    dataIndex: "quantity_delta",
    width: 88,
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
  { title: "金额", dataIndex: "amount", width: 92, align: "right", render: (value?: number | null) => formatAmount(value) },
  { title: "5日", dataIndex: "effect_5d", width: 76, align: "right", render: formatReturn },
  { title: "20日", dataIndex: "effect_20d", width: 76, align: "right", render: formatReturn },
  { title: "60日", dataIndex: "effect_60d", width: 76, align: "right", render: formatReturn },
  { title: impactTitle, dataIndex: "impact_20d", width: 92, align: "right", render: (value?: number | null) => formatAmount(value, true) },
  {
    title: <Tooltip title="满 20 个交易日后判定：增持后涨超 1% 或减持后跌超 1% 为对，反向超过 1% 为错，其余为平">对错</Tooltip>,
    dataIndex: "verdict",
    width: 60,
    align: "center",
    render: (value?: string | null) =>
      value && verdictLabels[value] ? <Tag color={verdictLabels[value].color}>{verdictLabels[value].label}</Tag> : <Typography.Text type="secondary">-</Typography.Text>
  },
  {
    title: "关联建议",
    dataIndex: "advice_target_trade_date",
    width: 88,
    render: (value?: string | null) => (value ? value.slice(5) : <Typography.Text type="secondary">-</Typography.Text>)
  }
];

/** 调仓来源对比：逐笔展示每次调仓的来源、标的、股数、金额和事后效果，按日期倒序、每页 10 条 */
export function PositionChangeTable({ data, loading }: { data: PositionChangeReviewData; loading: boolean }) {
  const changes = data.rows
    .flatMap((row) => row.changes)
    .sort((a, b) => b.change_date.localeCompare(a.change_date) || b.id - a.id);
  return (
    <Table
      rowKey="id"
      size="small"
      loading={loading}
      columns={columns}
      dataSource={changes}
      pagination={{ defaultPageSize: 10, showSizeChanger: false, hideOnSinglePage: true }}
      locale={{ emptyText: "暂无调仓记录" }}
    />
  );
}
