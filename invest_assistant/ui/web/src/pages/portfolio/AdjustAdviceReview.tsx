import { Space, Switch, Table, Tag, Tooltip, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMemo, useState } from "react";
import { DataPanel } from "../../components/common/DataPanel";
import { HintTitle } from "./HintTitle";
import { SampleCount } from "./SampleCount";
import type { AdjustAdviceItem, AdjustAdviceReport, AdjustAdviceReviews, AdjustAdviceWinRateRow } from "../../types/api";

export const initialAdviceReviews: AdjustAdviceReviews = {
  rules: "",
  summary: { report_count: 0, advice_count: 0, executed_count: 0, tracked_count: 0, pending_count: 0, alert_count: 0 },
  reports: [],
  signal_stats: { by_signal: [], by_category: [] },
  risk_stats: [],
  market_review: { rows: [], stats: [] }
};

const regimeLabels: Record<string, { label: string; color?: string }> = {
  uptrend: { label: "上升", color: "red" },
  range: { label: "震荡" },
  downtrend: { label: "下降", color: "green" }
};

const valueZoneLabels: Record<string, string> = {
  deep_below: "深度偏低",
  below: "偏低",
  around: "中枢附近",
  above: "偏高",
  far_above: "显著偏高"
};

const directionLabels: Record<string, { label: string; color?: string }> = {
  add: { label: "净增持", color: "red" },
  reduce: { label: "净减持", color: "green" },
  hold: { label: "维持" }
};

const actionLabels: Record<string, { label: string; color?: string }> = {
  add: { label: "增持", color: "red" },
  reduce: { label: "减持", color: "green" },
  hold: { label: "维持" },
  wait: { label: "等待" }
};

const verdictLabels: Record<string, { label: string; color?: string }> = {
  correct: { label: "对", color: "success" },
  wrong: { label: "错", color: "error" },
  neutral: { label: "平" }
};

const riskLabels: Record<string, { label: string; color?: string }> = {
  watch: { label: "关注", color: "gold" },
  warning: { label: "警示", color: "orange" },
  severe: { label: "严重", color: "red" }
};

const executionLabels: Record<string, string> = { executed: "已执行", partial: "部分执行", not_executed: "未执行" };
const triggerLabels: Record<string, string> = { touched: "触及", not_touched: "未触及" };

const signalLabels: Record<string, string> = {
  below_value_center: "中枢下方",
  above_value_center: "中枢上方",
  value_rank_mismatch: "排序错配",
  concentration_risk: "集中度",
  cash_rebalance: "现金再平衡",
  value_impairment_risk: "价值受损",
  pullback_support: "回落承接",
  overextension: "上涨透支",
  sentiment_extreme: "舆情极端",
  unknown: "未标注"
};

const riskCodeLabels: Record<string, string> = {
  kline_breakdown: "K线破位",
  value_trend_down: "年线向下",
  relative_weakness: "相对走弱",
  volatility_spike: "波动放大",
  negative_sentiment: "负面舆情",
  fundamental_deterioration: "基本面恶化",
  regulatory_legal: "监管诉讼",
  shareholder_action: "股东行为",
  event_window: "事件窗口",
  unknown: "未标注"
};

/** 没有样本时返回 null，由展示层写"待积累"，不和真实的 0% 混在一起 */
function ratio(numerator: number, denominator: number) {
  return denominator ? `${((numerator / denominator) * 100).toFixed(1)}%` : null;
}

function formatReturn(value?: number | null) {
  if (value === null || value === undefined) return <Typography.Text type="secondary">-</Typography.Text>;
  const color = value > 0 ? "var(--ll-up)" : value < 0 ? "var(--ll-down)" : undefined;
  return <span style={{ color }}>{`${(value * 100).toFixed(2)}%`}</span>;
}

function labelTag(map: Record<string, { label: string; color?: string }>, value?: string | null) {
  if (!value || !map[value]) return <Typography.Text type="secondary">-</Typography.Text>;
  return <Tag color={map[value].color}>{map[value].label}</Tag>;
}

function actionWinRate(rows: AdjustAdviceWinRateRow[], action: string) {
  const matched = rows.filter((row) => row.action === action);
  const samples = matched.reduce((sum, row) => sum + row.samples, 0);
  const correct = matched.reduce((sum, row) => sum + row.correct, 0);
  return { samples, rate: ratio(correct, samples) };
}

function hasSignal(item: AdjustAdviceItem) {
  return item.action === "add" || item.action === "reduce" || item.risk_level === "warning" || item.risk_level === "severe";
}

