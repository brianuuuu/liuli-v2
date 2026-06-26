import { Button, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { EChartsOption } from "echarts";
import { useCallback, useEffect, useMemo, useState } from "react";
import { moduleTabs } from "../../app/navigation";
import { useLiuliTheme } from "../../app/theme";
import {
  createOrUpdatePosition,
  createPortfolio,
  createPortfolioCashFlow,
  deletePortfolio,
  deletePosition,
  getPortfolioCash,
  getPortfolioDashboard,
  getPortfolioOverview,
  listPortfolioCashFlows,
  listPortfolioValueSnapshots,
  listPortfolios,
  refreshPortfolioQuotes,
  updatePortfolio,
  updatePosition
} from "../../api/portfolio";
import { searchStocks } from "../../api/stocks";
import { ChartCard } from "../../components/charts/ChartCard";
import { chartGridColor, chartTextColor } from "../../components/charts/chartTheme";
import { EmptyAction } from "../../components/common/EmptyAction";
import { PageHeader } from "../../components/common/PageHeader";
import { WorkbenchCard } from "../../components/common/WorkbenchCard";
import { ModuleTabs } from "../../components/layout/ModuleTabs";
import { useAsyncData } from "../../hooks/useAsyncData";
import type {
  Portfolio,
  PortfolioCashFlow,
  PortfolioDashboard,
  PortfolioOverview,
  PortfolioPosition,
  PortfolioValueSnapshot,
  Stock
} from "../../types/api";

type PortfolioFormValue = {
  name: string;
  base_currency?: string;
};

type PositionFormValue = {
  stock_id: number;
  quantity: number;
};

type CashFlowFormValue = {
  flow_type: string;
  amount: number;
  flow_date?: string;
  note?: string;
};

const flowTypeLabels: Record<string, string> = {
  deposit: "入金",
  withdraw: "出金",
  adjustment: "现金校准",
  dividend: "分红",
  interest: "利息"
};

const lightAllocationColors = [
  "#2563eb",
  "#0f766e",
  "#f59e0b",
  "#7c3aed",
  "#dc2626",
  "#0891b2",
  "#65a30d",
  "#db2777",
  "#475569",
  "#ea580c",
  "#059669",
  "#9333ea"
];

const darkAllocationColors = [
  "#60a5fa",
  "#2dd4bf",
  "#fbbf24",
  "#a78bfa",
  "#f87171",
  "#22d3ee",
  "#a3e635",
  "#f472b6",
  "#94a3b8",
  "#fb923c",
  "#34d399",
  "#c084fc"
];

function allocationColorsForMode(mode: "light" | "dark") {
  return mode === "dark" ? darkAllocationColors : lightAllocationColors;
}

function tooltipBackgroundColor(mode: "light" | "dark") {
  return mode === "dark" ? "rgba(13, 17, 23, 0.96)" : "rgba(255, 255, 255, 0.96)";
}

function chartMutedTextColor(mode: "light" | "dark") {
  return mode === "dark" ? "#8b949e" : "#64748b";
}

function formatMoney(value?: number | null) {
  if (value === null || value === undefined) return "-";
  return value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPercent(value?: number | null) {
  if (value === null || value === undefined) return "-";
  return `${value.toFixed(2)}%`;
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return value.replace("T", " ").slice(0, 19);
}

function pnlColor(value?: number | null) {
  if (value === null || value === undefined || value === 0) return undefined;
  return value > 0 ? "#b42318" : "#047857";
}

function flowAmountColor(record: PortfolioCashFlow) {
  if (record.flow_type === "withdraw") return "#047857";
  if (record.flow_type === "adjustment") return undefined;
  return "#b42318";
}

function todayText() {
  return new Date().toISOString().slice(0, 10);
}

export function PortfolioPage() {
  const { resolvedMode } = useLiuliTheme();
  const [activeTab, setActiveTab] = useState("portfolios");
  const [overviewPortfolioId, setOverviewPortfolioId] = useState<number | null>(null);
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<number | null>(null);
  const [portfolioModalOpen, setPortfolioModalOpen] = useState(false);
  const [editingPortfolio, setEditingPortfolio] = useState<Portfolio | null>(null);
  const [positionModalOpen, setPositionModalOpen] = useState(false);
  const [editingPosition, setEditingPosition] = useState<PortfolioPosition | null>(null);
  const [cashFlowModalOpen, setCashFlowModalOpen] = useState(false);
  const [stockOptions, setStockOptions] = useState<{ value: number; label: string; searchText: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [portfolioForm] = Form.useForm<PortfolioFormValue>();
  const [positionForm] = Form.useForm<PositionFormValue>();
  const [cashFlowForm] = Form.useForm<CashFlowFormValue>();

  const portfolios = useAsyncData(useCallback(listPortfolios, []), []);
  const overview = useAsyncData<PortfolioOverview | null>(
    useCallback(() => getPortfolioOverview(overviewPortfolioId), [overviewPortfolioId]),
    null
  );
  const snapshots = useAsyncData<PortfolioValueSnapshot[]>(
    useCallback(() => listPortfolioValueSnapshots(overviewPortfolioId, 180), [overviewPortfolioId]),
    []
  );
  const dashboard = useAsyncData<PortfolioDashboard | null>(
    useCallback(async () => {
      if (!selectedPortfolioId) return null;
      return getPortfolioDashboard(selectedPortfolioId);
    }, [selectedPortfolioId]),
    null
  );
  const cash = useAsyncData(
    useCallback(async () => {
      if (!selectedPortfolioId) return null;
      return getPortfolioCash(selectedPortfolioId);
    }, [selectedPortfolioId]),
    null
  );
  const cashFlows = useAsyncData<PortfolioCashFlow[]>(
    useCallback(async () => {
      if (!selectedPortfolioId) return [];
      return listPortfolioCashFlows(selectedPortfolioId);
    }, [selectedPortfolioId]),
    []
  );

  useEffect(() => {
    if (selectedPortfolioId || portfolios.loading) return;
    setSelectedPortfolioId(portfolios.data[0]?.id ?? null);
  }, [portfolios.data, portfolios.loading, selectedPortfolioId]);

  const selectedPortfolio = useMemo(
    () => portfolios.data.find((item) => item.id === selectedPortfolioId) ?? null,
    [portfolios.data, selectedPortfolioId]
  );

  async function reloadAll(nextPortfolioId?: number | null) {
    await portfolios.refresh();
    if (nextPortfolioId !== undefined) {
      setSelectedPortfolioId(nextPortfolioId);
    }
    await Promise.all([overview.refresh(), snapshots.refresh(), dashboard.refresh(), cash.refresh(), cashFlows.refresh()]);
  }

  function openCreatePortfolio() {
    setEditingPortfolio(null);
    portfolioForm.setFieldsValue({ name: "", base_currency: "CNY" });
    setPortfolioModalOpen(true);
  }

  function openRenamePortfolio() {
    if (!selectedPortfolio) return;
    setEditingPortfolio(selectedPortfolio);
    portfolioForm.setFieldsValue({ name: selectedPortfolio.name, base_currency: selectedPortfolio.base_currency || "CNY" });
    setPortfolioModalOpen(true);
  }

  async function submitPortfolio() {
    const values = await portfolioForm.validateFields();
    setSaving(true);
    try {
      const saved = editingPortfolio
        ? await updatePortfolio(editingPortfolio.id, values)
        : await createPortfolio({ name: values.name, base_currency: values.base_currency || "CNY" });
      message.success(editingPortfolio ? "组合已重命名" : "组合已创建");
      setPortfolioModalOpen(false);
      await reloadAll(saved.id);
    } finally {
      setSaving(false);
    }
  }

  async function removePortfolio() {
    if (!selectedPortfolioId) return;
    try {
      await deletePortfolio(selectedPortfolioId);
      message.success("组合已删除");
      setSelectedPortfolioId(null);
      await portfolios.refresh();
    } catch (error) {
      message.error("只能删除没有持仓、分组、现金、流水、快照或复盘的空组合");
    }
  }

  function openCreatePosition() {
    setEditingPosition(null);
    positionForm.resetFields();
    setStockOptions([]);
    setPositionModalOpen(true);
  }

  function openEditPosition(record: PortfolioPosition) {
    setEditingPosition(record);
    positionForm.setFieldsValue({ stock_id: record.stock_id, quantity: record.quantity });
    setStockOptions([{ value: record.stock_id, label: `${record.stock_name || record.stock_code} ${record.stock_code || ""}`.trim(), searchText: `${record.stock_name || ""} ${record.stock_code || ""}` }]);
    setPositionModalOpen(true);
  }

  function openCashFlow(flowType = "deposit") {
    cashFlowForm.setFieldsValue({ flow_type: flowType, amount: undefined, flow_date: todayText(), note: "" });
    setCashFlowModalOpen(true);
  }

  async function searchStockOptions(keyword: string) {
    if (!keyword.trim()) {
      setStockOptions([]);
      return;
    }
    const rows = await searchStocks(keyword);
    setStockOptions(
      rows.map((item: Stock) => ({
        value: item.id,
        label: `${item.stock_name || item.name || item.stock_code || item.symbol} ${item.stock_code || item.symbol || ""}`.trim(),
        searchText: [item.stock_name, item.name, item.stock_code, item.symbol, item.name_pinyin, item.name_abbr].filter(Boolean).join(" ")
      }))
    );
  }

  async function submitPosition() {
    if (!selectedPortfolioId) return;
    const values = await positionForm.validateFields();
    setSaving(true);
    try {
      if (editingPosition) {
        await updatePosition(selectedPortfolioId, editingPosition.id, { stock_id: values.stock_id, quantity: values.quantity, status: editingPosition.status || "active" });
      } else {
        await createOrUpdatePosition(selectedPortfolioId, { stock_id: values.stock_id, quantity: values.quantity, status: "active" });
      }
      message.success(editingPosition ? "持仓已调整" : "持仓已录入");
      setPositionModalOpen(false);
      await Promise.all([dashboard.refresh(), overview.refresh(), snapshots.refresh()]);
    } finally {
      setSaving(false);
    }
  }

  async function submitCashFlow() {
    if (!selectedPortfolioId) return;
    const values = await cashFlowForm.validateFields();
    setSaving(true);
    try {
      await createPortfolioCashFlow(selectedPortfolioId, {
        flow_type: values.flow_type,
        amount: values.amount,
        flow_date: values.flow_date,
        note: values.note || null
      });
      message.success("资金流水已记录");
      setCashFlowModalOpen(false);
      await Promise.all([cash.refresh(), cashFlows.refresh(), overview.refresh(), snapshots.refresh()]);
    } finally {
      setSaving(false);
    }
  }

  async function removePosition(record: PortfolioPosition) {
    if (!selectedPortfolioId) return;
    await deletePosition(selectedPortfolioId, record.id);
    message.success("持仓已删除");
    await Promise.all([dashboard.refresh(), overview.refresh(), snapshots.refresh()]);
  }

  async function refreshQuotes() {
    if (!selectedPortfolioId) return;
    setSaving(true);
    try {
      const result = await refreshPortfolioQuotes(selectedPortfolioId);
      message.success(`实时价格已刷新：${result.updated_count} 个标的`);
      if (result.warnings.length) {
        message.warning(`有 ${result.warnings.length} 个标的未取到报价`);
      }
      await Promise.all([dashboard.refresh(), overview.refresh(), snapshots.refresh()]);
    } finally {
      setSaving(false);
    }
  }

  const positionColumns: ColumnsType<PortfolioPosition> = [
    {
      title: "标的",
      dataIndex: "stock_name",
      width: 180,
      render: (value, record) => (
        <Space size={4}>
          <Typography.Text strong>{value || record.stock_code || "-"}</Typography.Text>
          <Typography.Text type="secondary">{record.stock_code}</Typography.Text>
        </Space>
      )
    },
    { title: "股数", dataIndex: "quantity", width: 110, align: "right", render: formatMoney },
    { title: "现价", dataIndex: "current_price", width: 110, align: "right", render: formatMoney },
    { title: "昨收", dataIndex: "previous_close", width: 110, align: "right", render: formatMoney },
    { title: "市值", dataIndex: "market_value", width: 130, align: "right", render: formatMoney },
    {
      title: "当日盈亏",
      dataIndex: "day_pnl",
      width: 130,
      align: "right",
      render: (value?: number | null) => <Typography.Text style={{ color: pnlColor(value) }}>{formatMoney(value)}</Typography.Text>
    },
    {
      title: "当日涨跌幅",
      dataIndex: "day_pct",
      width: 120,
      align: "right",
      render: (value?: number | null) => <Typography.Text style={{ color: pnlColor(value) }}>{formatPercent(value)}</Typography.Text>
    },
    { title: "价格来源", dataIndex: "price_source", width: 170, render: (value) => value ? <Tag>{value}</Tag> : "-" },
    { title: "更新时间", dataIndex: "quote_time", width: 170, render: formatDateTime },
    {
      title: "操作",
      key: "actions",
      width: 130,
      render: (_, record) => (
        <Space size={4}>
          <Button size="small" type="link" onClick={() => openEditPosition(record)}>调整</Button>
          <Popconfirm title="删除这个标的？" okText="删除" cancelText="取消" onConfirm={() => removePosition(record)}>
            <Button size="small" type="link" danger>删除</Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  const cashFlowColumns: ColumnsType<PortfolioCashFlow> = [
    { title: "日期", dataIndex: "flow_date", width: 110 },
    { title: "类型", dataIndex: "flow_type", width: 120, render: (value) => flowTypeLabels[value] || value },
    {
      title: "金额",
      dataIndex: "amount",
      width: 140,
      align: "right",
      render: (value, record) => <Typography.Text style={{ color: flowAmountColor(record) }}>{formatMoney(value)}</Typography.Text>
    },
    { title: "币种", dataIndex: "currency", width: 80 },
    { title: "备注", dataIndex: "note", render: (value) => value || "-" },
    { title: "记录时间", dataIndex: "created_at", width: 170, render: formatDateTime }
  ];

  function legendFormatter(data: PortfolioOverview["pie_items"]) {
    const total = data.reduce((sum, item) => sum + item.market_value, 0);
    const values = new Map(data.map((item) => [item.label, item.market_value]));
    return (name: string) => {
      const value = values.get(name);
      if (value === undefined) return name;
      const percent = total > 0 ? (value / total) * 100 : 0;
      return `${name}  ${formatPercent(percent)}  ${formatMoney(value)}`;
    };
  }

  function pieOption(data: PortfolioOverview["pie_items"]): EChartsOption {
    const total = data.reduce((sum, item) => sum + item.market_value, 0);
    const textColor = chartTextColor(resolvedMode);
    const mutedColor = chartMutedTextColor(resolvedMode);
    const panelColor = resolvedMode === "dark" ? "#161b22" : "#ffffff";
    return {
      color: allocationColorsForMode(resolvedMode),
      tooltip: {
        trigger: "item",
        backgroundColor: tooltipBackgroundColor(resolvedMode),
        borderColor: chartGridColor(resolvedMode),
        textStyle: { color: textColor },
        formatter: (params: any) => `${params.name}<br/>市值：${formatMoney(params.value)}<br/>占比：${formatPercent(params.percent)}`
      },
      legend: {
        left: 4,
        top: "middle",
        orient: "vertical",
        itemWidth: 12,
        itemHeight: 8,
        itemGap: 12,
        formatter: legendFormatter(data),
        textStyle: { color: textColor, width: 240, overflow: "truncate" }
      },
      graphic: [
        {
          type: "text",
          left: "63%",
          top: "43%",
          style: {
            text: "持仓市值",
            fill: mutedColor,
            fontSize: 12,
            fontWeight: 500,
            textAlign: "center"
          }
        },
        {
          type: "text",
          left: "63%",
          top: "51%",
          style: {
            text: formatMoney(total),
            fill: textColor,
            fontSize: 18,
            fontWeight: 700,
            textAlign: "center"
          }
        }
      ],
      series: [
        {
          name: "市值占比",
          type: "pie",
          radius: ["46%", "70%"],
          center: ["63%", "52%"],
          avoidLabelOverlap: true,
          label: { show: false },
          labelLine: { show: false },
          itemStyle: {
            borderColor: panelColor,
            borderRadius: 4,
            borderWidth: 3
          },
          emphasis: {
            scale: true,
            scaleSize: 6,
            itemStyle: {
              shadowBlur: 14,
              shadowColor: resolvedMode === "dark" ? "rgba(0, 0, 0, 0.35)" : "rgba(15, 23, 42, 0.16)"
            }
          },
          data: data.map((item) => ({ name: item.label, value: item.market_value }))
        }
      ]
    };
  }

  function lineOption(rows: PortfolioValueSnapshot[]): EChartsOption {
    const textColor = chartTextColor(resolvedMode);
    const gridColor = chartGridColor(resolvedMode);
    return {
      color: ["#2563eb", "#10b981", "#64748b"],
      tooltip: {
        trigger: "axis",
        backgroundColor: tooltipBackgroundColor(resolvedMode),
        borderColor: gridColor,
        textStyle: { color: textColor },
        valueFormatter: (value) => formatMoney(Number(value))
      },
      legend: {
        top: 0,
        textStyle: { color: textColor }
      },
      grid: { top: 38, left: 54, right: 18, bottom: 34 },
      xAxis: {
        type: "category",
        data: rows.map((item) => item.snapshot_date),
        axisLabel: { color: textColor },
        axisLine: { lineStyle: { color: gridColor } },
        axisTick: { show: false }
      },
      yAxis: {
        type: "value",
        axisLabel: { color: textColor, formatter: (value: number) => `${Math.round(value / 10000)}万` },
        splitLine: { lineStyle: { color: gridColor } }
      },
      series: [
        {
          name: "总市值",
          type: "line",
          smooth: true,
          showSymbol: false,
          lineStyle: { width: 3 },
          areaStyle: { color: resolvedMode === "dark" ? "rgba(96, 165, 250, 0.10)" : "rgba(37, 99, 235, 0.08)" },
          data: rows.map((item) => item.total_value)
        },
        { name: "持仓市值", type: "line", smooth: true, showSymbol: false, lineStyle: { width: 2 }, data: rows.map((item) => item.position_market_value) },
        { name: "现金", type: "line", smooth: true, showSymbol: false, lineStyle: { width: 2, type: "dashed" }, data: rows.map((item) => item.cash_amount) }
      ]
    };
  }

  function renderMetrics(summary?: PortfolioOverview["summary"]) {
    return (
      <div className="portfolio-summary metric-grid">
        <div className="metric-panel"><div className="metric-panel-label">总市值</div><div className="metric-panel-value">{formatMoney(summary?.total_value)}</div></div>
        <div className="metric-panel"><div className="metric-panel-label">持仓市值</div><div className="metric-panel-value">{formatMoney(summary?.position_market_value)}</div></div>
        <div className="metric-panel"><div className="metric-panel-label">现金余额</div><div className="metric-panel-value">{formatMoney(summary?.cash_amount)}</div></div>
        <div className="metric-panel"><div className="metric-panel-label">年度盈亏</div><div className="metric-panel-value" style={{ color: pnlColor(summary?.year_pnl) }}>{formatMoney(summary?.year_pnl)}</div></div>
      </div>
    );
  }

  function renderOverview() {
    const data = overview.data;
    return (
      <div className="portfolio-dashboard portfolio-overview">
        <WorkbenchCard>
          <Space wrap>
            <Select
              style={{ width: 260 }}
              value={overviewPortfolioId ?? 0}
              options={[
                { value: 0, label: "所有组合" },
                ...portfolios.data.map((item) => ({ value: item.id, label: item.name }))
              ]}
              onChange={(value) => setOverviewPortfolioId(value === 0 ? null : value)}
            />
            <Button onClick={() => Promise.all([overview.refresh(), snapshots.refresh()])}>刷新看板</Button>
            <Tag>{overviewPortfolioId ? "单组合" : "所有组合"}</Tag>
          </Space>
        </WorkbenchCard>
        {renderMetrics(data?.summary)}
        <div className="portfolio-overview-grid">
          {data?.pie_items?.length ? (
            <ChartCard title="标的市值占比" option={pieOption(data.pie_items)} height={320} />
          ) : (
            <WorkbenchCard title="标的市值占比"><EmptyAction description="暂无持仓标的数据" /></WorkbenchCard>
          )}
          {snapshots.data.length ? (
            <ChartCard title="组合市值曲线" option={lineOption(snapshots.data)} height={320} />
          ) : (
            <WorkbenchCard title="组合市值曲线"><EmptyAction description="暂无市值快照，任务中心每日 17:00 生成后显示" /></WorkbenchCard>
          )}
        </div>
      </div>
    );
  }

  function renderPositions() {
    if (!selectedPortfolioId) {
      return <WorkbenchCard><EmptyAction description="暂无组合，请先新建组合" /></WorkbenchCard>;
    }
    const summary = dashboard.data?.summary;
    return (
      <div className="portfolio-dashboard">
        <WorkbenchCard>
          <Space wrap>
            <Select
              style={{ width: 260 }}
              placeholder="选择组合"
              value={selectedPortfolioId ?? undefined}
              loading={portfolios.loading}
              options={portfolios.data.map((item) => ({ value: item.id, label: item.name }))}
              onChange={setSelectedPortfolioId}
            />
            <Button onClick={openCreatePortfolio}>新建组合</Button>
            <Button disabled={!selectedPortfolio} onClick={openRenamePortfolio}>重命名</Button>
            <Popconfirm title="删除组合？仅空组合可删除" okText="删除组合" cancelText="取消" onConfirm={removePortfolio}>
              <Button disabled={!selectedPortfolio} danger>删除组合</Button>
            </Popconfirm>
            {selectedPortfolio ? <Tag>{selectedPortfolio.base_currency}</Tag> : null}
          </Space>
        </WorkbenchCard>
        <div className="portfolio-summary metric-grid">
          <div className="metric-panel"><div className="metric-panel-label">当前市值</div><div className="metric-panel-value">{formatMoney(summary?.market_value)}</div></div>
          <div className="metric-panel"><div className="metric-panel-label">现金余额</div><div className="metric-panel-value">{formatMoney(cash.data?.amount)}</div></div>
          <div className="metric-panel"><div className="metric-panel-label">当日盈亏</div><div className="metric-panel-value" style={{ color: pnlColor(summary?.day_pnl) }}>{formatMoney(summary?.day_pnl)}</div></div>
          <div className="metric-panel"><div className="metric-panel-label">当日涨跌幅</div><div className="metric-panel-value" style={{ color: pnlColor(summary?.day_pct) }}>{formatPercent(summary?.day_pct)}</div></div>
        </div>
        <WorkbenchCard
          title="实盘持仓"
          extra={(
            <Space wrap>
              <Button onClick={() => openCashFlow("deposit")}>入金</Button>
              <Button onClick={() => openCashFlow("withdraw")}>出金</Button>
              <Button onClick={() => openCashFlow("adjustment")}>现金校准</Button>
              <Button onClick={openCreatePosition}>新增持仓</Button>
              <Button onClick={refreshQuotes} loading={saving}>刷新当前组合</Button>
            </Space>
          )}
        >
          <Table
            rowKey="id"
            size="small"
            loading={dashboard.loading}
            dataSource={dashboard.data?.positions ?? []}
            columns={positionColumns}
            locale={{ emptyText: <EmptyAction description="暂无实盘持仓，请新增持仓" /> }}
            pagination={false}
          />
        </WorkbenchCard>
      </div>
    );
  }

  function renderTrades() {
    if (!selectedPortfolioId) {
      return <WorkbenchCard><EmptyAction description="暂无组合，请先新建组合" /></WorkbenchCard>;
    }
    return (
      <div className="portfolio-dashboard">
        <WorkbenchCard
          title="资金流水"
          extra={(
            <Space wrap>
              <Button onClick={() => openCashFlow("deposit")}>入金</Button>
              <Button onClick={() => openCashFlow("withdraw")}>出金</Button>
              <Button onClick={() => openCashFlow("adjustment")}>现金校准</Button>
            </Space>
          )}
        >
          <Table
            rowKey="id"
            size="small"
            loading={cashFlows.loading}
            dataSource={cashFlows.data}
            columns={cashFlowColumns}
            locale={{ emptyText: <EmptyAction description="暂无出入金记录" /> }}
            pagination={{ pageSize: 20 }}
          />
        </WorkbenchCard>
        <WorkbenchCard title="持仓调整">
          <EmptyAction description="买入、卖出和调仓理由后续接入；当前先归档资金流水" />
        </WorkbenchCard>
      </div>
    );
  }

  function renderReview() {
    const summary = overview.data?.summary;
    return (
      <div className="portfolio-dashboard">
        {renderMetrics(summary)}
        <WorkbenchCard title="组合复盘">
          <EmptyAction description="暂无组合复盘；可结合市值快照和出入金流水分析年度盈亏" />
        </WorkbenchCard>
      </div>
    );
  }

  function renderContent() {
    if (activeTab === "portfolios") return renderOverview();
    if (activeTab === "positions") return renderPositions();
    if (activeTab === "risk") return renderTrades();
    return renderReview();
  }

  return (
    <>
      <PageHeader title="组合管理" description="实盘 / 现金 / 快照 / 复盘" />
      <ModuleTabs activeKey={activeTab} items={moduleTabs.portfolio} onChange={setActiveTab} />
      {renderContent()}
      <Modal title={editingPortfolio ? "重命名组合" : "新建组合"} open={portfolioModalOpen} onCancel={() => setPortfolioModalOpen(false)} onOk={submitPortfolio} confirmLoading={saving} destroyOnClose>
        <Form form={portfolioForm} layout="vertical" initialValues={{ base_currency: "CNY" }}>
          <Form.Item name="name" label="组合名称" rules={[{ required: true, message: "请输入组合名称" }]}>
            <Input placeholder="例如：主实盘" />
          </Form.Item>
          <Form.Item name="base_currency" label="基准货币">
            <Input placeholder="CNY" />
          </Form.Item>
        </Form>
      </Modal>
      <Modal title={editingPosition ? "调整股数" : "新增持仓"} open={positionModalOpen} onCancel={() => setPositionModalOpen(false)} onOk={submitPosition} confirmLoading={saving} destroyOnClose>
        <Form form={positionForm} layout="vertical">
          <Form.Item name="stock_id" label="标的" rules={[{ required: true, message: "请选择标的" }]}>
            <Select
              showSearch
              disabled={Boolean(editingPosition)}
              placeholder="请选择标的"
              filterOption={(input, option) => String(option?.searchText || option?.label || "").toLowerCase().includes(input.toLowerCase())}
              onSearch={searchStockOptions}
              options={stockOptions}
            />
          </Form.Item>
          <Form.Item name="quantity" label="股数" rules={[{ required: true, message: "请输入股数" }]}>
            <InputNumber min={0} precision={2} style={{ width: "100%" }} />
          </Form.Item>
        </Form>
      </Modal>
      <Modal title="记录资金流水" open={cashFlowModalOpen} onCancel={() => setCashFlowModalOpen(false)} onOk={submitCashFlow} confirmLoading={saving} destroyOnClose>
        <Form form={cashFlowForm} layout="vertical">
          <Form.Item name="flow_type" label="类型" rules={[{ required: true, message: "请选择类型" }]}>
            <Select
              options={[
                { value: "deposit", label: "入金" },
                { value: "withdraw", label: "出金" },
                { value: "adjustment", label: "现金校准" },
                { value: "dividend", label: "分红" },
                { value: "interest", label: "利息" }
              ]}
            />
          </Form.Item>
          <Form.Item name="amount" label="金额" rules={[{ required: true, message: "请输入金额" }]}>
            <InputNumber min={0} precision={2} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="flow_date" label="日期">
            <Input placeholder="YYYY-MM-DD" />
          </Form.Item>
          <Form.Item name="note" label="备注">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
