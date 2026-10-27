import { EllipsisOutlined } from "@ant-design/icons";
import { Button, Dropdown, Modal, Space, Table, Tooltip, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { EChartsOption } from "echarts";
import ReactECharts from "echarts-for-react";
import React, { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listKnowledgeResearchers } from "../../../api/knowledge";
import { deleteStockScore, listStockScoreComparison, listStockTrendComparison, listStockValuationComparison } from "../../../api/stockAnalysis";
import { listTracks } from "../../../api/trackDiscovery";
import { useLiuliTheme } from "../../../app/theme";
import { EmptyAction } from "../../../components/common/EmptyAction";
import { DataPanel } from "../../../components/common/DataPanel";
import { CountLabel } from "../../../components/common/CountLabel";
import { useAsyncData } from "../../../hooks/useAsyncData";
import type { StockScoreComparisonItem, StockTrendComparisonItem, StockValuationComparisonItem } from "../../../types/api";
import { TREND_LEVELS, suggestedGroupLabel, trendLevelTone } from "../trendPresentation";
import { poolStatusOptions } from "./shared";

type CompareItem = StockScoreComparisonItem | StockValuationComparisonItem | StockTrendComparisonItem;

// 趋势报告的两个枚举按报告里的顺序排序：公司地位由强到弱，日线位置按一轮行情的先后
const COMPANY_POSITIONS = ["核心龙头", "核心受益", "高弹性受益", "普通受益", "概念映射"];
const STOCK_STAGES = ["蓄势", "启动", "主升初期", "主升中期", "加速后段", "高潮", "退潮", "修复", "破位"];

/** 按枚举顺序排序；没有趋势研究或取值不在枚举里的排在最后，不论升序降序 */
function orderSorter(key: keyof StockTrendComparisonItem, order: readonly string[]) {
  return (a: StockTrendComparisonItem, b: StockTrendComparisonItem, sortOrder?: "ascend" | "descend" | null) => {
    const left = order.indexOf(String(a[key] ?? ""));
    const right = order.indexOf(String(b[key] ?? ""));
    if (left < 0 && right < 0) return 0;
    if (left < 0) return sortOrder === "descend" ? -1 : 1;
    if (right < 0) return sortOrder === "descend" ? 1 : -1;
    return left - right;
  };
}

// 趋势页的详情：表格只放短标签，整段文字在这里看
const TREND_TEXT_FIELDS: { key: keyof StockTrendComparisonItem; label: string }[] = [
  { key: "core_logic", label: "核心逻辑" },
  { key: "remaining_upside", label: "剩余空间" },
  { key: "trend_duration", label: "趋势持续" },
  { key: "next_verification", label: "下一步验证" },
  { key: "primary_risk", label: "主要风险" },
  { key: "data_gaps", label: "数据缺口" }
];

// 叠加雷达图最多放几只：再多线条就缠在一起看不清
const MAX_COMPARE = 4;
const COMPARE_COLORS = ["#2563eb", "#dc2626", "#059669", "#d97706"];

const SCORE_DIMENSIONS: { key: keyof StockScoreComparisonItem; label: string }[] = [
  { key: "business_moat_score", label: "壁垒" },
  { key: "management_score", label: "管理" },
  { key: "governance_score", label: "治理" },
  { key: "strategy_score", label: "战略" },
  { key: "certainty_score", label: "确定性" },
  { key: "growth_score", label: "成长" }
];

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
  const labels: Record<string, string> = { profit: "利润", fcf: "自由现金流", revenue: "收入" };
  return value ? labels[value] || value : "-";
}

function numericSorter<T extends Record<string, unknown>>(key: keyof T) {
  return (a: T, b: T) => Number(a[key] ?? Number.NEGATIVE_INFINITY) - Number(b[key] ?? Number.NEGATIVE_INFINITY);
}

/**
 * 分项分数只标两头：≥ 9.0 是突出长项（蓝色加粗），≤ 7.0 是明显短板（橙色），中间不标。
 * 分数大多集中在 7–9.5，按深浅铺底色会满屏色块、拉不开差距，还和勾选行高亮撞色。
 */
