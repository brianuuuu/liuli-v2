import { Button, Segmented, Select, Space, Tag } from "antd";
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
import { formatPercent, pnlColor, tooltipBackgroundColor } from "./portfolioFormat";

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

function reviewHeatmapColors(mode: "light" | "dark") {
  return mode === "dark" ? ["#047857", "#1f2937", "#b42318"] : ["#047857", "#f8fafc", "#b42318"];
}

type PerformanceReviewProps = {
  portfolioId: number | null;
  portfolioOptions: { value: number; label: string }[];
  portfoliosLoading: boolean;
  onPortfolioChange: (portfolioId: number | null) => void;
  period: ReviewPeriod;
  onPeriodChange: (period: ReviewPeriod) => void;
};

/** 收益分析：组合整体收益与沪深300 对比。只在切到本子页时挂载，基准行情随之按需拉取。 */
export function PerformanceReview({ portfolioId, portfolioOptions, portfoliosLoading, onPortfolioChange, period, onPeriodChange }: PerformanceReviewProps) {
  const { resolvedMode } = useLiuliTheme();
  const performance = useAsyncData<PortfolioReviewPerformance>(
    useCallback(() => getPortfolioReviewPerformance(portfolioId, period), [portfolioId, period]),
    initialReviewPerformance
  );
  const data = performance.data;
  const summary = data.summary;
  const periodLabel = data.period === "month" ? "当月" : data.period === "all" ? "有效记录以来" : "当年";
  const calendarTitle = data.calendar.granularity === "day" ? "每日盈亏日历" : data.calendar.granularity === "year" ? "年度盈亏年历" : "每月盈亏月历";

  function reviewLineOption(): EChartsOption {
    const textColor = chartTextColor(resolvedMode);
    const gridColor = chartGridColor(resolvedMode);
    const rows = data.curve_points;
    return {
      color: ["#b42318", "#2563eb", "#64748b"],
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

  function reviewCalendarOption(): EChartsOption {
    const textColor = chartTextColor(resolvedMode);
    const gridColor = chartGridColor(resolvedMode);
    const values = data.calendar.items.map((item) => Number(item.return_pct ?? 0));
    const maxValue = Math.max(1, ...values.map((item) => Math.abs(item)));
    const minSlots = data.calendar.granularity === "day" ? 10 : 6;
    const paddedLabels = [
      ...data.calendar.items.map((item) => item.label),
      ...Array.from({ length: Math.max(0, minSlots - data.calendar.items.length) }, () => "")
    ];
    const showValueLabel = data.calendar.items.length <= 12;
    return {
      tooltip: {
        backgroundColor: tooltipBackgroundColor(resolvedMode),
        borderColor: gridColor,
        textStyle: { color: textColor },
        formatter: (params: any) => `${data.calendar.items[Number(params.value?.[0])]?.label ?? "-"}<br/>盈亏率：${formatPercent(Number(params.value?.[2] ?? 0))}`
      },
      // 单行色带：通栏后不需要原来半栏时留的大块上下空白
      grid: { top: 12, left: 56, right: 22, bottom: 72, height: 58 },
      xAxis: {
        type: "category",
        data: paddedLabels,
        axisLabel: { color: textColor, hideOverlap: true },
        axisLine: { lineStyle: { color: gridColor } },
        axisTick: { show: false }
      },
      yAxis: {
        type: "category",
        data: ["盈亏率"],
        axisLabel: { color: textColor },
        axisLine: { show: false },
        axisTick: { show: false }
      },
      visualMap: {
        min: -maxValue,
        max: maxValue,
        orient: "horizontal",
        left: "center",
        bottom: 6,
        inRange: { color: reviewHeatmapColors(resolvedMode) },
        textStyle: { color: textColor }
      },
      series: [
        {
          type: "heatmap",
          data: data.calendar.items.map((item, index) => [index, 0, item.return_pct ?? 0]),
          itemStyle: {
            borderColor: gridColor,
            borderWidth: 1
          },
          label: {
            show: showValueLabel,
            color: textColor,
            formatter: (params: any) => formatPercent(Number(params.value?.[2] ?? 0))
          }
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
      <WorkbenchCard>
        <Space wrap>
          <Select
            style={{ width: 260 }}
            value={portfolioId ?? 0}
            loading={portfoliosLoading}
            options={[{ value: 0, label: "所有组合" }, ...portfolioOptions]}
            onChange={(value) => onPortfolioChange(value === 0 ? null : value)}
          />
          <Segmented
            value={period}
            options={[
              { value: "month", label: "当月" },
              { value: "year", label: "当年" },
              { value: "all", label: "有效记录以来" }
            ]}
            onChange={(value) => onPeriodChange(value as ReviewPeriod)}
          />
          <Button onClick={() => void performance.refresh()} loading={performance.loading}>
            刷新收益
          </Button>
          <Tag>{data.benchmark.name || "沪深300"}</Tag>
          <Tag>{periodLabel}</Tag>
          {data.start_date && data.end_date ? <Tag>{data.start_date} ~ {data.end_date}</Tag> : null}
        </Space>
      </WorkbenchCard>
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
          {data.curve_points.length ? (
            <ChartCard title="收益率曲线对比" option={reviewLineOption()} height={360} />
          ) : (
            <WorkbenchCard title="收益率曲线对比"><EmptyAction description="暂无有效市值快照；任务中心每日 17:00 生成后显示" /></WorkbenchCard>
          )}
          {data.calendar.items.length ? (
            <ChartCard title={`盈亏日历 · ${calendarTitle}`} option={reviewCalendarOption()} height={170} />
          ) : (
            <WorkbenchCard title={`盈亏日历 · ${calendarTitle}`}><EmptyAction description="暂无可用于复盘的盈亏记录" /></WorkbenchCard>
          )}
        </>
      )}
    </div>
  );
}
