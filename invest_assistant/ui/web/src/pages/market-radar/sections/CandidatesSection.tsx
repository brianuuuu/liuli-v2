import { Button, Form, Input, InputNumber, Modal, Select, Space, Table, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  approveAiTagSuggestion,
  createAiTagSuggestion,
  listHotwords,
  listAiTagSuggestions,
  rejectAiTagSuggestion,
  restoreAiTagSuggestion
} from "../../../api/marketRadar";
import { searchStocks } from "../../../api/stocks";
import { listTracks } from "../../../api/trackDiscovery";
import { DataPanel } from "../../../components/common/DataPanel";
import { EmptyAction } from "../../../components/common/EmptyAction";
import { StatusTag } from "../../../components/common/StatusTag";
import { useAsyncData } from "../../../hooks/useAsyncData";
import type { AiTagSuggestion, Hotword, Stock, Track } from "../../../types/api";
import { formatTime } from "./shared";

type TargetType = "stock" | "track" | "hotword";

type SuggestionFormValues = {
  suggested_text: string;
  score?: number;
  reason?: string;
};

type ApproveFormValues = {
  final_tag_name?: string;
  target_type: TargetType;
  target_id?: number;
  target_name?: string;
};

type TargetSelectOption = {
  value: number;
  label: string;
  searchText: string;
};

const statusOptions = [
  { value: "pending", label: "待审核" },
  { value: "approved", label: "已通过" },
  { value: "rejected", label: "已拒绝" }
];

const targetTypeOptions = [
  { value: "hotword", label: "市场热词" },
  { value: "track", label: "赛道" },
  { value: "stock", label: "标的" }
];

function SuggestionStatusTag({ status }: { status?: string }) {
  const label = statusOptions.find((item) => item.value === status)?.label || status || "-";
  return <StatusTag status={status} label={label} />;
}

