import { Button, Drawer, Form, Input, Modal, Select, Space, Table, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import { listStocks, searchStocks, updateStock } from "../../../api/stocks";
import type { Stock } from "../../../types/api";
import { DataPanel } from "../../../components/common/DataPanel";
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
};

export function StocksSection() {
  const stocks = useAsyncData(useCallback(() => listStocks({ limit: 500 }), []), []);
  const [keyword, setKeyword] = useState("");
  const [rows, setRows] = useState<Stock[] | null>(null);
  const [editing, setEditing] = useState<Stock | null>(null);
  const [detail, setDetail] = useState<Stock | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [form] = Form.useForm<StockFormValues>();

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
      status: editing.status || "active"
    });
  }, [editOpen, editing, form]);

  async function submitEdit() {
    if (!editing) return;
    const values = await form.validateFields();
    await updateStock(editing.id, values);
    message.success("股票基础信息已更新");
    setEditOpen(false);
    setEditing(null);
    await refresh();
  }

  async function showDetail(record: Stock) {
    setDetail(record);
  }

  const columns: ColumnsType<Stock> = [
    { title: "代码", dataIndex: "stock_code", width: 120, render: (value, record) => value || record.symbol || "-" },
    { title: "统一代码", dataIndex: "symbol", width: 120, render: (value) => value || "-" },
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
        <Table rowKey="id" size="small" loading={stocks.loading} dataSource={dataSource} columns={columns} pagination={{ defaultPageSize: 10, showSizeChanger: true }} />
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
        </Form>
      </Modal>

      <Drawer title="股票详情" open={Boolean(detail)} onClose={() => setDetail(null)} size={620}>
        {detail ? (
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            <DetailRows record={detail as unknown as Record<string, unknown>} />
          </Space>
        ) : null}
      </Drawer>
    </>
  );
}
