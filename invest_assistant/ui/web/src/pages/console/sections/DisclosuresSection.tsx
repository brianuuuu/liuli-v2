import { Button, Drawer, Form, Input, InputNumber, Modal, Select, Space, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useState } from "react";
import {
  createDisclosure,
  disclosureToSourceItem,
  downloadDisclosure,
  fetchDisclosures,
  getParsedDisclosure,
  listDisclosures,
  parseDisclosure,
  updateDisclosure
} from "../../../api/disclosures";
import type { Disclosure } from "../../../types/api";
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

export function DisclosuresSection() {
  const disclosures = useAsyncData(useCallback(listDisclosures, []), []);
  const [keyword, setKeyword] = useState("");
  const [editing, setEditing] = useState<Disclosure | null>(null);
  const [detail, setDetail] = useState<Disclosure | null>(null);
  const [parsedContent, setParsedContent] = useState("");
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<DisclosureFormValues>();

  function openCreate() {
    setEditing(null);
    form.setFieldsValue({ source: "manual", disclosure_type: "announcement", parse_status: "pending" });
    setOpen(true);
  }

  function openEdit(record: Disclosure) {
    setEditing(record);
    form.setFieldsValue({
      stock_id: record.stock_id || undefined,
      source: record.source || "manual",
      disclosure_type: record.disclosure_type,
      title: record.title,
      publish_time: record.publish_time || undefined,
      report_period: record.report_period || undefined,
      source_url: record.source_url || undefined,
      file_path: record.file_path || undefined,
      parsed_text_path: record.parsed_text_path || undefined,
      parsed_markdown_path: record.parsed_markdown_path || undefined,
      parse_status: record.parse_status || "pending"
    });
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
    if (editing) {
      await updateDisclosure(editing.id, payload);
      message.success("公告财报已更新");
    } else {
      await createDisclosure(payload);
      message.success("公告财报已新增");
    }
    setOpen(false);
    await disclosures.refresh();
  }

  async function fetchRemote() {
    const result = await fetchDisclosures({ keyword: keyword.trim(), page_size: 30 });
    message.success(`已拉取 ${result.fetched} 条公告财报`);
    await disclosures.refresh();
  }

  async function runAction(record: Disclosure, action: "download" | "parse" | "source") {
    if (action === "download") await downloadDisclosure(record.id);
    if (action === "parse") await parseDisclosure(record.id);
    if (action === "source") await disclosureToSourceItem(record.id);
    message.success("操作已完成");
    await disclosures.refresh();
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
    { title: "标题", dataIndex: "title", ellipsis: true },
    { title: "来源", dataIndex: "source", width: 90, render: (value) => value || "-" },
    { title: "类型", dataIndex: "disclosure_type", width: 120 },
    { title: "报告期", dataIndex: "report_period", width: 110, render: (value) => value || "-" },
    { title: "解析", dataIndex: "parse_status", width: 100, render: (value) => <Tag>{value || "-"}</Tag> },
    { title: "发布时间", dataIndex: "publish_time", width: 160, render: formatTime },
    {
      title: "操作",
      width: 260,
      render: (_, record) => (
        <Space>
          <Button size="small" onClick={() => showDetail(record)}>详情</Button>
          <Button size="small" onClick={() => openEdit(record)}>编辑</Button>
          <Button size="small" onClick={() => runAction(record, "download")}>下载</Button>
          <Button size="small" onClick={() => runAction(record, "parse")}>解析</Button>
          <Button size="small" onClick={() => runAction(record, "source")}>入雷达</Button>
        </Space>
      )
    }
  ];

  return (
    <>
      <WorkbenchCard
        title="公告财报库"
        extra={
          <Space>
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
            <Button size="small" type="primary" onClick={openCreate}>新增记录</Button>
          </Space>
        }
      >
        <Table rowKey="id" size="small" loading={disclosures.loading} dataSource={disclosures.data} columns={columns} pagination={{ pageSize: 12, showSizeChanger: true }} />
      </WorkbenchCard>

      <Modal title={editing ? "编辑公告财报" : "新增公告财报"} open={open} onCancel={() => setOpen(false)} onOk={submit} destroyOnHidden size={720}>
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
            <Form.Item name="parse_status" label="解析状态" style={{ width: "33%" }}>
              <Select options={[{ value: "pending", label: "pending" }, { value: "downloaded", label: "downloaded" }, { value: "parsed", label: "parsed" }, { value: "failed", label: "failed" }]} />
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