/** 微操建议的汇总指标：调仓复盘页顶部指标条用 */
export function adviceKpis(data: AdjustAdviceReviews) {
  const riskSamples = data.risk_stats.reduce((sum, row) => sum + row.samples, 0);
  const riskHits = data.risk_stats.reduce((sum, row) => sum + row.hits, 0);
  return {
    addRate: actionWinRate(data.signal_stats.by_signal, "add"),
    reduceRate: actionWinRate(data.signal_stats.by_signal, "reduce"),
    executed: { rate: ratio(data.summary.executed_count, data.summary.tracked_count), note: `${data.summary.executed_count} / ${data.summary.tracked_count}` },
    risk: { rate: ratio(riskHits, riskSamples), samples: riskSamples },
    pending: { count: data.summary.pending_count, total: data.summary.advice_count },
    market: marketWinRate(data)
  };
}

function marketWinRate(data: AdjustAdviceReviews) {
  const samples = data.market_review.stats.reduce((sum, row) => sum + row.samples, 0);
  const correct = data.market_review.stats.reduce((sum, row) => sum + row.correct, 0);
  return { samples, rate: ratio(correct, samples) };
}

function formatRatio(value?: number | null) {
  return value === null || value === undefined ? "-" : `${Math.round(value * 100)}%`;
}

export const marketReviewHint =
  "研究员按沪深300 的中枢位置、年线方向和系统性风险给出目标股票仓位区间与整体方向；净增持后沪深300 20 日涨超 1%、净减持后跌超 1% 为对，连续多份同一方向只算第一份（灰色行未计入）。";

/** 大盘判断：逐份报告列出状态、区间、方向与沪深300 之后的表现，表头下方按状态 × 方向汇总胜率 */
export function MarketReviewTable({ data }: { data: AdjustAdviceReviews }) {
  const { rows, stats } = data.market_review;
  return (
    <>
      <Table
        rowKey="advice_id"
        size="small"
        rowClassName={(row) => (row.counted || !row.position_direction || row.position_direction === "hold" ? "" : "market-review-uncounted")}
        dataSource={rows}
        pagination={{ defaultPageSize: 10, showSizeChanger: false, hideOnSinglePage: true }}
        locale={{ emptyText: "暂无大盘判断；新格式的微操报告导入后显示" }}
        scroll={{ x: 980 }}
        columns={[
          { title: "适用交易日", dataIndex: "target_trade_date", width: 108 },
          { title: "大盘状态", dataIndex: "market_regime", width: 88, render: (value) => labelTag(regimeLabels, value) },
          { title: "系统风险", dataIndex: "market_risk", width: 88, render: (value) => (value && value !== "none" ? labelTag(riskLabels, value) : "-") },
          { title: "沪深300位置", dataIndex: "value_zone", width: 100, render: (value?: string | null) => (value ? valueZoneLabels[value] || value : "-") },
          {
            title: "目标区间",
            key: "target",
            width: 96,
            render: (_, row) => (row.target_stock_ratio_low == null ? "-" : `${formatRatio(row.target_stock_ratio_low)}—${formatRatio(row.target_stock_ratio_high)}`)
          },
          {
            title: <Tooltip title="报告给出的调整前 → 调整后股票仓位（计划值）">股票仓位</Tooltip>,
            key: "ratio",
            width: 104,
            render: (_, row) => (row.stock_ratio_before == null ? "-" : `${formatRatio(row.stock_ratio_before)} → ${formatRatio(row.stock_ratio_after)}`)
          },
          { title: "方向", dataIndex: "position_direction", width: 80, render: (value) => labelTag(directionLabels, value) },
          { title: "沪深300 5日", dataIndex: "index_return_5d", width: 96, align: "right", render: formatReturn },
          { title: "20日", dataIndex: "index_return_20d", width: 80, align: "right", render: formatReturn },
          { title: "60日", dataIndex: "index_return_60d", width: 80, align: "right", render: formatReturn },
          { title: "对错", dataIndex: "verdict", width: 64, align: "center", render: (value) => labelTag(verdictLabels, value) }
        ]}
      />
      {stats.length ? (
        <div className="market-review-stats">
          {stats.map((row) => (
            <span key={`${row.market_regime}-${row.direction}`}>
              {regimeLabels[row.market_regime]?.label || "未标注"} · {directionLabels[row.direction]?.label}：
              <b>{(row.win_rate * 100).toFixed(1)}%</b>（<SampleCount value={row.samples} /> 次）
            </span>
          ))}
        </div>
      ) : null}
    </>
  );
}

/** 还没跑过评估（触及、执行、收益都为空）：评估列合成一格说明，不铺一排横线 */
function notEvaluated(item: AdjustAdviceItem) {
  return item.trigger_status == null && item.execution_status == null && item.return_5d == null && item.verdict == null;
}

