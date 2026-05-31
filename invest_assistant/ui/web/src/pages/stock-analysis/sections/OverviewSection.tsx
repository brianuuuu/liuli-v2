import {
  AlertOutlined,
  BarChartOutlined,
  CheckCircleOutlined,
  TrophyOutlined
} from "@ant-design/icons";
import { Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { EChartsOption } from "echarts";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { getStockDashboard } from "../../../api/stockAnalysis";
import { useLiuliTheme } from "../../../app/theme";
import { ChartCard } from "../../../components/charts/ChartCard";
import { chartGridColor, chartTextColor } from "../../../components/charts/chartTheme";
import { EmptyAction } from "../../../components/common/EmptyAction";
import { WorkbenchCard } from "../../../components/common/WorkbenchCard";
import { useAsyncData } from "../../../hooks/useAsyncData";
import type {
  StockDashboardLatestValuation,
  StockDashboardScoreRanking
} from "../../../types/api";
import { StatusTag } from "./shared";

function formatScore(value?: number | null) {
  return value == null ? "-" : Number(value).toFixed(1);
}

function formatNumber(value?: number | null) {
  return value == null ? "-" : Number(value).toFixed(1);
}

function formatPercent(value?: number | null) {
  return value == null ? "-" : `${(Number(value) * 100).toFixed(1)}%`;
}

function stockLabel(record: { stock_name?: string | null; stock_code?: string | null; stock_id: number }) {
  return record.stock_name || record.stock_code || `Stock ${record.stock_id}`;
}

export function OverviewSection() {
  const [selectedStockId, setSelectedStockId] = useState<number | null>(null);
  const dashboard = useAsyncData(useCallback(() => getStockDashboard(selectedStockId), [selectedStockId]), {
    summary: { pool_count: 0, focused_count: 0, pending_materials_count: 0, top_score_stock: null },
    score_trends: [],
    valuation_trends: [],
    score_rankings: [],
    latest_valuations: [],
    focus_stocks: [],
    latest_materials: [],
    pending_materials: [],
    default_stock_id: null,
    selected_stock_summary: null
  });
  const { resolvedMode } = useLiuliTheme();

  useEffect(() => {
    if (!selectedStockId && dashboard.data.default_stock_id) {
      setSelectedStockId(dashboard.data.default_stock_id);
    }
  }, [dashboard.data.default_stock_id, selectedStockId]);

  const trendOption = useMemo<EChartsOption>(() => {
    const textColor = chartTextColor(resolvedMode);
    const gridColor = chartGridColor(resolvedMode);
    const dates = Array.from(
      new Set(dashboard.data.score_trends.flatMap((trend) => trend.points.map((point) => point.score_date)))
    ).sort();
    return {
      tooltip: { trigger: "axis" },
      legend: {
        bottom: 0,
        left: 0,
        right: 0,
        itemGap: 14,
        textStyle: { color: textColor }
      },
      grid: { top: 18, left: 42, right: 18, bottom: 82 },
      xAxis: {
        type: "category",
        boundaryGap: false,
        axisLabel: { color: textColor },
        axisLine: { lineStyle: { color: gridColor } },
        data: dates
      },
      yAxis: {
        type: "value",
        min: 0,
        axisLabel: { color: textColor },
        splitLine: { lineStyle: { color: gridColor } }
      },
      series: dashboard.data.score_trends.map((trend) => {
        const pointByDate = new Map(trend.points.map((point) => [point.score_date, point.total_score]));
        return {
          name: trend.stock_name || trend.stock_code || `Stock ${trend.stock_id}`,
          type: "line",
          smooth: true,
          showSymbol: false,
          data: dates.map((date) => pointByDate.get(date) ?? null)
        };
      })
    };
  }, [dashboard.data.score_trends, resolvedMode]);

  const valuationTrendOption = useMemo<EChartsOption>(() => {
    const textColor = chartTextColor(resolvedMode);
    const gridColor = chartGridColor(resolvedMode);
    const dates = Array.from(
      new Set(dashboard.data.valuation_trends.flatMap((trend) => trend.points.map((point) => point.analysis_date)))
    ).sort();
    return {
      tooltip: { trigger: "axis" },
      legend: {
        bottom: 0,
        left: 0,
        right: 0,
        itemGap: 14,
        textStyle: { color: textColor }
      },
      grid: { top: 18, left: 46, right: 18, bottom: 82 },
      xAxis: {
        type: "category",
        boundaryGap: false,
        axisLabel: { color: textColor },
        axisLine: { lineStyle: { color: gridColor } },
        data: dates
      },
      yAxis: {
        type: "value",
        axisLabel: { color: textColor, formatter: (value: number) => `${value}%` },
        splitLine: { lineStyle: { color: gridColor } }
      },
      series: dashboard.data.valuation_trends.map((trend) => {
        const pointByDate = new Map(trend.points.map((point) => [point.analysis_date, point.expectation_gap_rate]));
        return {
          name: trend.stock_name || trend.stock_code || `Stock ${trend.stock_id}`,
          type: "line",
          smooth: true,
          showSymbol: false,
          data: dates.map((date) => {
            const value = pointByDate.get(date);
            return value == null ? null : Number(value) * 100;
          })
        };
      })
    };
  }, [dashboard.data.valuation_trends, resolvedMode]);

  const rankingColumns: ColumnsType<StockDashboardScoreRanking> = [
    { title: "排名", dataIndex: "rank", width: 58 },
    {
      title: "标的",
      dataIndex: "stock_name",
      ellipsis: true,
      render: (_, record) => (
        <Link to={`/stock-analysis/stocks/${record.stock_id}`} className="stock-dashboard-target-link">
          {stockLabel(record)}
        </Link>
      )
    },
    { title: "状态", dataIndex: "status", width: 86, render: (value) => <StatusTag status={value} /> },
    { title: "总分", dataIndex: "total_score", width: 76, render: (value) => <strong>{formatScore(value)}</strong> },
    { title: "评分日", dataIndex: "score_date", width: 104, render: (value) => value || "-" }
  ];

  const valuationColumns: ColumnsType<StockDashboardLatestValuation> = [
    {
      title: "标的",
      dataIndex: "stock_name",
      ellipsis: true,
      render: (_, record) => (
        <Link to={`/stock-analysis/stocks/${record.stock_id}`} className="stock-dashboard-target-link">
          {stockLabel(record)}
        </Link>
      )
    },
    { title: "报告期", dataIndex: "report_period", width: 94, render: (value) => value || "-" },
    { title: "当前市值", dataIndex: "current_market_value", width: 96, render: formatNumber },
    { title: "三年目标", dataIndex: "expected_market_value_3y", width: 96, render: formatNumber },
    { title: "预期差", dataIndex: "expectation_gap_rate", width: 86, render: formatPercent },
    { title: "分析日", dataIndex: "analysis_date", width: 104, render: (value) => value || "-" }
  ];

  return (
    <div className="stock-dashboard">
      <div className="stock-dashboard-metrics">
        <MetricCard icon={<BarChartOutlined />} label="标的池数量" value={dashboard.data.summary.pool_count} />
        <MetricCard icon={<CheckCircleOutlined />} label="重点跟踪数量" value={dashboard.data.summary.focused_count} />
        <MetricCard icon={<AlertOutlined />} label="待研判材料数量" value={dashboard.data.summary.pending_materials_count} />
        <MetricCard
          icon={<TrophyOutlined />}
          label="当前最高评分标的"
          value={dashboard.data.summary.top_score_stock?.stock_name || dashboard.data.summary.top_score_stock?.stock_code || "-"}
        />
      </div>

      <div className="stock-dashboard-grid main">
        <ChartCard title="标的评分趋势" option={trendOption} height={310} />
        <WorkbenchCard title="最新评分榜">
          <Table
            rowKey="stock_id"
            size="small"
            loading={dashboard.loading}
            dataSource={dashboard.data.score_rankings.slice(0, 10)}
            columns={rankingColumns}
            pagination={false}
            rowClassName={(record) => (record.stock_id === selectedStockId ? "selected-dashboard-row" : "")}
            onRow={(record) => ({ onClick: () => setSelectedStockId(record.stock_id) })}
            locale={{ emptyText: <EmptyAction description="暂无标的评分数据" /> }}
            scroll={{ x: 440 }}
          />
        </WorkbenchCard>
      </div>

      <div className="stock-dashboard-grid main">
        <ChartCard title="标的估值趋势" option={valuationTrendOption} height={310} />
        <WorkbenchCard title="最新估值记录">
          <Table
            rowKey="stock_id"
            size="small"
            loading={dashboard.loading}
            dataSource={dashboard.data.latest_valuations}
            columns={valuationColumns}
            pagination={false}
            locale={{ emptyText: <EmptyAction description="暂无标的估值数据" /> }}
            scroll={{ x: 620 }}
          />
        </WorkbenchCard>
      </div>

    </div>
  );
}

function MetricCard({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="stock-metric-card">
      <div className="stock-metric-icon">{icon}</div>
      <div className="stock-metric-copy">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}
