import { Button, Modal, Popconfirm, Space, Table, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { EChartsOption } from "echarts";
import ReactECharts from "echarts-for-react";
import React, { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { deleteStockScore, listStockScoreComparison, listStockValuationComparison } from "../../../api/stockAnalysis";
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
  const [radarScore, setRadarScore] = useState<StockScoreComparisonItem | null>(null);
  const [viewingScore, setViewingScore] = useState<StockScoreComparisonItem | null>(null);

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

  function scoreRadarOption(record: StockScoreComparisonItem): EChartsOption {
    const dimensions = scoreDimensions(record);
    return {
      tooltip: {},
      radar: {
        indicator: dimensions.map((item) => ({ name: item.label, max: 10 })),
        radius: "68%"
      },
      series: [
        {
          type: "radar",
          data: [{ value: dimensions.map((item) => Number(item.value || 0)), name: record.stock_name || "评分" }],
          areaStyle: { opacity: 0.16 }
        }
      ]
    };
  }

  function scoreDimensions(record: StockScoreComparisonItem) {
    return [
      { label: "壁垒", value: record.business_moat_score },
      { label: "管理", value: record.management_score },
      { label: "治理", value: record.governance_score },
      { label: "战略", value: record.strategy_score },
      { label: "确定性", value: record.certainty_score },
      { label: "成长", value: record.growth_score }
    ];
  }

  async function removeScore(record: StockScoreComparisonItem) {
    if (!record.score_id) return;
    await deleteStockScore(record.score_id);
    message.success("评分已删除");
    await comparison.refresh();
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
    { title: "报告时间", dataIndex: "report_time", width: 110, render: (value) => value || "-" },
    { title: "研究员", dataIndex: "researcher_code", width: 110, render: (value) => value || "-" },
    { title: "等级", dataIndex: "investment_level", width: 70, render: (value) => value || "-" },
    { title: "总分", dataIndex: "total_score", width: 78, sorter: numericSorter("total_score"), defaultSortOrder: "descend", render: (value) => renderScoreValue(value, true) },
    { title: "壁垒", dataIndex: "business_moat_score", width: 72, sorter: numericSorter("business_moat_score"), render: renderScoreValue },
    { title: "管理", dataIndex: "management_score", width: 72, sorter: numericSorter("management_score"), render: renderScoreValue },
    { title: "治理", dataIndex: "governance_score", width: 72, sorter: numericSorter("governance_score"), render: renderScoreValue },
    { title: "战略", dataIndex: "strategy_score", width: 72, sorter: numericSorter("strategy_score"), render: renderScoreValue },
    { title: "确定性", dataIndex: "certainty_score", width: 82, sorter: numericSorter("certainty_score"), render: renderScoreValue },
    { title: "成长", dataIndex: "growth_score", width: 80, sorter: numericSorter("growth_score"), render: renderScoreValue },
    {
      title: "操作",
      width: 170,
      render: (_, record) => record.score_id ? (
        <Space size={4}>
          <Button size="small" onClick={() => setRadarScore(record)}>雷达图</Button>
          <Button size="small" onClick={() => setViewingScore(record)}>查看</Button>
          <Popconfirm title="删除这条评分？" okText="删除" cancelText="取消" onConfirm={() => void removeScore(record)}>
            <Button size="small" danger>删除</Button>
          </Popconfirm>
        </Space>
      ) : "-"
    }
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
        <>
          <Table
            rowKey={(record) => String(record.score_id || `stock-${record.stock_id}`)}
            size="small"
            loading={comparison.loading || tracks.loading}
            dataSource={scoreRows}
            columns={scoreColumns}
            pagination={{ defaultPageSize: 10, showSizeChanger: true }}
            locale={{ emptyText: <EmptyAction description={emptyDescription(comparison.data.length)} /> }}
            scroll={{ x: 1160 }}
          />
          <Modal title={`${radarScore?.stock_name || "标的"} 雷达图`} open={!!radarScore} onCancel={() => setRadarScore(null)} footer={null} width={560} destroyOnHidden>
            {radarScore ? <ReactECharts option={scoreRadarOption(radarScore)} style={{ height: 360 }} /> : null}
          </Modal>
          <Modal title={`${viewingScore?.stock_name || "标的"} 评分详情`} open={!!viewingScore} onCancel={() => setViewingScore(null)} footer={null} width={720} destroyOnHidden>
            {viewingScore ? (
              <Space direction="vertical" size={10} style={{ width: "100%" }}>
                <div>报告时间：{viewingScore.report_time || "-"}　研究员：{viewingScore.researcher_code || "-"}　等级：{viewingScore.investment_level || "-"}</div>
                <div>
                  {scoreDimensions(viewingScore).map((item) => `${item.label}：${formatScore(item.value)}`).join("　")}　总分：{formatScore(viewingScore.total_score)}
                </div>
                <div>核心逻辑：{viewingScore.core_logic || "-"}</div>
                <div>主要风险：{viewingScore.primary_risk || "-"}</div>
              </Space>
            ) : null}
          </Modal>
        </>
      ) : (
        <Table
          rowKey="stock_id"
          size="small"
          loading={valuation.loading || tracks.loading}
          dataSource={valuationRows}
          columns={valuationColumns}
          pagination={{ defaultPageSize: 10, showSizeChanger: true }}
          locale={{ emptyText: <EmptyAction description={emptyDescription(valuation.data.length)} /> }}
          scroll={{ x: 1170 }}
        />
      )}
    </DataPanel>
  );
}
