import { ReloadOutlined } from "@ant-design/icons";
import { Button, Form, Input, InputNumber, Modal, Popconfirm, Segmented, Select, Space, Switch, Table, Tag, Tooltip, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { EChartsOption } from "echarts";
import { useCallback, useEffect, useMemo, useState } from "react";
import { moduleTabs } from "../../app/navigation";
import { useLiuliTheme } from "../../app/theme";
import {
  createPortfolio,
  createPortfolioCashFlow,
  deletePortfolio,
  deletePosition,
  getPortfolioDashboard,
  getPortfolioOverview,
  listAdjustAdviceCandidates,
  listPortfolioCashFlows,
  listPortfolioPositionChanges,
  listPortfolioValueSnapshots,
  listPortfolios,
  refreshAllPortfolioQuotes,
  recordPortfolioTrade,
  refreshPortfolioQuotes,
  updatePortfolio
} from "../../api/portfolio";
import { searchStocks } from "../../api/stocks";
import { ChartCard } from "../../components/charts/ChartCard";
import { chartGridColor, chartTextColor } from "../../components/charts/chartTheme";
import { EmptyAction } from "../../components/common/EmptyAction";
import { PageHeader } from "../../components/common/PageHeader";
import { WorkbenchCard } from "../../components/common/WorkbenchCard";
import { ModuleTabs } from "../../components/layout/ModuleTabs";
import { useAsyncData } from "../../hooks/useAsyncData";
import { PerformanceReview, type ReviewPeriod } from "./PerformanceReview";
import { PortfolioScopeBar } from "./PortfolioScopeBar";
import { TradeReview } from "./TradeReview";
import { formatPercent, pnlColor, tooltipBackgroundColor } from "./portfolioFormat";
import { adviceActionLabels, reasonTypeLabels, reasonTypeOptions } from "./positionChangeLabels";
import type {
  AdjustAdviceCandidate,
  Portfolio,
  PortfolioCashFlow,
  PortfolioDashboard,
  PortfolioOverview,
  PortfolioPosition,
  PortfolioPositionChange,
  PortfolioValueSnapshot,
  PositionChangeReasonType,
  Stock
} from "../../types/api";

type PortfolioFormValue = {
  name: string;
  base_currency?: string;
};

type PositionFormValue = {
  portfolio_id?: number;
  stock_id: number;
  quantity: number;
  change_date?: string;
  change_note?: string;
  change_price?: number | null;
  change_reason_type?: PositionChangeReasonType;
  change_advice_item_id?: number;
  change_sync_cash?: boolean;
};

type TradesView = "changes" | "cash";

type CashFlowFormValue = {
  portfolio_id?: number;
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
  interest: "利息",
  trade: "调仓"
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

function chartMutedTextColor(mode: "light" | "dark") {
  return mode === "dark" ? "#8b949e" : "#64748b";
}

function formatMoney(value?: number | null) {
  if (value === null || value === undefined) return "-";
  return value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return value.replace("T", " ").slice(0, 19);
}

/** 股数是整数，不套金额的两位小数格式 */
function formatShares(value?: number | null) {
  if (value === null || value === undefined) return "-";
  return value.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}

/** 记录时间只到分钟，作为次要信息 */
function formatRecordTime(value?: string | null) {
  if (!value) return "-";
  return value.replace("T", " ").slice(0, 16);
}

/**
 * 资金流水金额的显示：入金、分红、利息为 +，出金为 −，调仓按存储的符号（买入为负）；
 * 现金校准记的是校准后的余额而不是变动额，写成"= 余额"，不和变动额混看。
 */
function flowAmountText(record: PortfolioCashFlow) {
  if (record.flow_type === "adjustment") return `= ${formatMoney(record.amount)}`;
  const signed = record.flow_type === "withdraw" ? -Math.abs(record.amount) : record.flow_type === "trade" ? record.amount : Math.abs(record.amount);
  return `${signed > 0 ? "+" : signed < 0 ? "−" : ""}${formatMoney(Math.abs(signed))}`;
}

function flowAmountColor(record: PortfolioCashFlow) {
  if (record.flow_type === "withdraw") return "var(--ll-down)";
  if (record.flow_type === "adjustment") return undefined;
  // 调仓同步的现金流水带符号：买入扣现金为负，卖出回笼现金为正
  if (record.flow_type === "trade" && record.amount < 0) return "var(--ll-down)";
  return "var(--ll-up)";
}

function todayText() {
  return new Date().toISOString().slice(0, 10);
}

export function PortfolioPage() {
  const { resolvedMode } = useLiuliTheme();
  const [activeTab, setActiveTab] = useState("portfolios");
  const [overviewPortfolioId, setOverviewPortfolioId] = useState<number | null>(null);
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<number | null>(null);
  const [reviewPortfolioId, setReviewPortfolioId] = useState<number | null>(null);
  const [reviewPeriod, setReviewPeriod] = useState<ReviewPeriod>("year");
  const [tradesView, setTradesView] = useState<TradesView>("changes");
  const [portfolioModalOpen, setPortfolioModalOpen] = useState(false);
  const [editingPortfolio, setEditingPortfolio] = useState<Portfolio | null>(null);
  const [positionModalOpen, setPositionModalOpen] = useState(false);
  const [editingPosition, setEditingPosition] = useState<PortfolioPosition | null>(null);
  const [cashFlowModalOpen, setCashFlowModalOpen] = useState(false);
  const [stockOptions, setStockOptions] = useState<{ value: number; label: string; searchText: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [portfolioForm] = Form.useForm<PortfolioFormValue>();
  const [positionForm] = Form.useForm<PositionFormValue>();
  const [adviceCandidates, setAdviceCandidates] = useState<AdjustAdviceCandidate[]>([]);
  const watchedStockId = Form.useWatch("stock_id", positionForm);
  const watchedChangeDate = Form.useWatch("change_date", positionForm);
  const watchedReasonType = Form.useWatch("change_reason_type", positionForm);
  const watchedPositionPortfolioId = Form.useWatch("portfolio_id", positionForm);
  const watchedQuantity = Form.useWatch("quantity", positionForm);
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
  // 实盘持仓与调仓记录共用：null 表示所有组合
  const dashboard = useAsyncData<PortfolioDashboard | null>(
    useCallback(() => getPortfolioDashboard(selectedPortfolioId), [selectedPortfolioId]),
    null
  );
  const cashFlows = useAsyncData<PortfolioCashFlow[]>(
    useCallback(() => listPortfolioCashFlows(selectedPortfolioId), [selectedPortfolioId]),
    []
  );
  const positionChanges = useAsyncData<PortfolioPositionChange[]>(
    useCallback(() => listPortfolioPositionChanges(selectedPortfolioId), [selectedPortfolioId]),
    []
  );

  useEffect(() => {
    if (!positionModalOpen || watchedReasonType !== "ai_advice" || !watchedStockId) {
      setAdviceCandidates([]);
      return;
    }
    const changeDate = /^\d{4}-\d{2}-\d{2}$/.test(watchedChangeDate || "") ? watchedChangeDate : null;
    let cancelled = false;
    const portfolioId = editingPosition?.portfolio_id ?? watchedPositionPortfolioId ?? selectedPortfolioId;
    listAdjustAdviceCandidates(watchedStockId, changeDate, portfolioId).then((rows) => {
      if (!cancelled) setAdviceCandidates(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [positionModalOpen, watchedReasonType, watchedStockId, watchedChangeDate, watchedPositionPortfolioId, editingPosition, selectedPortfolioId]);

  const selectedPortfolio = useMemo(
    () => portfolios.data.find((item) => item.id === selectedPortfolioId) ?? null,
    [portfolios.data, selectedPortfolioId]
  );
  const portfolioNames = useMemo(() => new Map(portfolios.data.map((item) => [item.id, item.name])), [portfolios.data]);
  // 组合切换条的选项；"所有组合"由切换条自己补在最前
  const portfolioOptions = useMemo(() => portfolios.data.map((item) => ({ value: item.id, label: item.name })), [portfolios.data]);

  async function reloadAll(nextPortfolioId?: number | null) {
    await portfolios.refresh();
    if (nextPortfolioId !== undefined) {
      setSelectedPortfolioId(nextPortfolioId);
    }
    await Promise.all([overview.refresh(), snapshots.refresh(), dashboard.refresh(), cashFlows.refresh(), positionChanges.refresh()]);
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
    positionForm.setFieldsValue({ change_sync_cash: true });
    setStockOptions([]);
    setPositionModalOpen(true);
  }

  function openEditPosition(record: PortfolioPosition) {
    setEditingPosition(record);
    positionForm.setFieldsValue({ stock_id: record.stock_id, quantity: record.quantity, change_sync_cash: true });
    setStockOptions([{ value: record.stock_id, label: `${record.stock_name || record.stock_code} ${record.stock_code || ""}`.trim(), searchText: `${record.stock_name || ""} ${record.stock_code || ""}` }]);
    setPositionModalOpen(true);
  }

  function openCashFlow(flowType = "deposit") {
    cashFlowForm.setFieldsValue({ portfolio_id: undefined, flow_type: flowType, amount: undefined, flow_date: todayText(), note: "" });
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
    const values = await positionForm.validateFields();
    const portfolioId = editingPosition?.portfolio_id ?? selectedPortfolioId ?? values.portfolio_id;
    if (!portfolioId) return;
    setSaving(true);
    try {
      // 表单填的是调整后总数，换算成相对最新持仓的一笔增量调仓；
      // 现有股数现取，不用页面缓存，手机上刚记过的调仓也算得对
      const latest = await getPortfolioDashboard(portfolioId);
      const held = latest.positions.find((item) => item.stock_id === values.stock_id)?.quantity ?? 0;
      const delta = Number(values.quantity) - Number(held);
      if (delta === 0) {
        message.info("股数没有变化");
        return;
      }
      const corporateAction = values.change_reason_type === "corporate_action";
      await recordPortfolioTrade(portfolioId, {
        stock_id: values.stock_id,
        side: Number(values.quantity) === 0 ? "close" : delta > 0 ? "buy" : "sell",
        quantity: Number(values.quantity) === 0 ? null : Math.abs(delta),
        price: corporateAction ? null : values.change_price ?? null,
        trade_date: values.change_date || null,
        reason_type: values.change_reason_type || null,
        advice_item_id: values.change_reason_type === "ai_advice" ? values.change_advice_item_id ?? null : null,
        sync_cash: !corporateAction && Boolean(values.change_sync_cash),
        note: values.change_note || null
      });
      message.success(editingPosition ? "持仓已调整" : "持仓已录入");
      setPositionModalOpen(false);
      await Promise.all([dashboard.refresh(), overview.refresh(), snapshots.refresh(), positionChanges.refresh(), cashFlows.refresh()]);
    } catch (error) {
      const detail = (error as { response?: { data?: { detail?: unknown } } }).response?.data?.detail;
      message.error(typeof detail === "string" ? `保存失败：${detail}` : "保存失败，请重试");
    } finally {
      setSaving(false);
    }
  }

  // 只列与本次加减方向一致的建议：加仓对应增持，减仓和清仓对应减持；方向未定时全列
  const formPortfolioId = editingPosition?.portfolio_id ?? selectedPortfolioId ?? watchedPositionPortfolioId;
  const heldQuantity = dashboard.data?.positions.find((item) => item.portfolio_id === formPortfolioId && item.stock_id === watchedStockId)?.quantity ?? 0;
  const adviceDirection = watchedQuantity === undefined || watchedQuantity === null || Number(watchedQuantity) === Number(heldQuantity)
    ? null
    : Number(watchedQuantity) > Number(heldQuantity) ? "add" : "reduce";
  const directionalCandidates = adviceDirection ? adviceCandidates.filter((item) => item.action === adviceDirection) : adviceCandidates;

  function selectAdviceCandidate(id?: number) {
    const candidate = adviceCandidates.find((item) => item.id === id);
    if (candidate?.core_logic && !positionForm.getFieldValue("change_note")) {
      positionForm.setFieldsValue({ change_note: candidate.core_logic });
    }
  }

  async function submitCashFlow() {
    const values = await cashFlowForm.validateFields();
    const portfolioId = selectedPortfolioId ?? values.portfolio_id;
    if (!portfolioId) return;
    setSaving(true);
    try {
      await createPortfolioCashFlow(portfolioId, {
        flow_type: values.flow_type,
        amount: values.amount,
        flow_date: values.flow_date,
        note: values.note || null
      });
      message.success("资金流水已记录");
      setCashFlowModalOpen(false);
      await Promise.all([dashboard.refresh(), cashFlows.refresh(), overview.refresh(), snapshots.refresh()]);
    } finally {
      setSaving(false);
    }
  }

  async function removePosition(record: PortfolioPosition) {
    await deletePosition(record.portfolio_id, record.id);
    message.success("持仓已删除");
    await Promise.all([dashboard.refresh(), overview.refresh(), snapshots.refresh(), positionChanges.refresh()]);
  }

  async function refreshQuotes() {
    setSaving(true);
    try {
      const result = selectedPortfolioId ? await refreshPortfolioQuotes(selectedPortfolioId) : await refreshAllPortfolioQuotes();
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
    { title: "日期", dataIndex: "flow_date", width: 104 },
    { title: "类型", dataIndex: "flow_type", width: 96, render: (value) => flowTypeLabels[value] || value },
    {
      title: <Tooltip title="现金校准显示的是校准后的余额（= 号），其余为变动额">金额</Tooltip>,
      dataIndex: "amount",
      width: 140,
      align: "right",
      render: (_, record) => <Typography.Text style={{ color: flowAmountColor(record) }}>{flowAmountText(record)}</Typography.Text>
    },
    { title: "备注", dataIndex: "note", ellipsis: true, render: (value) => value || null },
    { title: "记录时间", dataIndex: "created_at", width: 132, render: (value) => <span className="record-time">{formatRecordTime(value)}</span> }
  ];
  // 与调仓复盘的调仓来源表同一套写法：来源用普通文字、增减不上红绿、估算价灰字、关联建议用完整日期
  const positionChangeColumns: ColumnsType<PortfolioPositionChange> = [
    { title: "日期", dataIndex: "change_date", width: 104 },
    {
      title: "标的",
      dataIndex: "stock_name",
      width: 200,
      render: (value, record) => (
        <span className="review-stock">
          {value || record.stock_code || record.stock_id}
          {record.stock_code && value ? <small>{record.stock_code}</small> : null}
        </span>
      )
    },
    { title: "调整前", dataIndex: "quantity_before", width: 88, align: "right", render: formatShares },
    { title: "调整后", dataIndex: "quantity_after", width: 88, align: "right", render: formatShares },
    {
      title: "增减",
      dataIndex: "quantity_delta",
      width: 88,
      align: "right",
      render: (value: number) => `${value > 0 ? "+" : "−"}${formatShares(Math.abs(value))}`
    },
    {
      title: <Tooltip title="灰色为未填成交价、按调仓日收盘价估算">成交价</Tooltip>,
      dataIndex: "price",
      width: 88,
      align: "right",
      render: (value: number | null | undefined, record) =>
        value === null || value === undefined ? <Typography.Text type="secondary">-</Typography.Text> : record.price_source === "estimated" ? (
          <Tooltip title="未填成交价，按调仓日收盘价估算">
            <span className="estimated-price">{formatMoney(value)}</span>
          </Tooltip>
        ) : formatMoney(value)
    },
    {
      title: "来源",
      dataIndex: "reason_type",
      width: 88,
      render: (value: string | null | undefined) => (value ? reasonTypeLabels[value] || value : <Tag>未标注</Tag>)
    },
    {
      title: "关联建议",
      dataIndex: "advice_target_trade_date",
      width: 104,
      render: (value?: string | null) => value ?? <Typography.Text type="secondary">-</Typography.Text>
    },
    {
      title: "调仓理由",
      dataIndex: "note",
      ellipsis: { showTitle: false },
      render: (value?: string | null) => (value ? <Tooltip title={value} placement="topLeft">{value}</Tooltip> : null)
    },
    { title: "记录时间", dataIndex: "created_at", width: 132, render: (value) => <span className="record-time">{formatRecordTime(value)}</span> }
  ];

  // 所有组合时在第二列标出每行属于哪个组合
  function withPortfolioColumn<T extends { portfolio_id: number }>(columns: ColumnsType<T>): ColumnsType<T> {
    if (selectedPortfolioId) return columns;
    const portfolioColumn: ColumnsType<T>[number] = {
      title: "组合",
      dataIndex: "portfolio_id",
      width: 110,
      render: (value: number) => <span style={{ whiteSpace: "nowrap" }}>{portfolioNames.get(value) || value}</span>
    };
    return [columns[0], portfolioColumn, ...columns.slice(1)];
  }

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
            align: "center"
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
            align: "center"
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
    const dark = resolvedMode === "dark";
    // 验证过的分类色槽 1/2，与控制台图表同一套
    const seriesBlue = dark ? "#2f7ad0" : "#256abf";
    const seriesOrange = dark ? "#d95926" : "#eb6834";
    // 市值常年在一个很窄的区间里走，坐标轴贴着实际区间才看得出起伏；刻度落在整万就不带小数
    const wanLabel = (value: number) => {
      const wan = value / 10000;
      return `${Math.abs(wan - Math.round(wan)) < 1e-6 ? wan.toFixed(0) : wan.toFixed(1)}万`;
    };
    return {
      color: [seriesBlue, seriesOrange],
      tooltip: {
        trigger: "axis",
        backgroundColor: tooltipBackgroundColor(resolvedMode),
        borderColor: gridColor,
        textStyle: { color: textColor },
        axisPointer: { type: "line", lineStyle: { color: gridColor, width: 1 } },
        valueFormatter: (value) => formatMoney(Number(value))
      },
      legend: {
        top: 0,
        itemWidth: 14,
        itemHeight: 8,
        textStyle: { color: textColor }
      },
      grid: { top: 38, left: 54, right: 18, bottom: 34 },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: rows.map((item) => item.snapshot_date),
        axisLabel: { color: textColor },
        axisLine: { lineStyle: { color: gridColor } },
        axisTick: { show: false }
      },
      yAxis: {
        type: "value",
        scale: true,
        axisLabel: { color: textColor, formatter: (value: number) => wanLabel(value) },
        splitLine: { lineStyle: { color: gridColor } }
      },
      series: [
        {
          name: "总市值",
          type: "line",
          smooth: false,
          showSymbol: false,
          lineStyle: { width: 2, cap: "round", join: "round" },
          data: rows.map((item) => item.total_value)
        },
        {
          name: "持仓市值",
          type: "line",
          smooth: false,
          showSymbol: false,
          lineStyle: { width: 2, cap: "round", join: "round" },
          data: rows.map((item) => item.position_market_value)
        }
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
        <PortfolioScopeBar
          value={overviewPortfolioId}
          options={portfolioOptions}
          onChange={setOverviewPortfolioId}
          extra={(
            <Tooltip title="刷新看板">
              <Button size="small" type="text" aria-label="刷新看板" icon={<ReloadOutlined />} onClick={() => Promise.all([overview.refresh(), snapshots.refresh()])} />
            </Tooltip>
          )}
        />
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
    if (!portfolios.loading && !portfolios.data.length) {
      return <WorkbenchCard><EmptyAction description="暂无组合，请先新建组合" /></WorkbenchCard>;
    }
    const summary = dashboard.data?.summary;
    return (
      <div className="portfolio-dashboard">
        <PortfolioScopeBar
          value={selectedPortfolioId}
          options={portfolioOptions}
          onChange={setSelectedPortfolioId}
          extra={(
            <Space size={6}>
              <Button size="small" onClick={openCreatePortfolio}>新建组合</Button>
              <Button size="small" disabled={!selectedPortfolio} onClick={openRenamePortfolio}>重命名</Button>
              <Popconfirm title="删除组合？仅空组合可删除" okText="删除组合" cancelText="取消" onConfirm={removePortfolio}>
                <Button size="small" disabled={!selectedPortfolio} danger>删除组合</Button>
              </Popconfirm>
            </Space>
          )}
        />
        <div className="portfolio-summary metric-grid">
          <div className="metric-panel"><div className="metric-panel-label">当前市值</div><div className="metric-panel-value">{formatMoney(summary?.market_value)}</div></div>
          <div className="metric-panel"><div className="metric-panel-label">现金余额</div><div className="metric-panel-value">{formatMoney(summary?.cash_amount)}</div></div>
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
              <Button onClick={refreshQuotes} loading={saving}>{selectedPortfolioId ? "刷新当前组合" : "刷新所有组合"}</Button>
            </Space>
          )}
        >
          <Table
            rowKey="id"
            size="small"
            loading={dashboard.loading}
            dataSource={dashboard.data?.positions ?? []}
            columns={withPortfolioColumn(positionColumns)}
            locale={{ emptyText: <EmptyAction description="暂无实盘持仓，请新增持仓" /> }}
            pagination={false}
          />
        </WorkbenchCard>
      </div>
    );
  }

  function renderTrades() {
    if (!portfolios.loading && !portfolios.data.length) {
      return <WorkbenchCard><EmptyAction description="暂无组合，请先新建组合" /></WorkbenchCard>;
    }
    const views: { value: TradesView; label: string; count: number }[] = [
      { value: "changes", label: "持仓调整", count: positionChanges.data.length },
      { value: "cash", label: "资金流水", count: cashFlows.data.length }
    ];
    return (
      <div className="portfolio-dashboard">
        <PortfolioScopeBar value={selectedPortfolioId} options={portfolioOptions} onChange={setSelectedPortfolioId} />
        {/* 本页叫调仓记录，持仓调整在前；两张表合成一个框、顶栏切换，与调仓复盘统计区同一写法 */}
        <section className="tabbed-table-panel">
          <div className="data-panel-toolbar tabbed-table-toolbar">
            <Space size={4} className="toolbar-status-buttons">
              {views.map((item) => (
                <Button
                  key={item.value}
                  size="small"
                  className={tradesView === item.value ? "toolbar-filter-button active" : "toolbar-filter-button"}
                  onClick={() => setTradesView(item.value)}
                >
                  {item.label} ({item.count})
                </Button>
              ))}
            </Space>
            {tradesView === "cash" ? (
              <Space size={6} className="tabbed-table-actions">
                <Button size="small" autoInsertSpace={false} onClick={() => openCashFlow("deposit")}>入金</Button>
                <Button size="small" autoInsertSpace={false} onClick={() => openCashFlow("withdraw")}>出金</Button>
                <Button size="small" onClick={() => openCashFlow("adjustment")}>现金校准</Button>
              </Space>
            ) : null}
          </div>
          {tradesView === "changes" ? (
            <Table
              rowKey="id"
              size="small"
              loading={positionChanges.loading}
              dataSource={positionChanges.data}
              columns={withPortfolioColumn(positionChangeColumns)}
              locale={{ emptyText: "暂无调仓记录；在实盘持仓页调整股数后会自动留痕" }}
              pagination={{ defaultPageSize: 10, showSizeChanger: false, hideOnSinglePage: true }}
            />
          ) : (
            <Table
              rowKey="id"
              size="small"
              loading={cashFlows.loading}
              dataSource={cashFlows.data}
              columns={withPortfolioColumn(cashFlowColumns)}
              locale={{ emptyText: "暂无资金流水" }}
              pagination={{ defaultPageSize: 10, showSizeChanger: false, hideOnSinglePage: true }}
            />
          )}
        </section>
      </div>
    );
  }

  function renderPerformance() {
    return (
      <PerformanceReview
        portfolioId={reviewPortfolioId}
        portfolioOptions={portfolioOptions}
        onPortfolioChange={setReviewPortfolioId}
        period={reviewPeriod}
        onPeriodChange={setReviewPeriod}
      />
    );
  }

  function renderReview() {
    return (
      <TradeReview
        portfolioId={reviewPortfolioId}
        portfolioOptions={portfolioOptions}
        onPortfolioChange={setReviewPortfolioId}
      />
    );
  }

  function renderContent() {
    if (activeTab === "portfolios") return renderOverview();
    if (activeTab === "performance") return renderPerformance();
    if (activeTab === "positions") return renderPositions();
    if (activeTab === "risk") return renderTrades();
    return renderReview();
  }

  return (
    <>
      <PageHeader title="组合管理" description="实盘 / 收益 / 调仓 / 复盘" />
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
      <Modal title={editingPosition ? `调整股数 · ${portfolioNames.get(editingPosition.portfolio_id) || ""}` : "新增持仓"} open={positionModalOpen} onCancel={() => setPositionModalOpen(false)} onOk={submitPosition} confirmLoading={saving} destroyOnClose>
        <Form form={positionForm} layout="vertical">
          {!selectedPortfolioId && !editingPosition ? (
            <Form.Item name="portfolio_id" label="组合" rules={[{ required: true, message: "请选择组合" }]}>
              <Select placeholder="请选择组合" options={portfolios.data.map((item) => ({ value: item.id, label: item.name }))} />
            </Form.Item>
          ) : null}
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
          <Form.Item name="change_date" label="调仓日期" extra="留空按今天记录">
            <Input placeholder="YYYY-MM-DD" />
          </Form.Item>
          <Form.Item
            name="change_price"
            label="调仓价格"
            extra={
              watchedReasonType === "corporate_action"
                ? "公司行为不记价格"
                : `留空按调仓日收盘价估算${editingPosition?.current_price ? `，现价 ${formatMoney(editingPosition.current_price)}` : ""}`
            }
          >
            <InputNumber min={0} precision={3} style={{ width: "100%" }} disabled={watchedReasonType === "corporate_action"} placeholder="实际成交价，选填" />
          </Form.Item>
          {watchedReasonType === "corporate_action" ? null : (
            <Form.Item name="change_sync_cash" label="同步现金" valuePropName="checked" extra="按 变动股数 × 调仓价格 增减现金余额；手续费、税费等误差仍靠现金校准">
              <Switch />
            </Form.Item>
          )}
          <Form.Item name="change_reason_type" label="理由来源">
            <Select allowClear placeholder="选填，用于复盘对比 AI 建议和个人判断" options={reasonTypeOptions} />
          </Form.Item>
          {watchedReasonType === "ai_advice" ? (
            <Form.Item
              name="change_advice_item_id"
              label="关联微操建议"
              extra={
                !directionalCandidates.length
                  ? "近 10 天没有这只标的同方向的增持、减持建议，可不关联"
                  : directionalCandidates.every((item) => item.linked_change)
                    ? "这些建议都已关联过调仓，可不关联"
                    : "关联后，这笔调仓直接算作该建议已执行；一条建议只能关联一次"
              }
            >
              <Select
                allowClear
                placeholder="选填"
                onChange={selectAdviceCandidate}
                options={directionalCandidates.map((item) => ({
                  value: item.id,
                  disabled: Boolean(item.linked_change),
                  label: `${item.target_trade_date} ${adviceActionLabels[item.action] || item.action}${item.quantity ? ` ${item.quantity}股` : ""}${
                    item.linked_change
                      ? ` · 已关联 ${item.linked_change.change_date.slice(5)} ${item.linked_change.quantity_delta > 0 ? "+" : "−"}${Math.abs(item.linked_change.quantity_delta)}股`
                      : item.price_low !== null && item.price_low !== undefined ? ` · ${item.price_low}—${item.price_high}` : ""
                  }`
                }))}
              />
            </Form.Item>
          ) : null}
          <Form.Item name="change_note" label="调仓理由">
            <Input.TextArea rows={3} placeholder="选填，会记进调仓记录" />
          </Form.Item>
        </Form>
      </Modal>
      <Modal title="记录资金流水" open={cashFlowModalOpen} onCancel={() => setCashFlowModalOpen(false)} onOk={submitCashFlow} confirmLoading={saving} destroyOnClose>
        <Form form={cashFlowForm} layout="vertical">
          {!selectedPortfolioId ? (
            <Form.Item name="portfolio_id" label="组合" rules={[{ required: true, message: "请选择组合" }]}>
              <Select placeholder="请选择组合" options={portfolios.data.map((item) => ({ value: item.id, label: item.name }))} />
            </Form.Item>
          ) : null}
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
