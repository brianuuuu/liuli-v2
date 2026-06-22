import { Button, Drawer, Form, Input, InputNumber, Modal, Select, Space, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useState } from "react";
import {
  createDisclosure,
  disclosuresToMissingSourceItems,
  downloadDisclosure as syncDisclosureOriginal,
  fetchDisclosures,
  getParsedDisclosure,
  listDisclosures,
  parseDisclosure
} from "../../../api/disclosures";
import type { Disclosure } from "../../../types/api";
import { DataPanel } from "../../../components/common/DataPanel";
import { WorkbenchCard } from "../../../components/common/WorkbenchCard";
import { useAsyncData } from "../../../hooks/useAsyncData";
import { DetailRows, formatTime } from "./shared";

type DisclosureFormValues = {
  stock_id?: number;
  source: string;
  disclosure_type: string;
  title: string;
  publish_time?: string;
  report_period?: string;
  source_url?: string;
  file_path?: string;
  parsed_text_path?: string;
  parsed_markdown_path?: string;
  parse_status: string;
};

const FINANCIAL_DISCLOSURE_TYPES = new Set(["annual_report", "quarterly_report", "interim_report"]);
const PROCESS_STATUS_OPTIONS = [
  { value: "pending", label: "待同步" },
  { value: "downloaded", label: "已同步" },
  { value: "parsed", label: "已解析" },
  { value: "parse_failed", label: "解析失败" }
];
const PROCESS_STATUS_LABELS = Object.fromEntries(PROCESS_STATUS_OPTIONS.map((item) => [item.value, item.label]));

function companyNameLabel(record: Disclosure) {
  return record.stock_name || "-";
}

function reportPeriodLabel(record: Disclosure) {
  if (!FINANCIAL_DISCLOSURE_TYPES.has(record.disclosure_type)) return "-";
  const value = record.report_period?.trim();
  if (!value || /^\d{6}$/.test(value)) return "-";
  return value;
}

function processStatusLabel(value?: string | null) {
  if (!value) return "-";
  return PROCESS_STATUS_LABELS[value] || value;
}

