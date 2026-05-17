import { Button, Drawer, Form, Input, InputNumber, Modal, Select, Space, Switch, Table, Tabs, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useMemo, useState } from "react";
import { listJobLogs, listJobs, listRunRequests, runJob, syncJobDefinitions, updateJob } from "../../../api/jobs";
import type { JobConfig, JobRunLog, JobRunRequest } from "../../../types/api";
import { DataPanel } from "../../../components/common/DataPanel";
import { WorkbenchCard } from "../../../components/common/WorkbenchCard";
import { useAsyncData } from "../../../hooks/useAsyncData";
import { DetailRows, formatTime, parseJsonObject } from "./shared";

type JobFormValues = {
  display_name?: string;
  description?: string;
  trigger_type?: string;
  cron_expr?: string;
  enabled?: boolean;
  timeout_seconds?: number;
  max_retries?: number;
};

function statusColor(status?: string | null) {
  if (status === "success" || status === "completed") return "green";
  if (status === "failed" || status === "error") return "red";
  if (status === "running") return "blue";
  return "default";
}

export function JobsSection() {
  const jobs = useAsyncData(useCallback(listJobs, []), []);
  const requests = useAsyncData(useCallback(listRunRequests, []), []);
  const [selectedJob, setSelectedJob] = useState<JobConfig | null>(null);
  const [logs, setLogs] = useState<JobRunLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [runOpen, setRunOpen] = useState(false);
  const [detailRecord, setDetailRecord] = useState<Record<string, unknown> | null>(null);
  const [editForm] = Form.useForm<JobFormValues>();
  const [runForm] = Form.useForm<{ params: string }>();

  const requestRows = useMemo(
    () => requests.data.filter((item) => !selectedJob || item.job_name === selectedJob.job_name),
    [requests.data, selectedJob]
  );

  async function refreshAll() {
    await Promise.all([jobs.refresh(), requests.refresh()]);
    if (selectedJob) await loadLogs(selectedJob.job_name);
  }

  async function loadLogs(jobName: string) {
    setLogsLoading(true);
    try {
      setLogs(await listJobLogs(jobName));
    } finally {
      setLogsLoading(false);
    }
  }

  async function selectJob(record: JobConfig) {
    setSelectedJob(record);
    await loadLogs(record.job_name);
  }

  async function sync() {
    const result = await syncJobDefinitions();
    message.success(`已同步 ${result.synced} 个任务定义`);
    await refreshAll();
  }

  function openEdit(record: JobConfig) {
    setSelectedJob(record);
    editForm.setFieldsValue({
      display_name: record.display_name,
      description: record.description || undefined,
      trigger_type: record.trigger_type || "manual",
      cron_expr: record.cron_expr || undefined,
      enabled: record.enabled,
      timeout_seconds: record.timeout_seconds || 300,
      max_retries: record.max_retries || 0
    });
    setEditOpen(true);
  }

  async function submitEdit() {
    if (!selectedJob) return;
    const values = await editForm.validateFields();
    await updateJob(selectedJob.job_name, {
      ...values,
      description: values.description || null,
      cron_expr: values.cron_expr || null
    });
    message.success("任务配置已更新");
    setEditOpen(false);
    await refreshAll();
  }

  function openRun(record: JobConfig) {
    setSelectedJob(record);
    runForm.setFieldsValue({ params: "{}" });
    setRunOpen(true);
  }

  async function submitRun() {
    if (!selectedJob) return;
    const values = await runForm.validateFields();
    let params: Record<string, unknown>;
    try {
      params = parseJsonObject(values.params);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "JSON 参数格式错误");
      return;
    }
    await runJob(selectedJob.job_name, params);
    message.success("已提交运行请求");
    setRunOpen(false);
    await refreshAll();
  }

  const jobColumns: ColumnsType<JobConfig> = [
    { title: "任务", dataIndex: "display_name", render: (value, record) => value || record.job_name },
    { title: "模块", dataIndex: "module_name", width: 160 },
    { title: "触发", dataIndex: "trigger_type", width: 90 },
    { title: "启用", dataIndex: "enabled", width: 72, render: (value: boolean) => <Switch size="small" checked={value} disabled /> },
    { title: "最近状态", dataIndex: "last_status", width: 100, render: (value) => <Tag color={statusColor(value)}>{value || "-"}</Tag> },
    { title: "最近运行", dataIndex: "last_run_at", width: 150, render: formatTime },
    {
      title: "操作",
      width: 220,
      render: (_, record) => (
        <Space>
          <Button size="small" onClick={() => openRun(record)}>运行</Button>
          <Button size="small" onClick={() => openEdit(record)}>配置</Button>
          <Button size="small" onClick={() => selectJob(record)}>日志</Button>
        </Space>
      )
    }
  ];

  const requestColumns: ColumnsType<JobRunRequest> = [
    { title: "请求", dataIndex: "id", width: 80 },
    { title: "任务", dataIndex: "job_name" },
    { title: "状态", dataIndex: "status", width: 100, render: (value) => <Tag color={statusColor(value)}>{value}</Tag> },
    { title: "请求时间", dataIndex: "requested_at", width: 160, render: formatTime },
    { title: "错误", dataIndex: "error_message", ellipsis: true, render: (value) => value || "-" }
  ];

  const logColumns: ColumnsType<JobRunLog> = [
    { title: "日志", dataIndex: "id", width: 80 },
    { title: "状态", dataIndex: "status", width: 90, render: (value) => <Tag color={statusColor(value)}>{value}</Tag> },
    { title: "开始", dataIndex: "started_at", width: 160, render: formatTime },
    { title: "耗时", dataIndex: "duration_ms", width: 90, render: (value) => `${value} ms` },
    { title: "处理", dataIndex: "processed_count", width: 80 },
    { title: "新增", dataIndex: "inserted_count", width: 80 },
    { title: "更新", dataIndex: "updated_count", width: 80 },
    { title: "错误", dataIndex: "error_message", ellipsis: true, render: (value) => value || "-" }
  ];

  return (
    <>
      <DataPanel
        toolbar={
          <>
            <div className="data-panel-toolbar-spacer" />
            <Button size="small" onClick={sync}>同步任务定义</Button>
          </>
        }
      >
        <Table
          rowKey="job_name"
          size="small"
          loading={jobs.loading}
          dataSource={jobs.data}
          columns={jobColumns}
          pagination={{ pageSize: 10, showSizeChanger: true }}
          onRow={(record) => ({ onDoubleClick: () => setDetailRecord(record as unknown as Record<string, unknown>) })}
        />
      </DataPanel>

      <WorkbenchCard title={selectedJob ? `运行记录：${selectedJob.display_name || selectedJob.job_name}` : "运行记录"}>
        <Tabs
          size="small"
          items={[
            {
              key: "requests",
              label: "运行请求",
              children: <Table rowKey="id" size="small" loading={requests.loading} dataSource={requestRows} columns={requestColumns} pagination={{ pageSize: 6 }} />
            },
            {
              key: "logs",
              label: "执行日志",
              children: <Table rowKey="id" size="small" loading={logsLoading} dataSource={logs} columns={logColumns} pagination={{ pageSize: 6 }} />
            }
          ]}
        />
      </WorkbenchCard>

      <Modal title="任务配置" open={editOpen} onCancel={() => setEditOpen(false)} onOk={submitEdit} destroyOnHidden>
        <Form form={editForm} layout="vertical" preserve={false}>
          <Form.Item name="display_name" label="显示名称" rules={[{ required: true, message: "请输入显示名称" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="说明">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Space.Compact block>
            <Form.Item name="trigger_type" label="触发类型" style={{ width: "50%" }}>
              <Select options={[{ value: "manual", label: "manual" }, { value: "cron", label: "cron" }]} />
            </Form.Item>
            <Form.Item name="enabled" label="启用" valuePropName="checked" style={{ width: "50%" }}>
              <Switch />
            </Form.Item>
          </Space.Compact>
          <Form.Item name="cron_expr" label="Cron 表达式">
            <Input placeholder="手动任务可留空" />
          </Form.Item>
          <Space.Compact block>
            <Form.Item name="timeout_seconds" label="超时秒数" style={{ width: "50%" }}>
              <InputNumber min={1} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item name="max_retries" label="最大重试" style={{ width: "50%" }}>
              <InputNumber min={0} style={{ width: "100%" }} />
            </Form.Item>
          </Space.Compact>
        </Form>
      </Modal>

      <Modal title="手动运行任务" open={runOpen} onCancel={() => setRunOpen(false)} onOk={submitRun} destroyOnHidden>
        <Form form={runForm} layout="vertical" preserve={false}>
          <Form.Item name="params" label="运行参数 JSON" rules={[{ required: true, message: "请输入 JSON 对象" }]}>
            <Input.TextArea rows={8} />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer title="任务详情" open={Boolean(detailRecord)} onClose={() => setDetailRecord(null)} size={540}>
        {detailRecord ? <DetailRows record={detailRecord} /> : null}
      </Drawer>
    </>
  );
}
