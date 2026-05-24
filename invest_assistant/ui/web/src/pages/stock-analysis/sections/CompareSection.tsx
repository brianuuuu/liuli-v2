import { Button, Input, Segmented, Table } from "antd";
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
  const [activeTab, setActiveTab] = useState("score");
  const [trackFilter, setTrackFilter] = useState("all");
  const [searchText, setSearchText] = useState("");

  const visibleTracks = useMemo(
    () => tracks.data.filter((track) => ["candidate", "active", "paused"].includes(track.status)),
    [tracks.data]
  );

  const activeSourceRows = activeTab === "score" ? comparison.data : valuation.data;
  const activeTrackCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const item of activeSourceRows) {
      for (const track of item.tracks || []) {
        counts.set(track.id, (counts.get(track.id) || 0) + 1);
      }
    }
    return counts;
  }, [activeSourceRows]);

  const selectedTrackName = useMemo(() => {
    if (!trackFilter.startsWith("track:")) return null;
    const trackId = Number(trackFilter.slice("track:".length));
    return visibleTracks.find((track) => track.id === trackId)?.name || null;
  }, [trackFilter, visibleTracks]);

  function matchesTrackFilter(item: StockScoreComparisonItem | StockValuationComparisonItem) {
    if (trackFilter === "all") return true;
    if (trackFilter === "with-stock") return Boolean(item.tracks?.length);
    if (!trackFilter.startsWith("track:")) return true;
    const trackId = Number(trackFilter.slice("track:".length));
    return Boolean(item.tracks?.some((track) => track.id === trackId));
  }

  function matchesSearch(item: StockScoreComparisonItem | StockValuationComparisonItem) {
    const keyword = searchText.trim().toLowerCase();
    if (!keyword) return true;
    return [item.stock_name, item.symbol, item.stock_code, `id ${item.stock_id}`, String(item.stock_id)]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(keyword));
  }

  const scoreRows = useMemo(
    () => comparison.data.filter((item) => matchesTrackFilter(item) && matchesSearch(item)),
    [comparison.data, searchText, trackFilter]
  );
  const valuationRows = useMemo(
    () => valuation.data.filter((item) => matchesTrackFilter(item) && matchesSearch(item)),
    [valuation.data, searchText, trackFilter]
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

  function selectTrackFilter(nextFilter: string) {
    setTrackFilter((current) => current === nextFilter && nextFilter.startsWith("track:") ? "all" : nextFilter);
  }

  function renderTrackFilterButton(value: string, label: string, count?: number) {
    const active = trackFilter === value;
    return (
      <button
        key={value}
        type="button"
        className={active ? "stock-compare-track-pill active" : "stock-compare-track-pill"}
        onClick={() => selectTrackFilter(value)}
      >
        <span>{label}</span>
        {count !== undefined ? <span className="stock-compare-track-pill-count">{count}</span> : null}
      </button>
    );
  }

  function emptyDescription(sourceCount: number) {
    if (!sourceCount) return "暂无标的池数据，先在标的池加入标的";
    if (searchText.trim()) return "未找到匹配标的";
    if (trackFilter !== "all") return "当前赛道无绑定标的，去标的详情或标的池维护赛道绑定";
    return "暂无标的";
  }

  const currentSourceCount = activeTab === "score" ? comparison.data.length : valuation.data.length;
  const hasFilters = trackFilter !== "all" || Boolean(searchText.trim());

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
      toolbar={
        <>
          <Segmented
            size="small"
            value={activeTab}
            options={[
              { label: "评分", value: "score" },
              { label: "估值", value: "valuation" }
            ]}
            onChange={(value) => setActiveTab(String(value))}
          />
          <div className="data-panel-toolbar-divider" />
          <Input.Search
            allowClear
            size="small"
            placeholder="搜索名称 / 代码"
            value={searchText}
            style={{ width: 220 }}
            onChange={(event) => setSearchText(event.target.value)}
          />
          {hasFilters ? <Button size="small" onClick={() => { setTrackFilter("all"); setSearchText(""); }}>清空</Button> : null}
          <div className="data-panel-toolbar-spacer" />
          <span className="stock-compare-context">{selectedTrackName ? `当前赛道：${selectedTrackName}` : "横向比较"}</span>
        </>
      }
    >
      <div className="stock-compare-track-bar" aria-label="赛道筛选">
        {renderTrackFilterButton("all", "全部", currentSourceCount)}
        {renderTrackFilterButton("with-stock", "有绑定", activeSourceRows.filter((item) => item.tracks?.length).length)}
        {visibleTracks.map((track) => renderTrackFilterButton(`track:${track.id}`, track.name, activeTrackCounts.get(track.id) || 0))}
      </div>
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