export function DisclosuresSection() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const disclosures = useAsyncData(useCallback(async () => listDisclosures({ limit: pageSize, offset: (page - 1) * pageSize }), [page, pageSize]), {
    items: [],
    total: 0,
    limit: 50,
    offset: 0,
    has_more: false
  });
  const [keyword, setKeyword] = useState("");
  const [detail, setDetail] = useState<Disclosure | null>(null);
  const [parsedContent, setParsedContent] = useState("");
  const [open, setOpen] = useState(false);
  const [bulkSourceLoading, setBulkSourceLoading] = useState(false);
  const [form] = Form.useForm<DisclosureFormValues>();

  function openCreate() {
    form.setFieldsValue({ source: "manual", disclosure_type: "announcement", parse_status: "pending" });
    setOpen(true);
  }

  async function submit() {
    const values = await form.validateFields();
    const payload = {
      ...values,
      stock_id: values.stock_id || null,
      publish_time: values.publish_time || null,
      report_period: values.report_period || null,
      source_url: values.source_url || null,
      file_path: values.file_path || null,
      parsed_text_path: values.parsed_text_path || null,
      parsed_markdown_path: values.parsed_markdown_path || null
    };
    await createDisclosure(payload);
    message.success("公告财报已新增");
    setOpen(false);
    await disclosures.refresh();
  }

  async function fetchRemote() {
    const result = await fetchDisclosures({ keyword: keyword.trim(), page_size: 30 });
    message.success(`已拉取 ${result.fetched} 条公告财报`);
    await disclosures.refresh();
  }

  async function runAction(record: Disclosure, action: "sync_original" | "parse") {
    if (action === "sync_original") await syncDisclosureOriginal(record.id);
    if (action === "parse") await parseDisclosure(record.id);
    message.success("操作已完成");
    await disclosures.refresh();
  }

  async function runBulkSourceItems() {
    setBulkSourceLoading(true);
    try {
      const result = await disclosuresToMissingSourceItems();
      message.success(`已入信息流 ${result.converted} 条，跳过 ${result.skipped} 条`);
      await disclosures.refresh();
    } finally {
      setBulkSourceLoading(false);
    }
  }

  async function showDetail(record: Disclosure) {
    setDetail(record);
    setParsedContent("");
    if (!record.parsed_markdown_path && !record.parsed_text_path) return;
    try {
      setParsedContent(await getParsedDisclosure(record.id));
    } catch {
      setParsedContent("解析文件不存在或无法读取。");
    }
  }

  const columns: ColumnsType<Disclosure> = [
    { title: "标题", dataIndex: "title", width: 340, ellipsis: true },
    { title: "公司名称", width: 128, render: (_, record) => companyNameLabel(record) },
    { title: "报告期", width: 90, render: (_, record) => reportPeriodLabel(record) },
    { title: "来源", dataIndex: "source", width: 76, render: (value) => value || "-" },
    { title: "类型", dataIndex: "disclosure_type", width: 112 },
    { title: "处理状态", dataIndex: "parse_status", width: 96, render: (value) => <Tag>{processStatusLabel(value)}</Tag> },
    { title: "发布时间", dataIndex: "publish_time", width: 150, render: formatTime },
    {
      title: "操作",
      width: 200,
      render: (_, record) => (
        <Space>
          <Button size="small" onClick={() => showDetail(record)}>详情</Button>
          <Button size="small" onClick={() => runAction(record, "sync_original")}>同步原文</Button>
          <Button size="small" onClick={() => runAction(record, "parse")}>解析</Button>
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
              placeholder="巨潮关键词"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              onSearch={fetchRemote}
              style={{ width: 190 }}
            />
            <Button size="small" onClick={fetchRemote}>拉取公告</Button>
            <div className="data-panel-toolbar-spacer" />
            <Button size="small" loading={bulkSourceLoading} onClick={runBulkSourceItems}>一键入信息流</Button>
            <Button size="small" type="primary" onClick={openCreate}>新增记录</Button>
          </>
        }
      >
        <Table
          rowKey="id"
          size="small"
          loading={disclosures.loading}
          dataSource={disclosures.data.items}
          columns={columns}
          scroll={{ x: 1180 }}
          pagination={{
            current: page,
            pageSize,
            total: disclosures.data.total,
            showSizeChanger: true,
            pageSizeOptions: [20, 50, 100],
            onChange: (nextPage, nextPageSize) => {
              setPage(nextPageSize !== pageSize ? 1 : nextPage);
              setPageSize(nextPageSize);
            }
          }}
        />
      </DataPanel>

      <Modal title="新增公告财报" open={open} onCancel={() => setOpen(false)} onOk={submit} destroyOnHidden size={720}>
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="title" label="标题" rules={[{ required: true, message: "请输入标题" }]}>
            <Input />
          </Form.Item>
          <Space.Compact block>
            <Form.Item name="source" label="来源" style={{ width: "34%" }} rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="disclosure_type" label="类型" style={{ width: "33%" }} rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="parse_status" label="处理状态" style={{ width: "33%" }}>
              <Select options={PROCESS_STATUS_OPTIONS} />
            </Form.Item>
          </Space.Compact>
          <Space.Compact block>
            <Form.Item name="stock_id" label="Stock ID" style={{ width: "34%" }}>
              <InputNumber min={1} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item name="publish_time" label="发布时间" style={{ width: "33%" }}>
              <Input placeholder="2026-05-16T09:30:00" />
            </Form.Item>
            <Form.Item name="report_period" label="报告期" style={{ width: "33%" }}>
              <Input />
            </Form.Item>
          </Space.Compact>
          <Form.Item name="source_url" label="来源 URL">
            <Input />
          </Form.Item>
          <Form.Item name="file_path" label="文件路径">
            <Input />
          </Form.Item>
          <Space.Compact block>
            <Form.Item name="parsed_text_path" label="解析文本路径" style={{ width: "50%" }}>
              <Input />
            </Form.Item>
            <Form.Item name="parsed_markdown_path" label="解析 Markdown 路径" style={{ width: "50%" }}>
              <Input />
            </Form.Item>
          </Space.Compact>
        </Form>
      </Modal>

      <Drawer title="公告财报详情" open={Boolean(detail)} onClose={() => setDetail(null)} size={760}>
        {detail ? (
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            <DetailRows record={detail as unknown as Record<string, unknown>} />
            <WorkbenchCard title="解析预览">
              <Typography.Paragraph copyable={Boolean(parsedContent)} style={{ whiteSpace: "pre-wrap" }}>
                {parsedContent || "暂无解析内容"}
              </Typography.Paragraph>
            </WorkbenchCard>
          </Space>
        ) : null}
      </Drawer>
    </>
  );
}
