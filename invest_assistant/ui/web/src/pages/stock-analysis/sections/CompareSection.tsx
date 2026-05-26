import { Button, Space, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import React, { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listStockScoreComparison, listStockValuationComparison } from "../../../api/stockAnalysis";
import { listTracks } from "../../../api/trackDiscovery";
import { EmptyAction } from "../../../components/common/EmptyAction";
import { DataPanel } from "../../../components/common/DataPanel";
import { useAsyncData } from "../../../hooks/useAsyncData";
import type { StockScoreComparisonItem, StockValuationComparisonItem, Track } from "../../../types/api";
import { poolStatusOptions } from "./shared";

export function CompareSection() {
  const comparison = useAsyncData(useCallback(listStockScoreComparison, []), []);
  const valuation = useAsyncData(useCallback(listStockValuationComparison, []), []);
  const tracks = useAsyncData(useCallback(() => listTracks(), []), []);
  const [activeTab, setActiveTab] = useState("score");
  const [trackFilter, setTrackFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<string | undefined>();

  const visibleTracks = useMemo(
    () => tracks.data.filter((track) => ["candidate", "active", "paused"].includes(track.status)),
    [tracks.data]
  );

  const activeSourceRows = activeTab === "score" ? comparison.data : valuation.data;

  const statusButtons = useMemo(() => {
    const counts = activeSourceRows.reduce((acc, item) => {
      if (item.status) {
        acc[item.status] = (acc[item.status] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);

    return [
      { value: undefined, label: `全部 (${activeSourceRows.length})` },
      ...poolStatusOptions.map((opt) => ({
        value: opt.value,
        label: `${opt.label} (${counts[opt.value] || 0})`
      }))
    ];
  }, [activeSourceRows]);
  const activeTrackCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const item of activeSourceRows) {
      for (const track of item.tracks || []) {
        counts.set(track.id, (counts.get(track.id) || 0) + 1);
      }
    }
    return counts;
  }, [activeSourceRows]);

  const trackSelectOptions = useMemo(() => {
    const totalCount = activeSourceRows.length;
    return [
      { label: `全部 (${totalCount})`, value: "all" },
      ...visibleTracks.map((track) => ({
        label: `${track.name} (${activeTrackCounts.get(track.id) || 0})`,
        value: `track:${track.id}`
      }))
    ];
  }, [visibleTracks, activeTrackCounts, activeSourceRows.length]);

  const selectedTrackName = useMemo(() => {
    if (!trackFilter.startsWith("track:")) return null;
    const trackId = Number(trackFilter.slice("track:".length));
    return visibleTracks.find((track) => track.id === trackId)?.name || null;
  }, [trackFilter, visibleTracks]);

  function matchesStatus(item: StockScoreComparisonItem | StockValuationComparisonItem) {
    if (!statusFilter) return true;
    return item.status === statusFilter;
  }

  function matchesTrackFilter(item: StockScoreComparisonItem | StockValuationComparisonItem) {
    if (trackFilter === "all") return true;
    if (trackFilter === "with-stock") return Boolean(item.tracks?.length);
    if (!trackFilter.startsWith("track:")) return true;
    const trackId = Number(trackFilter.slice("track:".length));
    return Boolean(item.tracks?.some((track) => track.id === trackId));
  }

  const scoreRows = useMemo(
    () => comparison.data.filter((item) => matchesStatus(item) && matchesTrackFilter(item)),
    [comparison.data, statusFilter, trackFilter]
  );
  const valuationRows = useMemo(
    () => valuation.data.filter((item) => matchesStatus(item) && matchesTrackFilter(item)),
    [valuation.data, statusFilter, trackFilter]
  );

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

  function numericSorter<T extends Record<string, unknown>>(key: keyof T) {
    return (a: T, b: T) => Number(a[key] ?? Number.NEGATIVE_INFINITY) - Number(b[key] ?? Number.NEGATIVE_INFINITY);
  }

  function renderScoreValue(value?: number | null, strong = false) {
    return <span className={strong ? "stock-compare-score-value strong" : "stock-compare-score-value"}>{formatScore(value)}</span>;
  }

  function renderGap(value?: number | null) {
    if (value == null) return "-";
    const numeric = Number(value);
    const className = numeric >= 0 ? "stock-compare-gap positive" : "stock-compare-gap negative";
    return <span className={className}>{formatPercent(numeric)}</span>;
  }

  function renderStockLink(record: { stock_id: number; stock_name?: string | null; symbol?: string | null; stock_code?: string | null }) {
    const stockLabel = record.stock_name || record.symbol || record.stock_code || `Stock ID ${record.stock_id}`;
    return (
      <Link to={`/stock-analysis/stocks/${record.stock_id}`} className="stock-compare-target-link">
        <span className="stock-compare-target-name">{stockLabel}</span>
      </Link>
    );
  }



  function emptyDescription(sourceCount: number) {
    if (!sourceCount) return "暂无标的池数据，先在标的池加入标的";
    if (trackFilter !== "all") return "当前赛道无绑定标的，去标的详情或标的池维护赛道绑定";
    return "暂无标的";
  }

  const scoreColumns: ColumnsType<StockScoreComparisonItem> = [
    {
      title: "标的",
      dataIndex: "stock_name",
      fixed: "left",
      width: 190,
      render: (_, record) => renderStockLink(record)
    },
    { title: "评分日期", dataIndex: "score_date", width: 110, render: (value) => value || "-" },
    { title: "总分", dataIndex: "total_score", width: 80, sorter: numericSorter("total_score"), defaultSortOrder: "descend", render: (value) => renderScoreValue(value, true) },
    { title: "成长", dataIndex: "growth_score", width: 80, sorter: numericSorter("growth_score"), render: renderScoreValue },
    { title: "估值", dataIndex: "valuation_score", width: 80, sorter: numericSorter("valuation_score"), render: renderScoreValue },
    { title: "护城河", dataIndex: "moat_score", width: 90, sorter: numericSorter("moat_score"), render: renderScoreValue },
    { title: "风险", dataIndex: "risk_score", width: 80, sorter: numericSorter("risk_score"), render: renderScoreValue },
    { title: "操作", width: 90, render: (_, record) => <Link to={`/stock-analysis/stocks/${record.stock_id}`}>详情</Link> }
  ];

  const valuationColumns: ColumnsType<StockValuationComparisonItem> = [
    {
      title: "标的",
      dataIndex: "stock_name",
      fixed: "left",
      width: 190,
      render: (_, record) => renderStockLink(record)
    },
    { title: "报告期", dataIndex: "report_period", width: 100, render: (value) => value || "-" },
    { title: "披露日", dataIndex: "report_release_date", width: 110, render: (value) => value || "-" },
    { title: "当前市值", dataIndex: "current_market_value", width: 100, sorter: numericSorter("current_market_value"), render: (value) => <span className="stock-compare-market-value">{formatNumber(value)}</span> },
    { title: "季度表现", dataIndex: "quarter_performance", width: 120, render: (value) => value || "-" },
    { title: "主模型", dataIndex: "primary_model", width: 110, render: (value) => <span className="stock-compare-model">{formatPrimaryModel(value)}</span> },
    { title: "三年目标市值", dataIndex: "expected_market_value_3y", width: 120, sorter: numericSorter("expected_market_value_3y"), render: (value) => <span className="stock-compare-market-value target">{formatNumber(value)}</span> },
    { title: "预期差", dataIndex: "expectation_gap_rate", width: 100, sorter: numericSorter("expectation_gap_rate"), defaultSortOrder: "descend", render: renderGap },
    { title: "分析日期", dataIndex: "analysis_date", width: 110, render: (value) => value || "-" },
    { title: "研究员", dataIndex: "researcher", width: 110, render: (value) => value || "-" },
    { title: "详情", width: 90, render: (_, record) => <Link to={`/stock-analysis/stocks/${record.stock_id}`}>详情</Link> }
  ];

  return (
    <DataPanel
      toolbar={[
        <React.Fragment key="basic-filters">
          <Space size={4} className="toolbar-tab-buttons">
            <Button
              size="small"
              className={activeTab === "score" ? "toolbar-filter-button active" : "toolbar-filter-button"}
              onClick={() => setActiveTab("score")}
            >
              评分
            </Button>
            <Button
              size="small"
              className={activeTab === "valuation" ? "toolbar-filter-button active" : "toolbar-filter-button"}
              onClick={() => setActiveTab("valuation")}
            >
              估值
            </Button>
          </Space>
          <div className="data-panel-toolbar-divider" />
          <div style={{ overflowX: "auto", flex: 1, padding: "2px 0" }} className="no-scrollbar">
            <Space size={4} className="toolbar-status-buttons">
              {statusButtons.map((item) => (
                <Button
                  key={item.value || "all"}
                  size="small"
                  className={statusFilter === item.value ? "toolbar-filter-button active" : "toolbar-filter-button"}
                  onClick={() => setStatusFilter(item.value)}
                >
                  {item.label}
                </Button>
              ))}
            </Space>
          </div>
          <div className="data-panel-toolbar-spacer" />
          <span className="stock-compare-context">{selectedTrackName ? `当前赛道：${selectedTrackName}` : "横向比较"}</span>
        </React.Fragment>,
        trackSelectOptions.length > 0 ? (
          <React.Fragment key="track-filters">
            <div style={{ overflowX: "auto", flex: 1, padding: "2px 0" }} className="no-scrollbar">
              <Space size={4} className="toolbar-track-buttons">
                {trackSelectOptions.map((opt) => (
                  <Button
                    key={opt.value}
                    size="small"
                    className={trackFilter === opt.value ? "toolbar-filter-button active" : "toolbar-filter-button"}
                    onClick={() => setTrackFilter(opt.value)}
                  >
                    {opt.label}
                  </Button>
                ))}
              </Space>
            </div>
          </React.Fragment>
        ) : null
      ]}
    >
      {activeTab === "score" ? (
        <Table
          rowKey="stock_id"
          size="small"
          loading={comparison.loading || tracks.loading}
          dataSource={scoreRows}
          columns={scoreColumns}
          pagination={{ pageSize: 10, showSizeChanger: true }}
          locale={{ emptyText: <EmptyAction description={emptyDescription(comparison.data.length)} /> }}
          scroll={{ x: 760 }}
        />
      ) : (
        <Table
          rowKey="stock_id"
          size="small"
          loading={valuation.loading || tracks.loading}
          dataSource={valuationRows}
          columns={valuationColumns}
          pagination={{ pageSize: 10, showSizeChanger: true }}
          locale={{ emptyText: <EmptyAction description={emptyDescription(valuation.data.length)} /> }}
          scroll={{ x: 1170 }}
        />
      )}
    </DataPanel>
  );
}
