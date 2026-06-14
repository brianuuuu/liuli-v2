import { Button, Form, Modal, Select, Space, Table, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { createStockPoolItem, listStockPool, updateStockPoolItem } from "../../../api/stockAnalysis";
import { searchStocks } from "../../../api/stocks";
import { listTracks } from "../../../api/trackDiscovery";
import { EmptyAction } from "../../../components/common/EmptyAction";
import { DataPanel } from "../../../components/common/DataPanel";
import { useAsyncData } from "../../../hooks/useAsyncData";
import type { Stock, StockPoolItem } from "../../../types/api";
import { formatTime, poolStatusOptions, StatusTag } from "./shared";

type PoolFormValues = {
  stock_id: number;
  status: string;
  track_ids?: number[];
};

export function PoolSection() {
  const pool = useAsyncData(useCallback(listStockPool, []), []);
  const tracks = useAsyncData(useCallback(() => listTracks(), []), []);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<StockPoolItem | null>(null);
  const [stockOptions, setStockOptions] = useState<Stock[]>([]);
  const [stockSearchLoading, setStockSearchLoading] = useState(false);
  const [form] = Form.useForm<PoolFormValues>();
  const statusButtons = useMemo(() => {
    const counts = pool.data.reduce((acc, item) => {
      if (item.status) {
        acc[item.status] = (acc[item.status] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);

    return [
      { value: undefined, label: `全部 (${pool.data.length})` },
      ...poolStatusOptions.map((opt) => ({
        value: opt.value,
        label: `${opt.label} (${counts[opt.value] || 0})`
      }))
    ];
  }, [pool.data]);

  const rows = useMemo(() => pool.data.filter((item) => !statusFilter || item.status === statusFilter), [pool.data, statusFilter]);
  const selectStockOptions = useMemo(
    () => stockOptions.map((item) => ({
      value: item.id,
      label: `${item.symbol || item.stock_code} ${item.stock_name || item.name || ""}`.trim()
    })),
    [stockOptions]
  );
  const trackOptions = useMemo(
    () => tracks.data
      .filter((item) => ["candidate", "active", "paused"].includes(item.status))
      .map((item) => ({ value: item.id, label: item.name })),
    [tracks.data]
  );

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (!editing) {
      form.setFieldsValue({ status: "candidate", track_ids: [] });
      return;
    }
    setStockOptions([{
      id: editing.stock_id,
      symbol: editing.symbol,
      stock_code: editing.stock_code,
      stock_name: editing.stock_name
    }]);
    form.setFieldsValue({
      stock_id: editing.stock_id,
      status: editing.status,
      track_ids: (editing.tracks || []).filter((track) => track.status !== "archived").map((track) => track.id)
    });
  }, [editing, form, open]);

  function openCreate() {
    setEditing(null);
    setStockOptions([]);
    setOpen(true);
  }

  function openEdit(record: StockPoolItem) {
    setEditing(record);
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
    setEditing(null);
    form.resetFields();
    setStockOptions([]);
  }

  async function searchStockOptions(keyword: string) {
    const value = keyword.trim();
    if (!value) {
      setStockOptions([]);
      return;
    }
    setStockSearchLoading(true);
    try {
      setStockOptions(await searchStocks(value));
    } finally {
      setStockSearchLoading(false);
    }
  }

  async function submit() {
    const values = await form.validateFields();
    const payload = {
      stock_id: values.stock_id,
      status: values.status,
      source: editing?.source || "manual",
      reason: editing?.reason || null,
      track_ids: values.track_ids || []
    };
    if (editing) {
      await updateStockPoolItem(editing.id, payload);
    } else {
      await createStockPoolItem(payload);
    }
    message.success("标的池已更新");
    closeModal();
    await pool.refresh();
  }

  const columns: ColumnsType<StockPoolItem> = [
    {
      title: "标的",
      dataIndex: "stock_name",
      render: (value, record) => {
        const stockLabel = value || record.symbol || record.stock_code || `Stock ID ${record.stock_id}`;
        return (
          <Link to={`/stock-analysis/stocks/${record.stock_id}`} className="stock-pool-target-link">
            <span className="stock-pool-target-name">{stockLabel}</span>
          </Link>
        );
      }
    },
    {
      title: "绑定赛道",
      dataIndex: "tracks",
      render: (value: StockPoolItem["tracks"]) => {
        if (!value?.length) return "-";
        return (
          <Space size={4} wrap>
            {value.map((track) => (
              <Link key={track.id} to={`/track-discovery/tracks/${track.id}`}>{track.name}</Link>
            ))}
          </Space>
        );
      }
    },
    { title: "状态", dataIndex: "status", width: 120, render: (value) => <StatusTag status={value} /> },
    { title: "创建", dataIndex: "created_at", width: 160, render: formatTime },
    { title: "更新", dataIndex: "updated_at", width: 160, render: formatTime },
    {
      title: "操作",
      width: 140,
      render: (_, record) => (
        <Space>
          <Button size="small" onClick={() => openEdit(record)}>编辑</Button>
          <Link to={`/stock-analysis/stocks/${record.stock_id}`}>详情</Link>
        </Space>
      )
    }
  ];

  return (
    <>
      <DataPanel
        toolbar={
          <>
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
            <div className="data-panel-toolbar-spacer" />
            <Button size="small" type="primary" onClick={openCreate}>加入标的</Button>
          </>
        }
      >
        <Table
          rowKey="id"
          size="small"
          loading={pool.loading}
          dataSource={rows}
          columns={columns}
          pagination={{ defaultPageSize: 10, showSizeChanger: true }}
          locale={{ emptyText: <EmptyAction description="暂无标的池数据" /> }}
        />
      </DataPanel>

      <Modal title={editing ? "编辑标的" : "加入标的池"} open={open} onCancel={closeModal} onOk={submit} destroyOnHidden forceRender>
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="stock_id" label="标的" rules={[{ required: true, message: "请选择标的" }]}>
            <Select
              showSearch
              filterOption={false}
              disabled={Boolean(editing)}
              placeholder="搜索股票代码 / 名称 / 拼音"
              options={selectStockOptions}
              loading={stockSearchLoading}
              onSearch={searchStockOptions}
              notFoundContent={stockSearchLoading ? "搜索中" : "请输入关键词搜索"}
            />
          </Form.Item>
          <Form.Item name="status" label="状态" rules={[{ required: true, message: "请选择状态" }]}>
            <Select options={poolStatusOptions} />
          </Form.Item>
          <Form.Item name="track_ids" label="绑定赛道">
            <Select
              mode="multiple"
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="选择一个或多个赛道"
              options={trackOptions}
              loading={tracks.loading}
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
