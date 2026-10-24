import { Button, Modal, Space, Table, Tag, Tooltip, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { EChartsOption } from "echarts";
import ReactECharts from "echarts-for-react";
import React, { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listTrackComparison } from "../../../api/trackDiscovery";
import { useLiuliTheme } from "../../../app/theme";
import { DataPanel } from "../../../components/common/DataPanel";
import { EmptyAction } from "../../../components/common/EmptyAction";
import { useAsyncData } from "../../../hooks/useAsyncData";
import type { TrackComparisonItem } from "../../../types/api";
import { cycleLabel, gradeTagColor, heatTierTagColor, industryPhaseLabel, marketPhaseLabel, StatusTag, thesisStatusOptions } from "./shared";

// 叠加雷达最多放几条：再多线条就缠在一起看不清；配色与标的对比同一套
const MAX_COMPARE = 4;
const COMPARE_COLORS = ["#2563eb", "#dc2626", "#059669", "#d97706"];

// 展示名与 spec 11.4 一致
const SCORE_DIMENSIONS: { key: keyof TrackComparisonItem; label: string }[] = [
  { key: "market_heat_score", label: "资金热度" },
  { key: "growth_speed_score", label: "发展速度" },
  { key: "concentration_score", label: "行业集中度" },
  { key: "cycle_resilience_score", label: "周期韧性" },
  { key: "current_market_size_score", label: "当前规模" },
  { key: "future_market_size_score", label: "远期规模" }
];

// 结论文字不进表格（截断后看不出差别），在对比弹窗里逐项并排
const TEXT_FIELDS: { key: keyof TrackComparisonItem; label: string }[] = [
  { key: "core_judgment", label: "核心判断" },
  { key: "key_contradiction", label: "主要矛盾" },
  { key: "next_verification", label: "下一步验证" },
  { key: "risk_falsification", label: "风险与证伪" }
];

/**
 * 分项分数只标两头：≥ 8 是长项（蓝色加粗），≤ 4 是短板（橙色），中间不标。
 * 赛道分数整体比标的低（综合分多在 5–7），不能照搬标的的 9 / 7。
 */
const STRONG_SCORE = 8;
const WEAK_SCORE = 4;
// 研究日期超过这么多天标灰，提示该重新研究
const STALE_DAYS = 30;

function formatScore(value?: number | null) {
  return value == null ? "-" : Number(value).toFixed(1);
}

function renderDimensionScore(value?: number | null) {
  const tone = value == null ? "" : Number(value) >= STRONG_SCORE ? " is-strong" : Number(value) <= WEAK_SCORE ? " is-weak" : "";
  return <span className={`stock-compare-score-value${tone}`}>{formatScore(value)}</span>;
}

/** 未研究的赛道排在最后，不论升序降序 */
function scoreSorter(key: keyof TrackComparisonItem) {
  return (a: TrackComparisonItem, b: TrackComparisonItem, order?: "ascend" | "descend" | null) => {
    const left = a[key] as number | null | undefined;
    const right = b[key] as number | null | undefined;
    if (left == null && right == null) return 0;
    if (left == null) return order === "ascend" ? 1 : -1;
    if (right == null) return order === "ascend" ? -1 : 1;
    return Number(left) - Number(right);
  };
}

function isStale(researchDate?: string | null) {
  if (!researchDate) return false;
  return Date.now() - Date.parse(researchDate) > STALE_DAYS * 24 * 3600 * 1000;
}

export function CompareSection() {
  const { resolvedMode } = useLiuliTheme();
  const comparison = useAsyncData(useCallback(listTrackComparison, []), []);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);

  const statusButtons = useMemo(() => {
    const counts = comparison.data.reduce((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    return [
      { value: undefined, label: `全部 (${comparison.data.length})` },
      ...thesisStatusOptions
        .filter((opt) => counts[opt.value])
        .map((opt) => ({ value: opt.value, label: `${opt.label} (${counts[opt.value]})` }))
    ];
  }, [comparison.data]);

  const rows = useMemo(
    () => comparison.data.filter((item) => !statusFilter || item.status === statusFilter),
    [comparison.data, statusFilter]
  );
  const selected = useMemo(
    () => comparison.data.filter((item) => selectedKeys.includes(item.track_id)),
    [comparison.data, selectedKeys]
  );

  function radarOption(records: TrackComparisonItem[]): EChartsOption {
    const textColor = resolvedMode === "dark" ? "#c9d1d9" : "#334155";
    const gridColor = resolvedMode === "dark" ? "rgba(255, 255, 255, 0.12)" : "#e2e8f0";
    return {
      color: COMPARE_COLORS,
      tooltip: {},
      legend: { bottom: 0, textStyle: { color: textColor } },
      radar: {
        indicator: SCORE_DIMENSIONS.map((item) => ({ name: item.label, max: 10 })),
        radius: "64%",
        axisName: { color: textColor },
        splitLine: { lineStyle: { color: gridColor } },
        splitArea: { show: false },
        axisLine: { lineStyle: { color: gridColor } }
      },
      series: [
        {
          type: "radar",
          data: records.map((record) => ({ value: SCORE_DIMENSIONS.map((item) => Number(record[item.key] ?? 0)), name: record.name })),
          areaStyle: { opacity: 0.08 }
        }
      ]
    };
  }

  const columns: ColumnsType<TrackComparisonItem> = [
    {
      title: "赛道",
      dataIndex: "name",
      fixed: "left",
      width: 130,
      render: (value, record) => <Link className="track-name-link" to={`/track-discovery/tracks/${record.track_id}`}>{value}</Link>
    },
    { title: "状态", dataIndex: "status", width: 80, render: (value) => <StatusTag status={value} /> },
    // 综合分、评级、热度档位分三列：赛道卡上的合并角标适合卡片，在对比表里分不清各自含义，排序也只按综合分
    {
      title: "综合分",
      dataIndex: "overall_score",
      width: 84,
      align: "right",
      sorter: scoreSorter("overall_score"),
      defaultSortOrder: "descend",
      render: (value: number | null) =>
        value == null ? <Tag>待研究</Tag> : <span className="stock-compare-score-value strong">{formatScore(value)}</span>
    },
    {
      title: <Tooltip title="按综合分分档：S/A 优先研究、B 持续跟踪、C/D 降低关注">评级</Tooltip>,
      dataIndex: "track_grade",
      width: 64,
      align: "center",
      render: (value?: string | null) => (value ? <Tag color={gradeTagColor(value)}>{value}</Tag> : "-")
    },
    {
      title: <Tooltip title="只由资金热度决定，T0 最热">热度档位</Tooltip>,
      dataIndex: "heat_tier",
      width: 84,
      align: "center",
      render: (value?: string | null) => (value ? <Tag color={heatTierTagColor(value)}>{value}</Tag> : "-")
    },
    ...SCORE_DIMENSIONS.map((dimension) => ({
      title: dimension.label,
      dataIndex: dimension.key as string,
      // 表头字数 × 14px + 排序图标 + 内边距，再窄就折成两行
      width: dimension.label.length > 4 ? 120 : 106,
      align: "right" as const,
      sorter: scoreSorter(dimension.key),
      render: (value: number | null) => renderDimensionScore(value)
    })),
    {
      title: "产业 / 市场阶段",
      key: "phase",
      width: 120,
      render: (_, record) => `${industryPhaseLabel(record.industry_phase)} / ${marketPhaseLabel(record.market_phase)}`
    },
    { title: "主导周期", dataIndex: "headline_cycle", width: 80, render: (value) => cycleLabel(value) },
    {
      title: <Tooltip title="赛道绑定标签的 7 日资讯热度合计，与研究员打的资金热度不是一回事">资讯热度</Tooltip>,
      dataIndex: "current_heat",
      width: 106,
      align: "right",
      sorter: (a, b) => a.current_heat - b.current_heat,
      render: (value: number) => (value ? value.toFixed(1) : <Typography.Text type="secondary">0</Typography.Text>)
    },
    {
      title: "研究日期",
      dataIndex: "research_date",
      width: 104,
      sorter: (a, b) => String(a.research_date || "").localeCompare(String(b.research_date || "")),
      render: (value?: string | null) =>
        !value ? (
          <Typography.Text type="secondary">待研究</Typography.Text>
        ) : isStale(value) ? (
          <Tooltip title={`超过 ${STALE_DAYS} 天未更新研究`}>
            <Typography.Text type="secondary">{value}</Typography.Text>
          </Tooltip>
        ) : (
          value
        )
    }
  ];

  return (
    <DataPanel
      toolbar={
        <>
          <Space size={4} wrap className="toolbar-status-buttons">
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
          <div className="data-panel-toolbar-spacer" />
          <Tooltip title={selected.length < 2 ? `勾选 2–${MAX_COMPARE} 个已研究的赛道后叠加对比` : undefined}>
            <Button size="small" type="primary" ghost disabled={selected.length < 2} onClick={() => setCompareOpen(true)}>
              对比雷达{selected.length ? ` (${selected.length})` : ""}
            </Button>
          </Tooltip>
        </>
      }
    >
      {/* 勾选行高亮、排序列底色沿用标的对比的表格样式 */}
      <Table
        rowKey="track_id"
        size="small"
        className="stock-compare-table"
        loading={comparison.loading}
        dataSource={rows}
        columns={columns}
        rowSelection={{
          selectedRowKeys: selectedKeys,
          onChange: setSelectedKeys,
          // 未研究的没有分数不能比；满 MAX_COMPARE 个后其余行不可勾
          getCheckboxProps: (record) => ({
            disabled: !record.snapshot_id || (selectedKeys.length >= MAX_COMPARE && !selectedKeys.includes(record.track_id))
          })
        }}
        pagination={{ defaultPageSize: 20, showSizeChanger: false, hideOnSinglePage: true }}
        scroll={{ x: 1560 }}
        locale={{ emptyText: <EmptyAction description="暂无赛道，先在赛道库新建赛道" /> }}
      />
      <Modal
        title={`赛道对比 · ${selected.length} 个`}
        open={compareOpen && selected.length >= 2}
        onCancel={() => setCompareOpen(false)}
        footer={null}
        width={960}
        destroyOnHidden
      >
        <ReactECharts option={radarOption(selected)} style={{ height: 380 }} />
        <Table
          rowKey="track_id"
          size="small"
          pagination={false}
          dataSource={selected}
          columns={[
            {
              title: "赛道",
              dataIndex: "name",
              render: (value, _record, index) => (
                <span><i className="stock-compare-legend-dot" style={{ background: COMPARE_COLORS[index % COMPARE_COLORS.length] }} />{value}</span>
              )
            },
            { title: "综合", dataIndex: "overall_score", width: 64, align: "right", render: (value) => <span className="stock-compare-score-value strong">{formatScore(value)}</span> },
            ...SCORE_DIMENSIONS.map((dimension) => ({
              title: dimension.label,
              dataIndex: dimension.key as string,
              width: 84,
              align: "right" as const,
              render: (value: number | null) => renderDimensionScore(value)
            }))
          ]}
        />
        <div className="track-compare-texts">
          {TEXT_FIELDS.map((field) => (
            <section key={field.key}>
              <h4>{field.label}</h4>
              {selected.map((record, index) => (
                <div key={record.track_id} className="track-compare-text-row">
                  <span className="track-compare-text-name">
                    <i className="stock-compare-legend-dot" style={{ background: COMPARE_COLORS[index % COMPARE_COLORS.length] }} />
                    {record.name}
                  </span>
                  <p>{(record[field.key] as string | null) || "-"}</p>
                </div>
              ))}
            </section>
          ))}
        </div>
      </Modal>
    </DataPanel>
  );
}
