import { Space, Switch, Table, Tag, Tooltip, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useMemo, useState } from "react";
import { getAdjustAdviceReviews } from "../../api/portfolio";
import { EmptyAction } from "../../components/common/EmptyAction";
import { WorkbenchCard } from "../../components/common/WorkbenchCard";
import { useAsyncData } from "../../hooks/useAsyncData";
import type { AdjustAdviceItem, AdjustAdviceReport, AdjustAdviceReviews, AdjustAdviceWinRateRow } from "../../types/api";

// 样本少于这个数时胜率只作参考，与 portfolio_001 profile 的历史校准门槛一致
const MIN_SAMPLES = 10;

const initialReviews: AdjustAdviceReviews = {
  rules: "",
  summary: { report_count: 0, advice_count: 0, executed_count: 0, tracked_count: 0, pending_count: 0, alert_count: 0 },
  reports: [],
  signal_stats: { by_signal: [], by_category: [] },
  risk_stats: []
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

function ratio(numerator: number, denominator: number) {
  return denominator ? `${((numerator / denominator) * 100).toFixed(1)}%` : "-";
}

function formatReturn(value?: number | null) {
  if (value === null || value === undefined) return <Typography.Text type="secondary">-</Typography.Text>;
  const color = value > 0 ? "#b42318" : value < 0 ? "#047857" : undefined;
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
  return { samples, text: ratio(correct, samples) };
}

function hasSignal(item: AdjustAdviceItem) {
  return item.action === "add" || item.action === "reduce" || item.risk_level === "warning" || item.risk_level === "severe";
}

export function AdjustAdviceReview({ portfolioId }: { portfolioId: number | null }) {
  const [showQuiet, setShowQuiet] = useState(false);
  const reviews = useAsyncData<AdjustAdviceReviews>(
    useCallback(() => getAdjustAdviceReviews(portfolioId, 30), [portfolioId]),
    initialReviews
  );
  const data = reviews.data;
  const summary = data.summary;
  const addRate = useMemo(() => actionWinRate(data.signal_stats.by_signal, "add"), [data]);
  const reduceRate = useMemo(() => actionWinRate(data.signal_stats.by_signal, "reduce"), [data]);
  const riskSamples = data.risk_stats.reduce((sum, row) => sum + row.samples, 0);
  const riskHits = data.risk_stats.reduce((sum, row) => sum + row.hits, 0);

  const itemColumns: ColumnsType<AdjustAdviceItem> = [
    { title: "标的", key: "stock", width: 120, render: (_, row) => <span>{row.stock_name}<Typography.Text type="secondary"> {row.stock_code}</Typography.Text></span> },
    { title: "方向", dataIndex: "action", width: 70, render: (value: string) => labelTag(actionLabels, value) },
    { title: "推荐", dataIndex: "rating", width: 90, render: (value?: number | null) => (value ? "★".repeat(value) + "☆".repeat(5 - value) : "-") },
    { title: "数量", dataIndex: "quantity", width: 80, align: "right", render: (value?: number | null) => (value ?? "-") },
    {
      title: "价格区间",
      key: "price",
      width: 120,
      render: (_, row) => (row.price_low !== null && row.price_low !== undefined ? `${row.price_low} — ${row.price_high}` : "-")
    },
    { title: "触及", dataIndex: "trigger_status", width: 70, render: (value?: string | null) => (value && triggerLabels[value]) || "-" },
    { title: "执行", dataIndex: "execution_status", width: 80, render: (value?: string | null) => (value && executionLabels[value]) || "-" },
    { title: "5日", dataIndex: "return_5d", width: 76, align: "right", render: formatReturn },
    { title: "20日", dataIndex: "return_20d", width: 76, align: "right", render: formatReturn },
    { title: "60日", dataIndex: "return_60d", width: 76, align: "right", render: formatReturn },
    { title: "对错", dataIndex: "verdict", width: 60, render: (value?: string | null) => labelTag(verdictLabels, value) },
    {
      title: "风险",
      key: "risk",
      width: 110,
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

  const reportColumns: ColumnsType<AdjustAdviceReport> = [
    { title: "适用交易日", dataIndex: "target_trade_date", width: 120 },
    { title: "日K截止", dataIndex: "data_as_of_date", width: 120 },
    {
      title: "微操机会",
      dataIndex: "has_opportunity",
      width: 100,
      render: (value?: boolean | null) => (value === true ? <Tag color="blue">有</Tag> : value === false ? "无" : "暂无法判断")
    },
    { title: "调整", key: "advice", width: 80, render: (_, row) => row.items.filter((item) => item.action === "add" || item.action === "reduce").length },
    { title: "警示", key: "alert", width: 80, render: (_, row) => row.items.filter((item) => item.risk_level === "warning" || item.risk_level === "severe").length },
    { title: "持仓数", key: "count", width: 80, render: (_, row) => row.items.length },
    { title: "连续性说明", dataIndex: "continuity_note", ellipsis: true, render: (value?: string | null) => value || "-" }
  ];

  const winRateColumns: ColumnsType<AdjustAdviceWinRateRow> = [
    { title: "方向", dataIndex: "action", width: 70, render: (value: string) => labelTag(actionLabels, value) },
    { title: "主信号", dataIndex: "signal_code", render: (value: string) => signalLabels[value] || value },
    { title: "样本", dataIndex: "samples", width: 70, align: "right" },
    { title: "对 / 错 / 平", key: "split", width: 110, render: (_, row) => `${row.correct} / ${row.wrong} / ${row.neutral}` },
    { title: "胜率", key: "win_rate", width: 80, align: "right", render: (_, row) => `${(row.win_rate * 100).toFixed(1)}%` },
    { title: "平均效果", dataIndex: "avg_effect_20d", width: 90, align: "right", render: formatReturn }
  ];

  return (
    <div className="adjust-advice-review">
      <WorkbenchCard
        title="微操复盘"
        extra={
          <Space>
            <Typography.Text type="secondary">显示维持和等待</Typography.Text>
            <Switch size="small" checked={showQuiet} onChange={setShowQuiet} />
          </Space>
        }
      >
        <div className="portfolio-summary metric-grid portfolio-review-metrics">
          <div className="metric-panel"><div className="metric-panel-label">增持 20 日胜率</div><div className="metric-panel-value">{addRate.text}</div><Typography.Text type="secondary">样本 {addRate.samples}</Typography.Text></div>
          <div className="metric-panel"><div className="metric-panel-label">减持 20 日胜率</div><div className="metric-panel-value">{reduceRate.text}</div><Typography.Text type="secondary">样本 {reduceRate.samples}</Typography.Text></div>
          <div className="metric-panel"><div className="metric-panel-label">建议执行率</div><div className="metric-panel-value">{ratio(summary.executed_count, summary.tracked_count)}</div><Typography.Text type="secondary">{summary.executed_count} / {summary.tracked_count}</Typography.Text></div>
          <div className="metric-panel"><div className="metric-panel-label">警示命中率</div><div className="metric-panel-value">{ratio(riskHits, riskSamples)}</div><Typography.Text type="secondary">样本 {riskSamples}</Typography.Text></div>
          <div className="metric-panel"><div className="metric-panel-label">待评估建议</div><div className="metric-panel-value">{summary.pending_count}</div><Typography.Text type="secondary">共 {summary.advice_count} 条调仓建议</Typography.Text></div>
        </div>
        {data.reports.length ? (
          <Table
            rowKey="id"
            size="small"
            loading={reviews.loading}
            columns={reportColumns}
            dataSource={data.reports}
            pagination={{ pageSize: 10, showSizeChanger: false }}
            expandable={{
              expandedRowRender: (report) => (
                <Table
                  rowKey="id"
                  size="small"
                  columns={itemColumns}
                  dataSource={showQuiet ? report.items : report.items.filter(hasSignal)}
                  pagination={false}
                  scroll={{ x: 1300 }}
                  locale={{ emptyText: "本期没有调仓建议和风险警示" }}
                />
              )
            }}
          />
        ) : (
          <EmptyAction description="暂无微操报告；研究回流导入「微操报告」后显示" />
        )}
        {data.rules ? <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>评估口径：{data.rules}</Typography.Paragraph> : null}
      </WorkbenchCard>
      <div className="portfolio-overview-grid">
        <WorkbenchCard title="信号表现 · 方向 + 主信号">
          <Table
            rowKey={(row) => `${row.action}-${row.signal_code}`}
            size="small"
            columns={winRateColumns}
            dataSource={data.signal_stats.by_signal}
            pagination={false}
            rowClassName={(row) => (row.samples < MIN_SAMPLES ? "adjust-advice-thin-sample" : "")}
            locale={{ emptyText: "暂无已评估的调仓建议" }}
          />
          <Typography.Text type="secondary">样本不足 {MIN_SAMPLES} 条的行置灰，胜率仅供参考。</Typography.Text>
        </WorkbenchCard>
        <WorkbenchCard title="风险警示命中率">
          <Table
            rowKey="risk_code"
            size="small"
            columns={[
              { title: "风险代码", dataIndex: "risk_code", render: (value: string) => riskCodeLabels[value] || value },
              { title: "样本", dataIndex: "samples", width: 70, align: "right" },
              { title: "命中", dataIndex: "hits", width: 70, align: "right" },
              { title: "命中率", dataIndex: "hit_rate", width: 90, align: "right", render: (value: number) => `${(value * 100).toFixed(1)}%` }
            ]}
            dataSource={data.risk_stats}
            pagination={false}
            locale={{ emptyText: "暂无已评估的风险警示" }}
          />
          <Typography.Text type="secondary">警示后 20 日跑输沪深300 超过 3% 计为命中。</Typography.Text>
        </WorkbenchCard>
      </div>
    </div>
  );
}
