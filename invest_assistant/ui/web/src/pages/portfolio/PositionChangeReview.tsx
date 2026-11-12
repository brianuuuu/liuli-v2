import { Table, Tag, Tooltip, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import type {
  PositionChangeReview as PositionChangeReviewData,
  PositionChangeReviewDetail,
  PositionChangeReviewRow
} from "../../types/api";
import { reasonTypeLabels } from "./positionChangeLabels";
import { positionChangeToDateAmount, summarizePositionChangeAmounts } from "./positionChangeReviewAmounts";
import type { AmountTotal } from "./positionChangeReviewAmounts";

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
  return value > 0 ? "var(--ll-up)" : "var(--ll-down)";
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

function formatTotal(total: AmountTotal, signed = false) {
  return (
    <Tooltip title={total.missing ? `仅汇总有数据的记录，${total.missing} 笔缺少数据，未按 0 计入` : undefined}>
      <span>
        {formatAmount(total.value, signed)}
        {total.missing > 0 ? <small className="position-change-summary-missing">缺{total.missing}笔</small> : null}
      </span>
    </Tooltip>
  );
}

export function sourceWinRate(rows: PositionChangeReviewRow[], reasonType: string) {
  const matched = rows.filter((row) => row.reason_type === reasonType);
  const samples = matched.reduce((sum, row) => sum + row.samples, 0);
  const correct = matched.reduce((sum, row) => sum + row.correct, 0);
  return { samples, rate: samples ? `${((correct / samples) * 100).toFixed(1)}%` : null };
}

export const positionChangeHint = "每笔按自身成交价独立评估：增持看涨幅，减持看跌幅。调仓金额=股数变化绝对值×调仓价；至今金额、20日影响=调仓金额×对应方向收益，不是已实现盈亏。表底汇总筛选范围内全部记录，跨分页累计。";

// 至今收益算到满 60 个交易日为止，与后端 TO_DATE_CAP_DAYS 一致
const TO_DATE_CAP_DAYS = 60;

const impactTitle =<Tooltip title="调仓金额 × 按方向折算的 20 日收益：增持后赚亏、减持后避开或错过的金额（估算）">20日影响</Tooltip>;

// 没满 20 个交易日的调仓：20日、20日影响、对错合成一个空格子，不铺一排横线；"至今"不在其中，刚调完也有数
const EVAL_COLUMNS = 3;
const evalLead = (row: PositionChangeReviewDetail) => ({ colSpan: row.effect_20d == null ? EVAL_COLUMNS : 1 });
const evalRest = (row: PositionChangeReviewDetail) => ({ colSpan: row.effect_20d == null ? 0 : 1 });

const columns: ColumnsType<PositionChangeReviewDetail> = [
  { title: "日期", dataIndex: "change_date", width: 104 },
  {
    // 绝大多数是 AI 建议，一列同色标签没有区分作用：来源用普通文字，只有"未标注"给标签提醒补标
    title: "来源",
    dataIndex: "reason_type",
    width: 150,
    render: (value: string, row) => row.researcher_code
      ? row.researcher_name || row.researcher_code
      : value === "unlabeled" ? <Tag>未标注</Tag> : reasonTypeLabels[value] || value
  },
  {
    title: "标的",
    key: "stock",
    width: 240,
    render: (_, row) => (
      <span className="review-stock">
        {row.stock_name || row.stock_code}
        <small>{row.stock_code}{row.portfolio_name ? ` · ${row.portfolio_name}` : ""}</small>
      </span>
    )
  },
  {
    title: "方向",
    dataIndex: "action",
    width: 64,
    align: "center",
    render: (value: string) => <Tag color={actionLabels[value]?.color}>{actionLabels[value]?.label || value}</Tag>
  },
  {
    // 方向已由标签表达，股数只留正负号、用正文色，不再重复红绿
    title: "股数",
    dataIndex: "quantity_delta",
    width: 88,
    align: "right",
    render: (value: number) => `${value > 0 ? "+" : "−"}${Math.abs(value).toLocaleString("zh-CN")}`
  },
  {
    title: <Tooltip title="灰色为未填成交价、按调仓日收盘价估算">成交价</Tooltip>,
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
  {
    // 同一列里各行算的天数不同，没满 60 日的行标出已过交易日数，才能互相比
    title: <Tooltip title="调仓金额 × 至今效果，单位元；增持看赚亏，减持看避开或错过的金额。按最新收盘计算，当天收盘后可显示 0 日，满 60 个交易日后固定；只作过程参考，不参与对错">至今</Tooltip>,
    dataIndex: "effect_to_date",
    width: 144,
    align: "right",
    render: (_: number | null | undefined, row) => {
      const amount = positionChangeToDateAmount(row);
      return (
        <>
          {formatAmount(amount, true)}
          {amount != null && row.to_date_days != null && row.to_date_days < TO_DATE_CAP_DAYS ? (
            <Typography.Text type="secondary"> · {row.to_date_days}日</Typography.Text>
          ) : null}
        </>
      );
    }
  },
  { title: "5日", dataIndex: "effect_5d", width: 76, align: "right", render: formatReturn },
  {
    title: "20日",
    dataIndex: "effect_20d",
    width: 76,
    align: "right",
    onCell: evalLead,
    render: (value: number | null | undefined) => (value == null ? null : formatReturn(value))
  },
  { title: impactTitle, dataIndex: "impact_20d", width: 92, align: "right", onCell: evalRest, render: (value?: number | null) => formatAmount(value, true) },
  {
    title: <Tooltip title="满 20 个交易日后判定：增持后涨超 1% 或减持后跌超 1% 为对，反向超过 1% 为错，其余为平">对错</Tooltip>,
    dataIndex: "verdict",
    width: 60,
    align: "center",
    onCell: evalRest,
    render: (value?: string | null) =>
      value && verdictLabels[value] ? <Tag color={verdictLabels[value].color}>{verdictLabels[value].label}</Tag> : <Typography.Text type="secondary">-</Typography.Text>
  },
  {
    // 最后一列不定宽，表格多出来的宽度落在这里，不再把标的列撑开、数字挤到右边
    title: "关联建议",
    dataIndex: "advice_target_trade_date",
    render: (value?: string | null) => value ?? <Typography.Text type="secondary">-</Typography.Text>
  }
];

/** 调仓来源对比：逐笔展示每次调仓的来源、标的、股数、金额和事后效果，按日期倒序、每页 10 条 */
export function PositionChangeTable({ data, loading }: { data: PositionChangeReviewData; loading: boolean }) {
  const changes = data.rows
    .flatMap((row) => row.changes)
    .sort((a, b) => b.change_date.localeCompare(a.change_date) || b.id - a.id);
  const totals = summarizePositionChangeAmounts(changes);
  return (
    <Table
      rowKey="id"
      size="small"
      loading={loading}
      columns={columns}
      dataSource={changes}
      pagination={{ defaultPageSize: 10, showSizeChanger: false, hideOnSinglePage: true }}
      locale={{ emptyText: "暂无调仓记录" }}
      summary={() => changes.length ? (
        <Table.Summary>
          <Table.Summary.Row className="position-change-summary">
            <Table.Summary.Cell index={0} colSpan={6}>
              合计 <Typography.Text type="secondary">· {changes.length}笔</Typography.Text>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={6} align="right">{formatTotal(totals.amount)}</Table.Summary.Cell>
            <Table.Summary.Cell index={7} align="right">{formatTotal(totals.toDateAmount, true)}</Table.Summary.Cell>
            <Table.Summary.Cell index={8} />
            <Table.Summary.Cell index={9} />
            <Table.Summary.Cell index={10} align="right">{formatTotal(totals.impact20d, true)}</Table.Summary.Cell>
            <Table.Summary.Cell index={11} colSpan={2} />
          </Table.Summary.Row>
        </Table.Summary>
      ) : null}
    />
  );
}