const EVAL_COLUMNS = 6;
// 评估列合并：第一列占满 6 格写说明，其余 5 列让出位置
const evalLead = (row: AdjustAdviceItem) => ({ colSpan: notEvaluated(row) ? EVAL_COLUMNS : 1 });
const evalRest = (row: AdjustAdviceItem) => ({ colSpan: notEvaluated(row) ? 0 : 1 });

// 口径说明挂在"对错"表头上：标题栏去掉后，它就近解释对错怎么判
const buildItemColumns = (rules: string): ColumnsType<AdjustAdviceItem> => [
  {
    title: "标的",
    key: "stock",
    width: 150,
    render: (_, row) => (
      <span className="advice-stock">
        {row.stock_name}
        <small>{row.stock_code}</small>
      </span>
    )
  },
  { title: "方向", dataIndex: "action", width: 64, align: "center", render: (value: string) => labelTag(actionLabels, value) },
  { title: "推荐", dataIndex: "rating", width: 90, align: "center", render: (value?: number | null) => (value ? <span className="advice-rating">{"★".repeat(value) + "☆".repeat(5 - value)}</span> : "-") },
  { title: "数量", dataIndex: "quantity", width: 72, align: "right", render: (value?: number | null) => (value ?? "-") },
  {
    title: "价格区间",
    key: "price",
    width: 120,
    align: "right",
    render: (_, row) => (row.price_low !== null && row.price_low !== undefined ? `${row.price_low} — ${row.price_high}` : "-")
  },
  {
    title: "触及",
    dataIndex: "trigger_status",
    width: 64,
    align: "center",
    onCell: evalLead,
    render: (value: string | null | undefined, row) =>
      notEvaluated(row) ? (
        <span className="advice-eval-pending">{row.action === "add" || row.action === "reduce" ? "待评估 · T+20 判定对错" : "维持、等待不评估"}</span>
      ) : (
        (value && triggerLabels[value]) || "-"
      )
  },
  { title: "执行", dataIndex: "execution_status", width: 76, align: "center", onCell: evalRest, render: (value?: string | null) => (value && executionLabels[value]) || "-" },
  { title: "5日", dataIndex: "return_5d", width: 76, align: "right", onCell: evalRest, render: formatReturn },
  { title: "20日", dataIndex: "return_20d", width: 76, align: "right", onCell: evalRest, render: formatReturn },
  { title: "60日", dataIndex: "return_60d", width: 76, align: "right", onCell: evalRest, render: formatReturn },
  {
    title: rules ? <HintTitle title="对错" hint={`评估口径：${rules}`} /> : "对错",
    dataIndex: "verdict",
    width: 72,
    align: "center",
    onCell: evalRest,
    render: (value?: string | null) => labelTag(verdictLabels, value)
  },
  {
    title: "风险",
    key: "risk",
    width: 100,
    align: "center",
    render: (_, row) =>
      riskLabels[row.risk_level] ? (
        <Tooltip title={row.risk_summary || undefined}>
          <Space size={4}>
            {labelTag(riskLabels, row.risk_level)}
            {row.risk_verdict ? <Typography.Text type="secondary">{row.risk_verdict === "hit" ? "命中" : "未中"}</Typography.Text> : null}
          </Space>
        </Tooltip>
      ) : (
        <Typography.Text type="secondary">-</Typography.Text>
      )
  },
  {
    title: "核心逻辑",
    dataIndex: "core_logic",
    render: (value?: string | null, row?: AdjustAdviceItem) => (
      <Tooltip title={row?.history_note ? `历史：${row.history_note}` : undefined}>
        <Typography.Paragraph style={{ marginBottom: 0 }} ellipsis={{ rows: 2, expandable: true, symbol: "展开" }}>
          {value || "-"}
        </Typography.Paragraph>
      </Tooltip>
    )
  }
];

// "显示更多"开关放在本表表头最右端（连续性说明列），控制展开明细是否列出维持、等待
const buildReportColumns = (showQuiet: boolean, onShowQuietChange: (value: boolean) => void): ColumnsType<AdjustAdviceReport> => [
  { title: "适用交易日", dataIndex: "target_trade_date", width: 116 },
  { title: "日K截止", dataIndex: "data_as_of_date", width: 116 },
  {
    title: "微操机会",
    dataIndex: "has_opportunity",
    width: 88,
    align: "center",
    // 三种状态同宽，列内上下对齐；只有"有"带底色
    render: (value?: boolean | null) =>
      value === true ? <span className="opportunity-badge is-yes">有</span>
        : value === false ? <span className="opportunity-badge is-no">无</span>
          : <span className="opportunity-badge is-no">待定</span>
  },
  { title: "调整", key: "advice", width: 64, align: "right", render: (_, row) => row.items.filter((item) => item.action === "add" || item.action === "reduce").length },
  { title: "警示", key: "alert", width: 64, align: "right", render: (_, row) => row.items.filter((item) => item.risk_level === "warning" || item.risk_level === "severe").length },
  { title: "持仓数", key: "count", width: 72, align: "right", render: (_, row) => row.items.length },
  {
    title: (
      <span className="report-note-head">
        <span>连续性说明</span>
        <Tooltip title="展开明细时也列出维持、等待的持仓">
          <span className="report-note-toggle">
            显示更多
            <Switch size="small" checked={showQuiet} onChange={onShowQuietChange} />
          </span>
        </Tooltip>
      </span>
    ),
    dataIndex: "continuity_note",
    ellipsis: { showTitle: false },
    // 次要信息用次要文字色，别比方向、数量更抢眼
    render: (value?: string | null) => <Typography.Text type="secondary">{value || "-"}</Typography.Text>
  }
];

