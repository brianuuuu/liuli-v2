import { Button, Drawer, Form, Input, Modal, Select, Space, Table, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useState } from "react";
import { createStockAlias, importStocks, listStockAliases, listStocks, searchStocks, updateStock } from "../../../api/stocks";
import type { Stock, StockAlias } from "../../../types/api";
import { WorkbenchCard } from "../../../components/common/WorkbenchCard";
import { useAsyncData } from "../../../hooks/useAsyncData";
import { DetailRows, formatTime } from "./shared";

type StockFormValues = {
  stock_code: string;
  stock_name: string;
  market?: string;
  exchange?: string;
  status?: string;
};

type ImportFormValues = {
  stocks: string;
};

type AliasFormValues = {
  alias: string;
  alias_type?: string;
  source?: string;
};

function parseImportLines(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [stock_code, stock_name, market, exchange] = line.split(/[\t,，]/).map((part) => part.trim());
      if (!stock_code || !stock_name) throw new Error(`无法解析：${line}`);
      return { stock_code, stock_name, market: market || null, exchange: exchange || null };
    });
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
  const [importOpen, setImportOpen] = useState(false);
  const [form] = Form.useForm<StockFormValues>();
  const [importForm] = Form.useForm<ImportFormValues>();
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
    form.setFieldsValue({
      stock_code: record.stock_code || record.symbol || "",
      stock_name: record.stock_name || record.name || "",
      market: record.market || undefined,
      exchange: record.exchange || undefined,
      status: record.status || "active"
    });
    setEditOpen(true);
  }

  async function submitEdit() {
    if (!editing) return;
    const values = await form.validateFields();
    await updateStock(editing.id, values);
    message.success("股票基础信息已更新");
    setEditOpen(false);
    await refresh();
  }

  async function submitImport() {
    const values = await importForm.validateFields();
    let items;
    try {
      items = parseImportLines(values.stocks);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "导入格式错误");
      return;
    }
    const result = await importStocks(items);
    message.success(`已导入/更新 ${result.length} 条股票`);
    setImportOpen(false);
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
    setAliases(await listStockAliases(detail.id));
  }

  const columns: ColumnsType<Stock> = [
    { title: "代码", dataIndex: "stock_code", width: 120, render: (value, record) => value || record.symbol || "-" },
    { title: "名称", dataIndex: "stock_name", render: (value, record) => value || record.name || "-" },
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
      <WorkbenchCard
        title="股票基础库"
        extra={
          <Space>
            <Input.Search
              size="small"
              allowClear
              placeholder="代码 / 名称"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              onSearch={doSearch}
              style={{ width: 210 }}
            />
            <Button size="small" onClick={refresh}>重置</Button>
            <Button size="small" type="primary" onClick={() => setImportOpen(true)}>导入股票</Button>
          </Space>
        }
      >
        <Table rowKey="id" size="small" loading={stocks.loading} dataSource={dataSource} columns={columns} pagination={{ pageSize: 12, showSizeChanger: true }} />
      </WorkbenchCard>

      <Modal title="编辑股票" open={editOpen} onCancel={() => setEditOpen(false)} onOk={submitEdit} destroyOnHidden>
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="stock_code" label="股票代码" rules={[{ required: true, message: "请输入股票代码" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="stock_name" label="股票名称" rules={[{ required: true, message: "请输入股票名称" }]}>
            <Input />
          </Form.Item>
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
        </Form>
      </Modal>

      <Modal title="导入股票" open={importOpen} onCancel={() => setImportOpen(false)} onOk={submitImport} destroyOnHidden>
        <Form form={importForm} layout="vertical" preserve={false}>
          <Form.Item
            name="stocks"
            label="股票列表"
            rules={[{ required: true, message: "请输入股票列表" }]}
            extra="每行一条：代码,名称,市场,交易所。市场和交易所可留空。"
          >
            <Input.TextArea rows={8} placeholder={"300750,宁德时代,CN,SZ\n600519,贵州茅台,CN,SH"} />
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
