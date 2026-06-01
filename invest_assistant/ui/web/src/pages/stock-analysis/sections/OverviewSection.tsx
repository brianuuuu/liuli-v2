import {
  AlertOutlined,
  BarChartOutlined,
  CheckCircleOutlined,
  TrophyOutlined
} from "@ant-design/icons";
import { Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { getStockDashboard } from "../../../api/stockAnalysis";
import { EmptyAction } from "../../../components/common/EmptyAction";
import { WorkbenchCard } from "../../../components/common/WorkbenchCard";
import { useAsyncData } from "../../../hooks/useAsyncData";
import type {
  StockDashboardHotStock,
  StockDashboardLatestValuation,
  StockDashboardScoreRanking
} from "../../../types/api";
import { formatTime, StatusTag } from "./shared";

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
    hot_stocks: [],
    focus_stocks: [],
    latest_materials: [],
    pending_materials: [],
    default_stock_id: null,
    selected_stock_summary: null
  });

  useEffect(() => {
    if (!selectedStockId && dashboard.data.default_stock_id) {
      setSelectedStockId(dashboard.data.default_stock_id);
    }
  }, [dashboard.data.default_stock_id, selectedStockId]);

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

  const hotStockColumns: ColumnsType<StockDashboardHotStock> = [
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
    { title: "状态", dataIndex: "status", width: 92, render: (value) => <StatusTag status={value} /> },
    { title: "信息流", dataIndex: "source_item_count", width: 78 },
    { title: "高重要", dataIndex: "high_importance_material_count", width: 78 },
    { title: "材料", dataIndex: "material_count", width: 70 },
    { title: "最近材料", dataIndex: "latest_material_time", width: 140, render: (value) => (value ? formatTime(value).slice(5, 16) : "-") }
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

      <div className="stock-dashboard-grid tables">
        <WorkbenchCard title="最热标的榜">
          <Table
            rowKey="stock_id"
            size="small"
            loading={dashboard.loading}
            dataSource={dashboard.data.hot_stocks}
            columns={hotStockColumns}
            pagination={false}
            rowClassName={(record) => (record.stock_id === selectedStockId ? "selected-dashboard-row" : "")}
            onRow={(record) => ({ onClick: () => setSelectedStockId(record.stock_id) })}
            locale={{ emptyText: <EmptyAction description="暂无标的材料热度数据" /> }}
            scroll={{ x: 620 }}
          />
        </WorkbenchCard>
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
        <WorkbenchCard title="最近估值记录" style={{ gridColumn: "1 / -1" }}>
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