const winRateColumns: ColumnsType<AdjustAdviceWinRateRow> = [
  { title: "方向", dataIndex: "action", width: 64, align: "center", render: (value: string) => labelTag(actionLabels, value) },
  { title: "主信号", dataIndex: "signal_code", render: (value: string) => signalLabels[value] || value },
  { title: "样本", dataIndex: "samples", width: 56, align: "right", render: (value: number) => <SampleCount value={value} /> },
  { title: "对/错/平", key: "split", width: 82, align: "center", render: (_, row) => `${row.correct}/${row.wrong}/${row.neutral}` },
  { title: "胜率", key: "win_rate", width: 64, align: "right", render: (_, row) => `${(row.win_rate * 100).toFixed(1)}%` },
  { title: "平均效果", dataIndex: "avg_effect_20d", width: 80, align: "right", render: formatReturn }
];

/** 微操报告：逐期明细，展开看每只持仓的建议与事后评估。放在数据面板里，表格样式与调仓来源表一致 */
export function AdviceReportList({ data, loading }: { data: AdjustAdviceReviews; loading: boolean }) {
  const [showQuiet, setShowQuiet] = useState(false);
  const itemColumns = useMemo(() => buildItemColumns(data.rules), [data.rules]);
  const reportColumns = useMemo(() => buildReportColumns(showQuiet, setShowQuiet), [showQuiet]);
  return (
    <DataPanel>
      <Table
        rowKey="id"
        size="small"
        className="advice-report-table"
        loading={loading}
        columns={reportColumns}
        dataSource={data.reports}
        pagination={{ defaultPageSize: 10, showSizeChanger: false }}
        locale={{ emptyText: "暂无微操报告；研究回流导入「微操报告」后显示" }}
        expandable={{
          expandedRowRender: (report) => (
            <Table
              rowKey="id"
              size="small"
              className="advice-item-table"
              columns={itemColumns}
              dataSource={showQuiet ? report.items : report.items.filter(hasSignal)}
              pagination={false}
              scroll={{ x: 1300 }}
              locale={{ emptyText: "本期没有调仓建议和风险警示" }}
            />
          )
        }}
      />
    </DataPanel>
  );
}

/** 还没有评估结果时的空态：说清为什么空、什么时候会有 */
function pendingText(data: AdjustAdviceReviews, what: string) {
  return data.summary.pending_count
    ? `暂无已评估的${what}；${data.summary.pending_count} 条建议等待满 20 个交易日后评估`
    : `暂无已评估的${what}`;
}

export const signalStatsHint = "按方向 + 主信号统计 20 日胜率；只统计价格触及区间的建议，连续多日同方向未执行只算一次。评估任务工作日 19:15 运行。";
export const riskStatsHint = "warning 及以上的警示，20 日跑输沪深300 超过 3% 计为命中。";

export function SignalStatsTable({ data }: { data: AdjustAdviceReviews }) {
  return (
    <Table
      rowKey={(row) => `${row.action}-${row.signal_code}`}
      size="small"
      columns={winRateColumns}
      dataSource={data.signal_stats.by_signal}
      pagination={false}
      locale={{ emptyText: pendingText(data, "调仓建议") }}
    />
  );
}

export function RiskStatsTable({ data }: { data: AdjustAdviceReviews }) {
  return (
    <Table
      rowKey="risk_code"
      size="small"
      columns={[
        { title: "风险代码", dataIndex: "risk_code", render: (value: string) => riskCodeLabels[value] || value },
        { title: "样本", dataIndex: "samples", width: 72, align: "right", render: (value: number) => <SampleCount value={value} /> },
        { title: "命中", dataIndex: "hits", width: 72, align: "right" },
        { title: "命中率", dataIndex: "hit_rate", width: 88, align: "right", render: (value: number) => `${(value * 100).toFixed(1)}%` }
      ]}
      dataSource={data.risk_stats}
      pagination={false}
      locale={{ emptyText: pendingText(data, "风险警示") }}
    />
  );
}
