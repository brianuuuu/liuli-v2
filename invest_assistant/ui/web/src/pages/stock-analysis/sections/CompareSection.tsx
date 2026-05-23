import { Space, Table, Tabs } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listStockScoreComparison, listStockValuationComparison } from "../../../api/stockAnalysis";
import { listTracks } from "../../../api/trackDiscovery";
import { EmptyAction } from "../../../components/common/EmptyAction";
import { DataPanel } from "../../../components/common/DataPanel";
import { useAsyncData } from "../../../hooks/useAsyncData";
import type { StockScoreComparisonItem, StockValuationComparisonItem, Track } from "../../../types/api";

export function CompareSection() {
  const comparison = useAsyncData(useCallback(listStockScoreComparison, []), []);
  const valuation = useAsyncData(useCallback(listStockValuationComparison, []), []);
  const tracks = useAsyncData(useCallback(() => listTracks(), []), []);
  const [selectedTrackId, setSelectedTrackId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState("score");

  const visibleTracks = useMemo(
    () => tracks.data.filter((track) => ["candidate", "active", "paused"].includes(track.status)),
    [tracks.data]
  );
  const trackCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const item of comparison.data) {
      for (const track of item.tracks || []) {
        counts.set(track.id, (counts.get(track.id) || 0) + 1);
      }
    }
    return counts;
  }, [comparison.data]);
  const scoreRows = useMemo(
    () => selectedTrackId
      ? comparison.data.filter((item) => (item.tracks || []).some((track) => track.id === selectedTrackId))
      : comparison.data,
    [comparison.data, selectedTrackId]
  );
  const valuationRows = useMemo(
    () => selectedTrackId
      ? valuation.data.filter((item) => (item.tracks || []).some((track) => track.id === selectedTrackId))
      : valuation.data,
    [valuation.data, selectedTrackId]
  );

  function toggleTrack(track: Track) {
    setSelectedTrackId((current) => current === track.id ? null : track.id);
  }

  function formatScore(value?: number | null) {
    return value == null ? "-" : Number(value).toFixed(1);
  }

  function formatNumber(value?: number | null) {
    return value == null ? "-" : Number(value).toFixed(1);
  }

  function formatPercent(value?: number | null) {
    return value == null ? "-" : `${(Number(value) * 100).toFixed(1)}%`;
  }

  function formatPrimaryModel(value?: string | null) {
    const labels: Record<string, string> = {
      profit: "利润",
      fcf: "自由现金流",
      revenue: "收入"
    };
    return value ? labels[value] || value : "-";
  }

  function renderStockLink(record: { stock_id: number; stock_name?: string | null; symbol?: string | null; stock_code?: string | null }) {
    const stockLabel = record.stock_name || record.symbol || record.stock_code || `Stock ID ${record.stock_id}`;
    const codeLabel = [record.symbol || record.stock_code, `ID ${record.stock_id}`].filter(Boolean).join(" / ");
    return (
      <Link to={`/stock-analysis/stocks/${record.stock_id}`} className="stock-pool-target-link">
        <span className="stock-pool-target-name">{stockLabel}</span>
        <span className="stock-pool-target-meta">{codeLabel}</span>
      </Link>
    );
  }

  function renderTracks(value: StockScoreComparisonItem["tracks"] | StockValuationComparisonItem["tracks"]) {
    if (!value?.length) return "-";
    return (
      <Space size={4} wrap>
        {value.map((track) => (
          <Link key={track.id} to={`/track-discovery/tracks/${track.id}`}>{track.name}</Link>
        ))}
      </Space>
    );
  }

  const scoreColumns: ColumnsType<StockScoreComparisonItem> = [
    {
      title: "标的",
      dataIndex: "stock_name",
      render: (_, record) => renderStockLink(record)
    },
    {
      title: "绑定赛道",
      dataIndex: "tracks",
      render: renderTracks
    },
    { title: "评分日期", dataIndex: "score_date", width: 110, render: (value) => value || "-" },
    { title: "总分", dataIndex: "total_score", width: 80, render: formatScore },
    { title: "成长", dataIndex: "growth_score", width: 80, render: formatScore },
    { title: "估值", dataIndex: "valuation_score", width: 80, render: formatScore },
    { title: "护城河", dataIndex: "moat_score", width: 90, render: formatScore },
    { title: "风险", dataIndex: "risk_score", width: 80, render: formatScore },
    { title: "操作", width: 90, render: (_, record) => <Link to={`/stock-analysis/stocks/${record.stock_id}`}>详情</Link> }
  ];

  const valuationColumns: ColumnsType<StockValuationComparisonItem> = [
    {
      title: "标的",
      dataIndex: "stock_name",
      render: (_, record) => renderStockLink(record)
    },
    {
      title: "绑定赛道",
      dataIndex: "tracks",
      render: renderTracks
    },
    { title: "报告期", dataIndex: "report_period", width: 100, render: (value) => value || "-" },
    { title: "披露日", dataIndex: "report_release_date", width: 110, render: (value) => value || "-" },
    { title: "当前市值", dataIndex: "current_market_value", width: 100, render: formatNumber },
    { title: "季度表现", dataIndex: "quarter_performance", width: 120, render: (value) => value || "-" },
    { title: "主模型", dataIndex: "primary_model", width: 110, render: formatPrimaryModel },
    { title: "三年目标市值", dataIndex: "expected_market_value_3y", width: 120, render: formatNumber },
    { title: "预期差", dataIndex: "expectation_gap_rate", width: 100, render: formatPercent },
    { title: "分析日期", dataIndex: "analysis_date", width: 110, render: (value) => value || "-" },
    { title: "研究员", dataIndex: "researcher", width: 110, render: (value) => value || "-" },
    { title: "详情", width: 90, render: (_, record) => <Link to={`/stock-analysis/stocks/${record.stock_id}`}>详情</Link> }
  ];

  return (
    <DataPanel>
      <div className="stock-compare-track-grid">
        {visibleTracks.map((track) => {
          const selected = selectedTrackId === track.id;
          return (
            <button
              key={track.id}
              type="button"
              className={selected ? "stock-compare-track-button active" : "stock-compare-track-button"}
              onClick={() => toggleTrack(track)}
            >
              <span className="stock-compare-track-name">{track.name}</span>
              <span className="stock-compare-track-count">{trackCounts.get(track.id) || 0} 个标的</span>
            </button>
          );
        })}
      </div>
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: "score",
            label: "评分",
            children: (
              <Table
                rowKey="stock_id"
                size="small"
                loading={comparison.loading || tracks.loading}
                dataSource={scoreRows}
                columns={scoreColumns}
                pagination={{ pageSize: 12, showSizeChanger: true }}
                locale={{ emptyText: <EmptyAction description="暂无标的" /> }}
              />
            )
          },
          {
            key: "valuation",
            label: "估值",
            children: (
              <Table
                rowKey="stock_id"
                size="small"
                loading={valuation.loading || tracks.loading}
                dataSource={valuationRows}
                columns={valuationColumns}
                pagination={{ pageSize: 12, showSizeChanger: true }}
                locale={{ emptyText: <EmptyAction description="暂无标的" /> }}
              />
            )
          }
        ]}
      />
    </DataPanel>
  );
}
