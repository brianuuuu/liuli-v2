import { ReloadOutlined } from "@ant-design/icons";
import { Button, Segmented, Space, Tag, Tooltip } from "antd";
import type { EChartsOption } from "echarts";
import { useCallback } from "react";
import { getPortfolioReviewPerformance } from "../../api/portfolio";
import { useLiuliTheme } from "../../app/theme";
import { ChartCard } from "../../components/charts/ChartCard";
import { chartGridColor, chartTextColor } from "../../components/charts/chartTheme";
import { EmptyAction } from "../../components/common/EmptyAction";
import { WorkbenchCard } from "../../components/common/WorkbenchCard";
import { useAsyncData } from "../../hooks/useAsyncData";
import type { PortfolioReviewPerformance } from "../../types/api";
import { PnlCalendar } from "./PnlCalendar";
import { PortfolioScopeBar } from "./PortfolioScopeBar";
import { formatPercent, pnlColor, tooltipBackgroundColor, upColorForMode } from "./portfolioFormat";

export type ReviewPeriod = "month" | "year" | "all";

const initialReviewPerformance: PortfolioReviewPerformance = {
  scope: "all",
  portfolio_id: null,
  period: "year",
  start_date: "",
  end_date: "",
  portfolio_options: [],
  benchmark: { code: "000300.SH", name: "沪深300" },
  summary: {
    portfolio_return_pct: null,
    benchmark_return_pct: null,
    excess_return_pct: null,
    max_drawdown_pct: null,
    effective_days: 0
  },
  curve_points: [],
  calendar: { granularity: "month", items: [] }
};

type PerformanceReviewProps = {
  portfolioId: number | null;
  portfolioOptions: { value: number; label: string }[];
  onPortfolioChange: (portfolioId: number | null) => void;
  period: ReviewPeriod;
  onPeriodChange: (period: ReviewPeriod) => void;
};

/** 收益分析：组合整体收益与沪深300 对比。只在切到本子页时挂载，基准行情随之按需拉取。 */
export function PerformanceReview({ portfolioId, portfolioOptions, onPortfolioChange, period, onPeriodChange }: PerformanceReviewProps) {
  const { resolvedMode } = useLiuliTheme();
  const performance = useAsyncData<PortfolioReviewPerformance>(
    useCallback(() => getPortfolioReviewPerformance(portfolioId, period), [portfolioId, period]),
    initialReviewPerformance
  );
  const data = performance.data;
  const summary = data.summary;
  const calendarTitle = data.calendar.granularity === "day" ? "每日盈亏日历" : data.calendar.granularity === "year" ? "年度盈亏年历" : "每月盈亏月历";

  function reviewLineOption(): EChartsOption {
    const textColor = chartTextColor(resolvedMode);
    const gridColor = chartGridColor(resolvedMode);
    const rows = data.curve_points;
    return {
      color: [upColorForMode(resolvedMode), "#2563eb", "#64748b"],
      tooltip: {
        trigger: "axis",
        backgroundColor: tooltipBackgroundColor(resolvedMode),
        borderColor: gridColor,
        textStyle: { color: textColor },
        valueFormatter: (value) => formatPercent(Number(value))
      },
      legend: { top: 0, textStyle: { color: textColor } },
      grid: { top: 42, left: 54, right: 18, bottom: 36 },
      xAxis: {
        type: "category",
        data: rows.map((item) => item.date),
        axisLabel: { color: textColor },
        axisLine: { lineStyle: { color: gridColor } },
        axisTick: { show: false }
      },
      yAxis: {
        type: "value",
        axisLabel: { color: textColor, formatter: (value: number) => `${value.toFixed(0)}%` },
        splitLine: { lineStyle: { color: gridColor } }
      },
      series: [
        {
          name: "组合收益率",
          type: "line",
          smooth: true,
          showSymbol: false,
          lineStyle: { width: 3 },
          data: rows.map((item) => item.portfolio_return_pct ?? null)
        },
        {
          name: data.benchmark.name || "沪深300",
          type: "line",
          smooth: true,
          showSymbol: false,
          lineStyle: { width: 2 },
          data: rows.map((item) => item.benchmark_return_pct ?? null)
        },
        {
          name: "超额收益",
          type: "line",
          smooth: true,
          showSymbol: false,
          lineStyle: { width: 2, type: "dashed" },
          data: rows.map((item) => item.excess_return_pct ?? null)
        }
      ]
    };
  }

  const metrics = [
    { label: "组合收益率", value: summary.portfolio_return_pct },
    { label: data.benchmark.name || "沪深300", value: summary.benchmark_return_pct },
    { label: "超额收益", value: summary.excess_return_pct },
    { label: "最大回撤", value: summary.max_drawdown_pct }
  ];

  return (
    <div className="portfolio-dashboard">
      <PortfolioScopeBar
        value={portfolioId}
        options={portfolioOptions}
        onChange={onPortfolioChange}
        extra={(
          <Space size={6}>
            <Tag>{data.benchmark.name || "沪深300"}</Tag>
            {data.start_date && data.end_date ? <Tag>{data.start_date} ~ {data.end_date}</Tag> : null}
            <Tooltip title="刷新收益">
              <Button size="small" type="text" aria-label="刷新收益" icon={<ReloadOutlined />} onClick={() => void performance.refresh()} loading={performance.loading} />
            </Tooltip>
          </Space>
        )}
      >
        <Segmented
          size="small"
          value={period}
          options={[
            { value: "month", label: "当月" },
            { value: "year", label: "当年" },
            { value: "all", label: "有效记录以来" }
          ]}
          onChange={(value) => onPeriodChange(value as ReviewPeriod)}
        />
      </PortfolioScopeBar>
      {performance.error ? (
        <WorkbenchCard title="收益分析">
          <EmptyAction description="收益数据加载失败，基准行情可能暂时不可用" actionText="重试" onAction={() => void performance.refresh()} />
        </WorkbenchCard>
      ) : (
        <>
          <div className="portfolio-summary metric-grid portfolio-review-metrics">
            {metrics.map((item) => (
              <div className="metric-panel" key={item.label}>
                <div className="metric-panel-label">{item.label}</div>
                <div className="metric-panel-value" style={{ color: pnlColor(item.value) }}>{formatPercent(item.value)}</div>
              </div>
            ))}
            <div className="metric-panel"><div className="metric-panel-label">有效记录</div><div className="metric-panel-value">{summary.effective_days}</div></div>
          </div>
          {/* 曲线 2/3、日历 1/3 同一行；窄屏上下排 */}
          <div className="portfolio-performance-grid">
            {data.curve_points.length ? (
              <ChartCard title="收益率曲线对比" option={reviewLineOption()} height={340} />
            ) : (
              <WorkbenchCard title="收益率曲线对比"><EmptyAction description="暂无有效市值快照；任务中心每日 17:00 生成后显示" /></WorkbenchCard>
            )}
            <WorkbenchCard title={`盈亏日历 · ${calendarTitle}`} className="pnl-calendar-card">
              {data.calendar.items.length ? (
                <PnlCalendar granularity={data.calendar.granularity} items={data.calendar.items} />
              ) : (
                <EmptyAction description="暂无可用于复盘的盈亏记录" />
              )}
            </WorkbenchCard>
          </div>
        </>
      )}
    </div>
  );
}