const STRONG_SCORE = 9;
const WEAK_SCORE = 7;

function renderDimensionScore(value?: number | null) {
  const tone = value == null ? "" : Number(value) >= STRONG_SCORE ? " is-strong" : Number(value) <= WEAK_SCORE ? " is-weak" : "";
  return <span className={`stock-compare-score-value${tone}`}>{formatScore(value)}</span>;
}

function scoreValues(record: StockScoreComparisonItem) {
  return SCORE_DIMENSIONS.map((item) => Number(record[item.key] ?? 0));
}

export function CompareSection() {
  const { resolvedMode } = useLiuliTheme();
  const comparison = useAsyncData(useCallback(listStockScoreComparison, []), []);
  const valuation = useAsyncData(useCallback(listStockValuationComparison, []), []);
  const trend = useAsyncData(useCallback(listStockTrendComparison, []), []);
  const tracks = useAsyncData(useCallback(() => listTracks(), []), []);
  const researchers = useAsyncData(useCallback(listKnowledgeResearchers, []), []);
  const [activeTab, setActiveTab] = useState("score");
  const [trackFilter, setTrackFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [viewingScore, setViewingScore] = useState<StockScoreComparisonItem | null>(null);
  const [viewingTrend, setViewingTrend] = useState<StockTrendComparisonItem | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);

  // 研究员显示中文名，研究员库里没有的仍显示代码
  const researcherNames = useMemo(
    () => new Map(researchers.data.map((item) => [item.researcher_code, item.display_name])),
    [researchers.data]
  );
  const researcherLabel = (code?: string | null) => (code ? researcherNames.get(code) || code : "-");

  const visibleTracks = useMemo(() => tracks.data.filter((track) => track.status !== "archived"), [tracks.data]);

  const activeSourceRows: CompareItem[] = activeTab === "score" ? comparison.data : activeTab === "valuation" ? valuation.data : trend.data;

  const statusButtons = useMemo(() => {
    const counts = activeSourceRows.reduce((acc, item) => {
      if (item.status) acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    return [
      { value: undefined, label: "全部", count: activeSourceRows.length },
      ...poolStatusOptions.map((opt) => ({ value: opt.value, label: opt.label, count: counts[opt.value] || 0 }))
    ];
  }, [activeSourceRows]);

  const activeTrackCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const item of activeSourceRows) {
      for (const track of item.tracks || []) counts.set(track.id, (counts.get(track.id) || 0) + 1);
    }
    return counts;
  }, [activeSourceRows]);

  // 赛道按钮：没有标的的不显示（当前选中的除外），按数量从多到少排；放不下就换行，不横向滚动
  const trackButtons = useMemo(() => {
    const items = visibleTracks
      .map((track) => ({ value: `track:${track.id}`, name: track.name, count: activeTrackCounts.get(track.id) || 0 }))
      .filter((item) => item.count > 0 || item.value === trackFilter)
      .sort((a, b) => b.count - a.count);
    return [
      { value: "all", label: "全部", count: activeSourceRows.length },
      ...items.map((item) => ({ value: item.value, label: item.name, count: item.count }))
    ];
  }, [visibleTracks, activeTrackCounts, activeSourceRows.length, trackFilter]);

  const selectedTrackName = useMemo(() => {
    if (!trackFilter.startsWith("track:")) return null;
    const trackId = Number(trackFilter.slice("track:".length));
    return visibleTracks.find((track) => track.id === trackId)?.name || null;
  }, [trackFilter, visibleTracks]);

  function matchesStatus(item: CompareItem) {
    return !statusFilter || item.status === statusFilter;
  }

  function matchesTrackFilter(item: CompareItem) {
    if (trackFilter === "all") return true;
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
  const trendRows = useMemo(
    () => trend.data.filter((item) => matchesStatus(item) && matchesTrackFilter(item)),
    [trend.data, statusFilter, trackFilter]
  );

  const scoreRowKey = (record: StockScoreComparisonItem) => String(record.score_id || `stock-${record.stock_id}`);
  const selectedScores = useMemo(
    () => comparison.data.filter((item) => selectedKeys.includes(scoreRowKey(item))),
    [comparison.data, selectedKeys]
  );

  function radarOption(records: StockScoreComparisonItem[]): EChartsOption {
    const textColor = resolvedMode === "dark" ? "#c9d1d9" : "#334155";
    const gridColor = resolvedMode === "dark" ? "rgba(255, 255, 255, 0.12)" : "#e2e8f0";
    return {
      color: COMPARE_COLORS,
      tooltip: {},
      legend: records.length > 1 ? { bottom: 0, textStyle: { color: textColor } } : undefined,
      radar: {
        indicator: SCORE_DIMENSIONS.map((item) => ({ name: item.label, max: 10 })),
        radius: "66%",
        axisName: { color: textColor },
        splitLine: { lineStyle: { color: gridColor } },
        splitArea: { show: false },
        axisLine: { lineStyle: { color: gridColor } }
      },
      series: [
        {
          type: "radar",
          data: records.map((record) => ({ value: scoreValues(record), name: record.stock_name || "评分" })),
          areaStyle: { opacity: records.length > 1 ? 0.08 : 0.16 }
        }
      ]
    };
  }

  async function removeScore(record: StockScoreComparisonItem) {
    if (!record.score_id) return;
    await deleteStockScore(record.score_id);
    message.success("评分已删除");
    setSelectedKeys((keys) => keys.filter((key) => key !== scoreRowKey(record)));
    await comparison.refresh();
  }

  function confirmRemoveScore(record: StockScoreComparisonItem) {
    Modal.confirm({
      title: `删除 ${record.stock_name || "该标的"} 的这条评分？`,
      okText: "删除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: () => removeScore(record)
    });
  }

  function renderGap(value?: number | null) {
    if (value == null) return "-";
    const numeric = Number(value);
    return <span className={numeric >= 0 ? "stock-compare-gap positive" : "stock-compare-gap negative"}>{formatPercent(numeric)}</span>;
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
    { title: "标的", dataIndex: "stock_name", fixed: "left", width: 150, render: (_, record) => renderStockLink(record) },
    { title: "报告时间", dataIndex: "report_time", width: 108, render: (value) => value || "-" },
    { title: "研究员", dataIndex: "researcher_code", width: 120, render: (value) => researcherLabel(value) },
    { title: "等级", dataIndex: "investment_level", width: 64, align: "center", render: (value) => value || "-" },
    {
      title: "总分",
      dataIndex: "total_score",
      width: 84,
      align: "right",
      sorter: numericSorter("total_score"),
      defaultSortOrder: "descend",
      render: (value) => <span className="stock-compare-score-value strong">{formatScore(value)}</span>
    },
    ...SCORE_DIMENSIONS.map((dimension) => ({
      title: dimension.label,
      dataIndex: dimension.key as string,
      width: dimension.label.length > 2 ? 88 : 80,
      align: "right" as const,
      sorter: numericSorter<StockScoreComparisonItem>(dimension.key),
      render: (value: number | null) => renderDimensionScore(value)
    })),
    {
      title: "操作",
      width: 96,
      render: (_, record) =>
        record.score_id ? (
          <Space size={2}>
            {/* 雷达图并进详情：一个入口看全六维、雷达和逻辑；删除是低频危险操作，收进菜单 */}
            <Button size="small" type="link" onClick={() => setViewingScore(record)}>详情</Button>
            <Dropdown trigger={["click"]} menu={{ items: [{ key: "delete", label: "删除评分", danger: true }], onClick: () => confirmRemoveScore(record) }}>
              <Button size="small" type="text" aria-label="更多操作" icon={<EllipsisOutlined />} />
            </Dropdown>
          </Space>
        ) : (
          "-"
        )
    }
  ];

  const valuationColumns: ColumnsType<StockValuationComparisonItem> = [
    { title: "标的", dataIndex: "stock_name", fixed: "left", width: 150, render: (_, record) => renderStockLink(record) },
    { title: "报告期", dataIndex: "report_period", width: 100, render: (value) => value || "-" },
    { title: "披露日", dataIndex: "report_release_date", width: 110, render: (value) => value || "-" },
    { title: "当前市值", dataIndex: "current_market_value", width: 100, align: "right", sorter: numericSorter("current_market_value"), render: (value) => <span className="stock-compare-market-value">{formatNumber(value)}</span> },
    { title: "季度表现", dataIndex: "quarter_performance", width: 120, render: (value) => value || "-" },
    { title: "主模型", dataIndex: "primary_model", width: 110, render: (value) => <span className="stock-compare-model">{formatPrimaryModel(value)}</span> },
    { title: "三年目标市值", dataIndex: "expected_market_value_3y", width: 120, align: "right", sorter: numericSorter("expected_market_value_3y"), render: (value) => <span className="stock-compare-market-value target">{formatNumber(value)}</span> },
    { title: "预期差", dataIndex: "expectation_gap_rate", width: 100, align: "right", sorter: numericSorter("expectation_gap_rate"), defaultSortOrder: "descend", render: renderGap },
    { title: "分析日期", dataIndex: "analysis_date", width: 110, render: (value) => value || "-" },
    { title: "研究员", dataIndex: "researcher", width: 120, render: (value) => researcherLabel(value) },
    { title: "详情", width: 80, render: (_, record) => <Link to={`/stock-analysis/stocks/${record.stock_id}`}>详情</Link> }
  ];

  const trendColumns: ColumnsType<StockTrendComparisonItem> = [
    { title: "标的", dataIndex: "stock_name", fixed: "left", width: 150, render: (_, record) => renderStockLink(record) },
    { title: "研究日期", dataIndex: "research_date", width: 108, render: (value) => value || <Typography.Text type="secondary">待研究</Typography.Text> },
    { title: "研究员", dataIndex: "researcher_code", width: 120, render: (value) => researcherLabel(value) },
    {
      title: <Tooltip title="T0 最强，T5 最弱">趋势等级</Tooltip>,
      dataIndex: "trend_level",
      width: 104,
      align: "center",
      sorter: orderSorter("trend_level", TREND_LEVELS),
      defaultSortOrder: "ascend",
      render: (value) => (value ? <span className={`stock-trend-level ${trendLevelTone(value)}`}>{value}</span> : "-")
    },
    { title: "日线位置", dataIndex: "stock_stage", width: 104, sorter: orderSorter("stock_stage", STOCK_STAGES), render: (value) => value || "-" },
    { title: "公司地位", dataIndex: "company_position", width: 112, sorter: orderSorter("company_position", COMPANY_POSITIONS), render: (value) => value || "-" },
    { title: "主线赛道", dataIndex: "main_track", width: 120, ellipsis: true, render: (value) => value || "-" },
    {
      title: <Tooltip title="研究员建议的标的池分组，只是建议，不改标的池状态；与当前分组不同时标橙">建议分组</Tooltip>,
      dataIndex: "suggested_group",
      width: 100,
      render: (value, record) => {
        if (!value) return "-";
        if (value === record.status) return suggestedGroupLabel(value);
        const current = poolStatusOptions.find((item) => item.value === record.status)?.label || record.status || "-";
        return (
          <Tooltip title={`当前分组：${current}`}>
            <span className="stock-compare-suggest-change">{suggestedGroupLabel(value)}</span>
          </Tooltip>
        );
      }
    },
    {
      title: <Tooltip title="该份研究里的 Top 5 跟踪顺序，不等于立即买入">Top 5</Tooltip>,
      dataIndex: "priority_rank",
      width: 84,
      align: "center",
      sorter: (a, b, sortOrder) => {
        if (a.priority_rank == null && b.priority_rank == null) return 0;
        if (a.priority_rank == null) return sortOrder === "descend" ? -1 : 1;
        if (b.priority_rank == null) return sortOrder === "descend" ? 1 : -1;
        return a.priority_rank - b.priority_rank;
      },
      render: (value) => (value == null ? "-" : `#${value}`)
    },
    {
      title: "操作",
      width: 72,
      render: (_, record) => (record.trend_id ? <Button size="small" type="link" onClick={() => setViewingTrend(record)}>详情</Button> : "-")
    }
  ];

  const compareButton =
    activeTab === "score" ? (
      <Tooltip title={selectedScores.length < 2 ? `勾选 2–${MAX_COMPARE} 只标的后叠加对比六维雷达` : undefined}>
        <Button size="small" type="primary" ghost disabled={selectedScores.length < 2} onClick={() => setCompareOpen(true)}>
          <CountLabel label="对比雷达" count={selectedScores.length || null} />
        </Button>
      </Tooltip>
    ) : null;

  return (
    <DataPanel
      toolbar={[
        <React.Fragment key="basic-filters">
          {/* 评分 / 估值切换整张表的内容，比后面的筛选条件醒目一级 */}
          <Space size={4} className="toolbar-tab-buttons">
            {[
              { value: "score", label: "评分" },
              { value: "valuation", label: "估值" },
              { value: "trend", label: "趋势" }
            ].map((item) => (
              <Button
                key={item.value}
                size="small"
                autoInsertSpace={false}
                className={activeTab === item.value ? "toolbar-filter-button active" : "toolbar-filter-button"}
                onClick={() => setActiveTab(item.value)}
              >
                {item.label}
              </Button>
            ))}
          </Space>
          <div className="data-panel-toolbar-divider" />
          <Space size={4} wrap className="toolbar-status-buttons">
            {statusButtons.map((item) => (
              <Button
                key={item.value || "all"}
                size="small"
                className={statusFilter === item.value ? "toolbar-filter-button active" : "toolbar-filter-button"}
                onClick={() => setStatusFilter(item.value)}
              >
                <CountLabel label={item.label} count={item.count} />
              </Button>
            ))}
          </Space>
          <div className="data-panel-toolbar-spacer" />
          {selectedTrackName ? <span className="stock-compare-context">当前赛道：{selectedTrackName}</span> : null}
          {compareButton}
        </React.Fragment>,
        <React.Fragment key="track-filters">
          <Space size={4} wrap className="toolbar-track-buttons">
            {trackButtons.map((opt) => (
              <Button
                key={opt.value}
                size="small"
                className={trackFilter === opt.value ? "toolbar-filter-button active" : "toolbar-filter-button"}
                onClick={() => setTrackFilter(opt.value)}
              >
                <CountLabel label={opt.label} count={opt.count} />
              </Button>
            ))}
          </Space>
        </React.Fragment>
      ]}
    >
      {activeTab === "score" ? (
        <>
          <Table
            rowKey={scoreRowKey}
            size="small"
            className="stock-compare-table"
            loading={comparison.loading || tracks.loading}
            dataSource={scoreRows}
            columns={scoreColumns}
            rowSelection={{
              selectedRowKeys: selectedKeys,
              onChange: setSelectedKeys,
              // 最多勾选 MAX_COMPARE 只，满了以后其余行不可勾
              getCheckboxProps: (record) => ({
                disabled: !record.score_id || (selectedKeys.length >= MAX_COMPARE && !selectedKeys.includes(scoreRowKey(record)))
              })
            }}
            pagination={{ defaultPageSize: 10, showSizeChanger: false, hideOnSinglePage: true }}
            locale={{ emptyText: <EmptyAction description={emptyDescription(comparison.data.length)} /> }}
            scroll={{ x: 1180 }}
          />
          <Modal
            title={`${viewingScore?.stock_name || "标的"} 评分详情`}
            open={!!viewingScore}
            onCancel={() => setViewingScore(null)}
            footer={null}
            width={760}
            destroyOnHidden
          >
            {viewingScore ? (
              <div className="stock-score-detail">
                <ReactECharts option={radarOption([viewingScore])} style={{ height: 300 }} />
                <div className="stock-score-detail-info">
                  <div className="stock-score-detail-meta">
                    {viewingScore.report_time || "-"} · {researcherLabel(viewingScore.researcher_code)} · 等级 {viewingScore.investment_level || "-"} · 总分{" "}
                    <b>{formatScore(viewingScore.total_score)}</b>
                  </div>
                  <div className="stock-score-detail-dims">
                    {SCORE_DIMENSIONS.map((item) => (
                      <span key={item.label}>
                        {item.label} <b>{formatScore(viewingScore[item.key] as number | null)}</b>
                      </span>
                    ))}
                  </div>
                  <div><strong>核心逻辑</strong><p>{viewingScore.core_logic || "-"}</p></div>
                  <div><strong>主要风险</strong><p>{viewingScore.primary_risk || "-"}</p></div>
                </div>
              </div>
            ) : null}
          </Modal>
          <Modal
            title={`六维对比 · ${selectedScores.length} 只`}
            open={compareOpen && selectedScores.length >= 2}
            onCancel={() => setCompareOpen(false)}
            footer={null}
            width={720}
            destroyOnHidden
          >
            <ReactECharts option={radarOption(selectedScores)} style={{ height: 420 }} />
            <Table
              rowKey={scoreRowKey}
              size="small"
              pagination={false}
              dataSource={selectedScores}
              columns={[
                {
                  title: "标的",
                  dataIndex: "stock_name",
                  render: (value, _record, index) => (
                    <span><i className="stock-compare-legend-dot" style={{ background: COMPARE_COLORS[index % COMPARE_COLORS.length] }} />{value}</span>
                  )
                },
                { title: "总分", dataIndex: "total_score", width: 64, align: "right", render: (value) => <span className="stock-compare-score-value strong">{formatScore(value)}</span> },
                ...SCORE_DIMENSIONS.map((dimension) => ({
                  title: dimension.label,
                  dataIndex: dimension.key as string,
                  width: 60,
                  align: "right" as const,
                  render: (value: number | null) => renderDimensionScore(value)
                }))
              ]}
            />
          </Modal>
        </>
      ) : activeTab === "trend" ? (
        <>
          <Table
            rowKey="stock_id"
            size="small"
            className="stock-compare-table"
            loading={trend.loading || tracks.loading}
            dataSource={trendRows}
            columns={trendColumns}
            pagination={{ defaultPageSize: 10, showSizeChanger: false, hideOnSinglePage: true }}
            locale={{ emptyText: <EmptyAction description={emptyDescription(trend.data.length)} /> }}
            scroll={{ x: 1100 }}
          />
          <Modal
            title={`${viewingTrend?.stock_name || "标的"} 趋势研究`}
            open={!!viewingTrend}
            onCancel={() => setViewingTrend(null)}
            footer={null}
            width={720}
            destroyOnHidden
          >
            {viewingTrend ? (
              <div className="stock-score-detail-info">
                <div className="stock-score-detail-meta">
                  {viewingTrend.research_date || "-"}
                  {viewingTrend.market_data_date ? `（行情截至 ${viewingTrend.market_data_date}）` : ""} · {researcherLabel(viewingTrend.researcher_code)} · 趋势等级{" "}
                  <b>{viewingTrend.trend_level || "-"}</b> · {viewingTrend.stock_stage || "-"} · {viewingTrend.company_position || "-"}
                </div>
                {TREND_TEXT_FIELDS.filter((field) => viewingTrend[field.key]).map((field) => (
                  <div key={field.key}>
                    <strong>{field.label}</strong>
                    <p>{String(viewingTrend[field.key])}</p>
                  </div>
                ))}
              </div>
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
          pagination={{ defaultPageSize: 10, showSizeChanger: false, hideOnSinglePage: true }}
          locale={{ emptyText: <EmptyAction description={emptyDescription(valuation.data.length)} /> }}
          scroll={{ x: 1170 }}
        />
      )}
    </DataPanel>
  );
}
