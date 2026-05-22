import { Button, Drawer, Form, Input, Modal, Select, Space, Table, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import { createStockAlias, listStockAliases, listStocks, replaceStockAliases, searchStocks, updateStock } from "../../../api/stocks";
import type { Stock, StockAlias } from "../../../types/api";
import { DataPanel } from "../../../components/common/DataPanel";
import { WorkbenchCard } from "../../../components/common/WorkbenchCard";
import { useAsyncData } from "../../../hooks/useAsyncData";
import { DetailRows, formatTime } from "./shared";

type StockFormValues = {
  symbol?: string;
  stock_code: string;
  stock_name: string;
  name_pinyin?: string;
  name_abbr?: string;
  market?: string;
  exchange?: string;
  status?: string;
  alias_text?: string;
};

type AliasFormValues = {
  alias: string;
  alias_type?: string;
  source?: string;
};

function formatAliases(aliases?: StockAlias[]) {
  return (aliases || []).map((item) => item.alias).join("，");
}

function parseAliasText(text?: string) {
  return (text || "")
    .split(/[\n,，、]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((alias) => ({ alias, alias_type: null, source: "manual" }));
}

export function StocksSection() {
  const stocks = useAsyncData(useCallback(() => listStocks({ limit: 500 }), []), []);
  const [keyword, setKeyword] = useState("");
  const [rows, setRows] = useState<Stock[] | null>(null);
  const [editing, setEditing] = useState<Stock | null>(null);
  const [detail, setDetail] = useState<Stock | null>(null);
  const [aliases, setAliases] = useState<StockAlias[]>([]);
  const [aliasLoading, setAliasLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [form] = Form.useForm<StockFormValues>();
  const [aliasForm] = Form.useForm<AliasFormValues>();

  const dataSource = rows ?? stocks.data;

  async function refresh() {
    setRows(null);
    await stocks.refresh();
  }

  async function doSearch() {
    const value = keyword.trim();
    if (!value) {
      setRows(null);
      return;
    }
    setRows(await searchStocks(value));
  }

  function openEdit(record: Stock) {
    setEditing(record);
    setEditOpen(true);
  }

  useEffect(() => {
    if (!editOpen || !editing) return;
    form.setFieldsValue({
      stock_code: editing.stock_code || editing.symbol || "",
      stock_name: editing.stock_name || editing.name || "",
      symbol: editing.symbol || undefined,
      name_pinyin: editing.name_pinyin || undefined,
      name_abbr: editing.name_abbr || undefined,
      market: editing.market || undefined,
      exchange: editing.exchange || undefined,
      status: editing.status || "active",
      alias_text: formatAliases(editing.aliases)
    });
  }, [editOpen, editing, form]);

  async function submitEdit() {
    if (!editing) return;
    const values = await form.validateFields();
    const { alias_text, ...stockValues } = values;
    await updateStock(editing.id, stockValues);
    await replaceStockAliases(editing.id, parseAliasText(alias_text));
    message.success("股票基础信息已更新");
    setEditOpen(false);
    setEditing(null);
    await refresh();
  }

  async function showDetail(record: Stock) {
    setDetail(record);
    setAliasLoading(true);
    try {
      setAliases(await listStockAliases(record.id));
    } finally {
      setAliasLoading(false);
    }
  }

  async function submitAlias() {
    if (!detail) return;
    const values = await aliasForm.validateFields();
    await createStockAlias(detail.id, {
      alias: values.alias,
      alias_type: values.alias_type || null,
      source: values.source || null
    });
    message.success("别名已新增");
    aliasForm.resetFields();
    const nextAliases = await listStockAliases(detail.id);
    setAliases(nextAliases);
    setDetail({ ...detail, aliases: nextAliases });
    await refresh();
  }

  const columns: ColumnsType<Stock> = [
    { title: "代码", dataIndex: "stock_code", width: 120, render: (value, record) => value || record.symbol || "-" },
    { title: "统一代码", dataIndex: "symbol", width: 120, render: (value) => value || "-" },
    { title: "名称", dataIndex: "stock_name", render: (value, record) => value || record.name || "-" },
    { title: "别名", dataIndex: "aliases", width: 180, render: (_, record) => formatAliases(record.aliases) || "-" },
    { title: "市场", dataIndex: "market", width: 100, render: (value) => value || "-" },
    { title: "交易所", dataIndex: "exchange", width: 100, render: (value) => value || "-" },
    { title: "状态", dataIndex: "status", width: 100, render: (value) => <Tag color={value === "active" ? "green" : "default"}>{value || "-"}</Tag> },
    { title: "更新", dataIndex: "updated_at", width: 160, render: formatTime },
    {
      title: "操作",
      width: 160,
      render: (_, record) => (
        <Space>
          <Button size="small" onClick={() => openEdit(record)}>编辑</Button>
          <Button size="small" onClick={() => showDetail(record)}>详情</Button>
        </Space>
      )
    }
  ];

  return (
    <>
      <DataPanel
        toolbar={
          <>
            <Input.Search
              size="small"
              allowClear
              placeholder="代码 / 名称 / 拼音"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              onSearch={doSearch}
              style={{ width: 210 }}
            />
            <Button size="small" onClick={refresh}>重置</Button>
            <div className="data-panel-toolbar-spacer" />
          </>
        }
      >
        <Table rowKey="id" size="small" loading={stocks.loading} dataSource={dataSource} columns={columns} pagination={{ pageSize: 12, showSizeChanger: true }} />
      </DataPanel>

      <Modal title="编辑股票" open={editOpen} onCancel={() => { setEditOpen(false); setEditing(null); }} onOk={submitEdit} destroyOnHidden forceRender>
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="stock_code" label="股票代码" rules={[{ required: true, message: "请输入股票代码" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="stock_name" label="股票名称" rules={[{ required: true, message: "请输入股票名称" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="symbol" label="统一代码">
            <Input placeholder="例如 000001.SZ" />
          </Form.Item>
          <Space.Compact block>
            <Form.Item name="name_pinyin" label="名称全拼" style={{ width: "50%" }}>
              <Input />
            </Form.Item>
            <Form.Item name="name_abbr" label="拼音缩写" style={{ width: "50%" }}>
              <Input />
            </Form.Item>
          </Space.Compact>
          <Space.Compact block>
            <Form.Item name="market" label="市场" style={{ width: "50%" }}>
              <Input />
            </Form.Item>
            <Form.Item name="exchange" label="交易所" style={{ width: "50%" }}>
              <Input />
            </Form.Item>
          </Space.Compact>
          <Form.Item name="status" label="状态">
            <Select options={[{ value: "active", label: "active" }, { value: "disabled", label: "disabled" }]} />
          </Form.Item>
          <Form.Item name="alias_text" label="别名">
            <Input.TextArea rows={3} placeholder="多个别名用逗号或换行分隔" />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer title="股票详情" open={Boolean(detail)} onClose={() => setDetail(null)} size={620}>
        {detail ? (
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            <DetailRows record={detail as unknown as Record<string, unknown>} />
            <WorkbenchCard title="别名">
              <Table
                rowKey="id"
                size="small"
                loading={aliasLoading}
                dataSource={aliases}
                pagination={false}
                columns={[
                  { title: "别名", dataIndex: "alias" },
                  { title: "类型", dataIndex: "alias_type", render: (value) => value || "-" },
                  { title: "来源", dataIndex: "source", render: (value) => value || "-" }
                ]}
              />
              <Form form={aliasForm} layout="inline" style={{ marginTop: 12 }} onFinish={submitAlias}>
                <Form.Item name="alias" rules={[{ required: true, message: "请输入别名" }]}>
                  <Input placeholder="别名" />
                </Form.Item>
                <Form.Item name="alias_type">
                  <Input placeholder="类型" />
                </Form.Item>
                <Form.Item name="source">
                  <Input placeholder="来源" />
                </Form.Item>
                <Button htmlType="submit" size="small">新增</Button>
              </Form>
            </WorkbenchCard>
          </Space>
        ) : null}
      </Drawer>
    </>
  );
}
