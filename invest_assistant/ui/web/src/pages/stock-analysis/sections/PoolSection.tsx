import { Button, Form, InputNumber, Modal, Select, Space, Table, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { createStockPoolItem, listStockPool } from "../../../api/stockAnalysis";
import { EmptyAction } from "../../../components/common/EmptyAction";
import { WorkbenchCard } from "../../../components/common/WorkbenchCard";
import { useAsyncData } from "../../../hooks/useAsyncData";
import type { StockPoolItem } from "../../../types/api";
import { formatTime, poolStatusOptions, StatusTag } from "./shared";

type PoolFormValues = {
  stock_id: number;
  status: string;
};

export function PoolSection() {
  const pool = useAsyncData(useCallback(listStockPool, []), []);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<PoolFormValues>();

  const rows = useMemo(() => pool.data.filter((item) => !statusFilter || item.status === statusFilter), [pool.data, statusFilter]);

  function openCreate() {
    form.setFieldsValue({ status: "watching" });
    setOpen(true);
  }

  async function submit() {
    const values = await form.validateFields();
    await createStockPoolItem(values);
    message.success("标的池已更新");
    setOpen(false);
    await pool.refresh();
  }

  const columns: ColumnsType<StockPoolItem> = [
    { title: "Stock ID", dataIndex: "stock_id", width: 110, render: (value) => <Link to={`/stock-analysis/stocks/${value}`}>{value}</Link> },
    { title: "状态", dataIndex: "status", width: 120, render: (value) => <StatusTag status={value} /> },
    { title: "创建", dataIndex: "created_at", width: 160, render: formatTime },
    { title: "更新", dataIndex: "updated_at", width: 160, render: formatTime },
    { title: "操作", width: 90, render: (_, record) => <Link to={`/stock-analysis/stocks/${record.stock_id}`}>详情</Link> }
  ];

  return (
    <>
      <WorkbenchCard
        title="标的池"
        extra={
          <Space>
            <Select allowClear size="small" placeholder="状态" value={statusFilter} options={poolStatusOptions} style={{ width: 120 }} onChange={setStatusFilter} />
            <Button size="small" type="primary" onClick={openCreate}>加入标的</Button>
          </Space>
        }
      >
        <Table
          rowKey="id"
          size="small"
          loading={pool.loading}
          dataSource={rows}
          columns={columns}
          pagination={{ pageSize: 12, showSizeChanger: true }}
          locale={{ emptyText: <EmptyAction description="暂无标的池数据" /> }}
        />
      </WorkbenchCard>

      <Modal title="加入标的池" open={open} onCancel={() => setOpen(false)} onOk={submit} destroyOnHidden>
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="stock_id" label="Stock ID" rules={[{ required: true, message: "请输入 Stock ID" }]}>
            <InputNumber min={1} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="status" label="状态" rules={[{ required: true, message: "请选择状态" }]}>
            <Select options={poolStatusOptions} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