export function CandidatesSection() {
  const [statusFilter, setStatusFilter] = useState<string | undefined>("pending");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const suggestions = useAsyncData(
    useCallback(
      async () => listAiTagSuggestions(statusFilter, { q: searchQuery.trim() || undefined, limit: pageSize, offset: (page - 1) * pageSize }),
      [page, pageSize, searchQuery, statusFilter]
    ),
    { items: [], total: 0, limit: 20, offset: 0, has_more: false }
  );
  const hotwords = useAsyncData(useCallback(async () => (await listHotwords(undefined, { limit: 100, offset: 0 })).items, []), []);
  const tracks = useAsyncData(useCallback(() => listTracks(), []), []);
  const [createOpen, setCreateOpen] = useState(false);
  const [approving, setApproving] = useState<AiTagSuggestion | null>(null);
  const [stockOptions, setStockOptions] = useState<Stock[]>([]);
  const [stockSearchLoading, setStockSearchLoading] = useState(false);
  const [form] = Form.useForm<SuggestionFormValues>();
  const [approveForm] = Form.useForm<ApproveFormValues>();
  const targetType = Form.useWatch("target_type", approveForm) || "hotword";

  useEffect(() => {
    setPage(1);
  }, [searchQuery, statusFilter]);

  const rows = suggestions.data.items;
  const statusButtons = [{ value: undefined, label: "全部" }, ...statusOptions];
  const targetObjectOptions = useMemo(() => getTargetOptions(targetType, hotwords.data, tracks.data, stockOptions), [hotwords.data, stockOptions, targetType, tracks.data]);
  const targetObjectLoading = targetType === "stock" ? stockSearchLoading : targetType === "track" ? tracks.loading : hotwords.loading;
  const targetObjectPlaceholder = targetType === "stock" ? "搜索标的名称 / 代码 / 拼音" : `搜索${targetTypeOptions.find((item) => item.value === targetType)?.label || "对象"}名称`;
  const targetObjectExtra = targetType === "stock" ? "标的必须从已有主数据中选择。" : "选择已有对象则绑定到该对象；不选择则按下方新对象名称创建。";

  useEffect(() => {
    approveForm.setFieldValue("target_id", undefined);
    if (targetType !== "stock") {
      setStockOptions([]);
    }
  }, [approveForm, targetType]);

  async function submitCreate() {
    const values = await form.validateFields();
    await createAiTagSuggestion({
      suggested_text: values.suggested_text,
      score: values.score ?? null,
      reason: values.reason || null,
      status: "pending"
    });
    message.success("AI 推荐词已新增");
    setCreateOpen(false);
    form.resetFields();
    await suggestions.refresh();
  }


  function openApprove(record: AiTagSuggestion) {
    setApproving(record);
  }

  async function submitApprove() {
    if (!approving) return;
    const values = await approveForm.validateFields();
    await approveAiTagSuggestion(approving.id, {
      final_tag_name: values.final_tag_name || null,
      target_type: values.target_type,
      target_id: values.target_id || null,
      target_name: values.target_name || values.final_tag_name || approving.suggested_text
    });
    message.success("AI 推荐词已通过");
    setApproving(null);
    approveForm.resetFields();
    setStockOptions([]);
    await suggestions.refresh();
  }

  async function searchTargetObjects(keyword: string) {
    if (targetType !== "stock") return;
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

  async function reject(record: AiTagSuggestion) {
    await rejectAiTagSuggestion(record.id);
    message.success("AI 推荐词已拒绝");
    await suggestions.refresh();
  }

  async function restore(record: AiTagSuggestion) {
    await restoreAiTagSuggestion(record.id);
    message.success("AI 推荐词已恢复");
    await suggestions.refresh();
  }

  const columns: ColumnsType<AiTagSuggestion> = [
    { title: "推荐词", dataIndex: "suggested_text", width: 150, ellipsis: true },
    { title: "最终标签", dataIndex: "final_tag_name", width: 150, ellipsis: true, render: (value) => value || "-" },
    { title: "分数", dataIndex: "score", width: 80, render: (value) => (value == null ? "-" : Number(value).toFixed(1)) },
    { title: "状态", dataIndex: "status", width: 92, render: (value) => <SuggestionStatusTag status={value} /> },
    { title: "拒绝次数", dataIndex: "rejected_count", width: 88, render: (value) => Number(value || 0) },
    { title: "原因", dataIndex: "reason", ellipsis: true, render: (value) => value || "-" },
    { title: "创建", dataIndex: "created_at", width: 132, render: (value) => formatTime(value).slice(5, 16) },
    {
      title: "操作",
      width: 150,
      render: (_, record) => {
        if (record.status === "rejected") return <Button size="small" onClick={() => restore(record)}>恢复</Button>;
        if (record.status !== "pending") return "-";
        return (
          <Space size={4}>
            <Button size="small" onClick={() => openApprove(record)}>通过</Button>
            <Button size="small" danger onClick={() => reject(record)}>拒绝</Button>
          </Space>
        );
      }
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
            <Input.Search
              placeholder="搜索推荐词..."
              allowClear
              size="small"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onSearch={setSearchQuery}
              style={{ width: 180, marginLeft: 10 }}
            />
            <div className="data-panel-toolbar-spacer" />
            <Button size="small" type="primary" onClick={() => setCreateOpen(true)}>新增推荐词</Button>
          </>
        }
      >
        <Table
          rowKey="id"
          size="small"
          loading={suggestions.loading}
          dataSource={rows}
          columns={columns}
          tableLayout="fixed"
          pagination={{
            current: page,
            pageSize,
            total: suggestions.data.total,
            showSizeChanger: true,
            pageSizeOptions: [20, 50, 100],
            onChange: (nextPage, nextPageSize) => {
              setPage(nextPageSize !== pageSize ? 1 : nextPage);
              setPageSize(nextPageSize);
            }
          }}
          locale={{ emptyText: <EmptyAction description="暂无 AI 推荐词" /> }}
        />
      </DataPanel>

      <Modal title="新增 AI 推荐词" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={submitCreate} destroyOnHidden>
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="suggested_text" label="推荐词" rules={[{ required: true, message: "请输入推荐词" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="score" label="分数">
            <InputNumber min={0} max={10} step={0.5} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="reason" label="原因">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="通过 AI 推荐词"
        open={Boolean(approving)}
        onCancel={() => { setApproving(null); approveForm.resetFields(); setStockOptions([]); }}
        onOk={submitApprove}
        destroyOnHidden
      >
        <Form
          key={approving?.id ?? "none"}
          form={approveForm}
          layout="vertical"
          preserve={false}
          initialValues={{
            final_tag_name: approving?.final_tag_name || approving?.suggested_text,
            target_type: "hotword"
          }}
        >
          <Form.Item name="final_tag_name" label="最终标签词">
            <Input />
          </Form.Item>
          <Form.Item name="target_type" label="绑定对象" rules={[{ required: true, message: "请选择绑定对象" }]}>
            <Select
              options={targetTypeOptions}
              onChange={() => {
                approveForm.setFieldValue("target_id", undefined);
                setStockOptions([]);
              }}
            />
          </Form.Item>
          <Form.Item
            name="target_id"
            label="已有对象"
            extra={targetObjectExtra}
            rules={[{ required: targetType === "stock", message: "请搜索并选择已有标的" }]}
          >
            <Select
              allowClear
              showSearch
              optionFilterProp="searchText"
              filterOption={targetType === "stock" ? false : undefined}
              placeholder={targetObjectPlaceholder}
              options={targetObjectOptions}
              loading={targetObjectLoading}
              onSearch={searchTargetObjects}
              notFoundContent={targetType === "stock" ? (stockSearchLoading ? "搜索中" : "请输入名称或代码搜索") : "暂无可选对象"}
              popupMatchSelectWidth={360}
            />
          </Form.Item>
          <Form.Item name="target_name" label="新对象名称">
            <Input disabled={targetType === "stock"} placeholder={targetType === "stock" ? "标的需从已有主数据中选择" : undefined} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

function getTargetOptions(targetType: TargetType, hotwords: Hotword[], tracks: Track[], stocks: Stock[]): TargetSelectOption[] {
  if (targetType === "track") {
    return tracks.map((item) => ({
      value: item.id,
      label: item.name || "未命名赛道",
      searchText: [item.name, item.description, item.stage, item.status].filter(Boolean).join(" ")
    }));
  }
  if (targetType === "stock") {
    return stocks.map((item) => {
      const name = item.stock_name || item.name || item.stock_code || item.symbol || "未命名标的";
      return {
        value: item.id,
        label: name,
        searchText: [name, item.symbol, item.stock_code, item.name_pinyin, item.name_abbr, item.market, item.exchange].filter(Boolean).join(" ")
      };
    });
  }
  return hotwords.map((item) => ({
    value: item.id,
    label: item.name || "未命名热词",
    searchText: [item.name, item.description, item.status].filter(Boolean).join(" ")
  }));
}
