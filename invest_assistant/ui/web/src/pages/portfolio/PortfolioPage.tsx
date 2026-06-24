import { Button, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useMemo, useState } from "react";
import { moduleTabs } from "../../app/navigation";
import {
  createOrUpdatePosition,
  createPortfolio,
  deletePortfolio,
  deletePosition,
  getPortfolioDashboard,
  listPortfolios,
  refreshPortfolioQuotes,
  updatePortfolio,
  updatePosition
} from "../../api/portfolio";
import { searchStocks } from "../../api/stocks";
import { EmptyAction } from "../../components/common/EmptyAction";
import { PageHeader } from "../../components/common/PageHeader";
import { WorkbenchCard } from "../../components/common/WorkbenchCard";
import { ModuleTabs } from "../../components/layout/ModuleTabs";
import { useAsyncData } from "../../hooks/useAsyncData";
import type { Portfolio, PortfolioDashboard, PortfolioPosition, Stock } from "../../types/api";

type PortfolioFormValue = {
  name: string;
  base_currency?: string;
};

type PositionFormValue = {
  stock_id: number;
  quantity: number;
};

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
  return value > 0 ? "var(--ll-danger)" : "var(--ll-success)";
}

export function PortfolioPage() {
  const [activeTab, setActiveTab] = useState("portfolios");
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<number | null>(null);
  const [portfolioModalOpen, setPortfolioModalOpen] = useState(false);
  const [editingPortfolio, setEditingPortfolio] = useState<Portfolio | null>(null);
  const [positionModalOpen, setPositionModalOpen] = useState(false);
  const [editingPosition, setEditingPosition] = useState<PortfolioPosition | null>(null);
  const [stockOptions, setStockOptions] = useState<{ value: number; label: string; searchText: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [portfolioForm] = Form.useForm<PortfolioFormValue>();
  const [positionForm] = Form.useForm<PositionFormValue>();

  const portfolios = useAsyncData(useCallback(listPortfolios, []), []);
  const dashboard = useAsyncData<PortfolioDashboard | null>(
    useCallback(async () => {
      if (!selectedPortfolioId) return null;
      return getPortfolioDashboard(selectedPortfolioId);
    }, [selectedPortfolioId]),
    null
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
    await dashboard.refresh();
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
      message.error("只能删除没有持仓、分组或复盘的空组合");
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
      await dashboard.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function removePosition(record: PortfolioPosition) {
    if (!selectedPortfolioId) return;
    await deletePosition(selectedPortfolioId, record.id);
    message.success("持仓已删除");
    await dashboard.refresh();
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
      await dashboard.refresh();
    } finally {
      setSaving(false);
    }
  }

  const columns: ColumnsType<PortfolioPosition> = [
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

  function renderSummary() {
    const summary = dashboard.data?.summary;
    return (
      <div className="portfolio-summary">
        <WorkbenchCard title="当前市值"><Typography.Title level={3}>{formatMoney(summary?.market_value)}</Typography.Title></WorkbenchCard>
        <WorkbenchCard title="当日盈亏"><Typography.Title level={3} style={{ color: pnlColor(summary?.day_pnl) }}>{formatMoney(summary?.day_pnl)}</Typography.Title></WorkbenchCard>
        <WorkbenchCard title="当日涨跌幅"><Typography.Title level={3} style={{ color: pnlColor(summary?.day_pct) }}>{formatPercent(summary?.day_pct)}</Typography.Title></WorkbenchCard>
        <WorkbenchCard title="持仓数量"><Typography.Title level={3}>{summary?.position_count ?? 0}</Typography.Title></WorkbenchCard>
      </div>
    );
  }

  function renderPortfolioWorkbench() {
    if (!selectedPortfolioId) {
      return <WorkbenchCard><EmptyAction description="暂无组合，请先新建组合" /></WorkbenchCard>;
    }
    return (
      <>
        {renderSummary()}
        <WorkbenchCard
          title="实盘持仓"
          extra={(
            <Space wrap>
              <Button onClick={openCreatePosition}>新增持仓</Button>
              <Button onClick={refreshQuotes} loading={saving}>刷新实时价格</Button>
            </Space>
          )}
        >
          <Table
            rowKey="id"
            size="small"
            loading={dashboard.loading}
            dataSource={dashboard.data?.positions ?? []}
            columns={columns}
            locale={{ emptyText: <EmptyAction description="暂无实盘持仓，请新增持仓" /> }}
            pagination={false}
          />
        </WorkbenchCard>
      </>
    );
  }

  function renderContent() {
    if (activeTab === "portfolios" || activeTab === "positions") return renderPortfolioWorkbench();
    if (activeTab === "risk") return <WorkbenchCard><EmptyAction description="调仓记录后续接入" /></WorkbenchCard>;
    return <WorkbenchCard><EmptyAction description="组合复盘后续接入" /></WorkbenchCard>;
  }

  return (
    <>
      <PageHeader title="组合管理" description="实盘持仓 / 实时价格 / 当日涨跌" />
      <ModuleTabs activeKey={activeTab} items={moduleTabs.portfolio} onChange={setActiveTab} />
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
      <div className="portfolio-dashboard">{renderContent()}</div>
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
    </>
  );
}
