import { Button, Drawer, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useState } from "react";
import { createReport, deleteReport, getReportContent, listReports, updateReport } from "../../../api/reports";
import type { Report } from "../../../types/api";
import { DataPanel } from "../../../components/common/DataPanel";
import { WorkbenchCard } from "../../../components/common/WorkbenchCard";
import { useAsyncData } from "../../../hooks/useAsyncData";
import { DetailRows, formatTime } from "./shared";

type ReportFormValues = {
  title: string;
  report_type: string;
  source_module: string;
  target_type?: string;
  target_id?: number;
  summary?: string;
  file_format: string;
  file_path: string;
  generated_by: string;
  status: string;
};

export function ReportsSection() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const reports = useAsyncData(useCallback(async () => listReports({ limit: pageSize, offset: (page - 1) * pageSize }), [page, pageSize]), {
    items: [],
    total: 0,
    limit: 50,
    offset: 0,
    has_more: false
  });
  const [editing, setEditing] = useState<Report | null>(null);
  const [detail, setDetail] = useState<Report | null>(null);
  const [content, setContent] = useState("");
  const [contentLoading, setContentLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<ReportFormValues>();

  function openCreate() {
    setEditing(null);
    form.setFieldsValue({ file_format: "md", generated_by: "manual", status: "draft" });
    setOpen(true);
  }

  function openEdit(record: Report) {
    setEditing(record);
    form.setFieldsValue({
      title: record.title,
      report_type: record.report_type,
      source_module: record.source_module,
      target_type: record.target_type || undefined,
      target_id: record.target_id || undefined,
      summary: record.summary || undefined,
      file_format: record.file_format || "md",
      file_path: record.file_path || "",
      generated_by: record.generated_by || "manual",
      status: record.status || "draft"
    });
    setOpen(true);
  }

  async function submit() {
    const values = await form.validateFields();
    const payload = {
      ...values,
      target_type: values.target_type || null,
      target_id: values.target_id || null,
      summary: values.summary || null
    };
    if (editing) {
      await updateReport(editing.id, payload);
      message.success("报告已更新");
    } else {
      await createReport(payload);
      message.success("报告已新增");
    }
    setOpen(false);
    await reports.refresh();
  }

  async function remove(record: Report) {
    await deleteReport(record.id);
    message.success("报告已删除");
    await reports.refresh();
  }

  async function showDetail(record: Report) {
    setDetail(record);
    setContent("");
    if (!record.file_path) return;
    setContentLoading(true);
    try {
      setContent(await getReportContent(record.id));
    } catch {
      setContent("报告文件不存在或无法读取。");
    } finally {
      setContentLoading(false);
    }
  }

  const columns: ColumnsType<Report> = [
    { title: "标题", dataIndex: "title", ellipsis: true },
    { title: "类型", dataIndex: "report_type", width: 110 },
    { title: "来源模块", dataIndex: "source_module", width: 140 },
    { title: "状态", dataIndex: "status", width: 90, render: (value) => <Tag>{value || "-"}</Tag> },
    { title: "生成", dataIndex: "generated_by", width: 100, render: (value) => value || "-" },
    { title: "创建", dataIndex: "created_at", width: 160, render: formatTime },
    {
      title: "操作",
      width: 180,
      render: (_, record) => (
        <Space>
          <Button size="small" onClick={() => showDetail(record)}>详情</Button>
          <Button size="small" onClick={() => openEdit(record)}>编辑</Button>
          <Popconfirm title="删除这个报告索引？" onConfirm={() => remove(record)}>
            <Button size="small" danger>删除</Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <>
      <DataPanel
        toolbar={
          <>
            <div className="data-panel-toolbar-spacer" />
            <Button size="small" type="primary" onClick={openCreate}>新增报告</Button>
          </>
        }
      >
        <Table
          rowKey="id"
          size="small"
          loading={reports.loading}
          dataSource={reports.data.items}
          columns={columns}
          pagination={{
            current: page,
            pageSize,
            total: reports.data.total,
            showSizeChanger: true,
            pageSizeOptions: [20, 50, 100, 200],
            onChange: (nextPage, nextPageSize) => {
              setPage(nextPage);
              setPageSize(nextPageSize);
            }
          }}
        />
      </DataPanel>

      <Modal title={editing ? "编辑报告" : "新增报告"} open={open} onCancel={() => setOpen(false)} onOk={submit} destroyOnHidden>
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="title" label="标题" rules={[{ required: true, message: "请输入标题" }]}>
            <Input />
          </Form.Item>
          <Space.Compact block>
            <Form.Item name="report_type" label="报告类型" style={{ width: "50%" }} rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="source_module" label="来源模块" style={{ width: "50%" }} rules={[{ required: true }]}>
              <Input />
            </Form.Item>
          </Space.Compact>
          <Space.Compact block>
            <Form.Item name="target_type" label="目标类型" style={{ width: "50%" }}>
              <Input />
            </Form.Item>
            <Form.Item name="target_id" label="目标 ID" style={{ width: "50%" }}>
              <InputNumber min={1} style={{ width: "100%" }} />
            </Form.Item>
          </Space.Compact>
          <Form.Item name="summary" label="摘要">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="file_path" label="文件路径" rules={[{ required: true, message: "请输入文件路径" }]}>
            <Input />
          </Form.Item>
          <Space.Compact block>
            <Form.Item name="file_format" label="格式" style={{ width: "33%" }}>
              <Select options={[{ value: "md", label: "md" }, { value: "txt", label: "txt" }, { value: "pdf", label: "pdf" }]} />
            </Form.Item>
            <Form.Item name="generated_by" label="生成方式" style={{ width: "33%" }}>
              <Input />
            </Form.Item>
            <Form.Item name="status" label="状态" style={{ width: "34%" }}>
              <Select options={[{ value: "draft", label: "draft" }, { value: "published", label: "published" }, { value: "archived", label: "archived" }]} />
            </Form.Item>
          </Space.Compact>
        </Form>
      </Modal>

      <Drawer title="报告详情" open={Boolean(detail)} onClose={() => setDetail(null)} size={720}>
        {detail ? (
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            <DetailRows record={detail as unknown as Record<string, unknown>} />
            <WorkbenchCard title="内容预览">
              <Typography.Paragraph copyable={Boolean(content)} style={{ whiteSpace: "pre-wrap" }}>
                {contentLoading ? "读取中..." : content || "暂无内容"}
              </Typography.Paragraph>
            </WorkbenchCard>
          </Space>
        ) : null}
      </Drawer>
    </>
  );
}
