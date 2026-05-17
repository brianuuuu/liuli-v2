import { Button, Drawer, Form, Input, InputNumber, Modal, Select, Space, Switch, Tabs, message } from "antd";
import { useCallback, useMemo, useState } from "react";
import { listJobLogs, listJobs, listRunRequests, runJob, syncJobDefinitions, updateJob } from "../../../api/jobs";
import type { JobConfig, JobRunLog } from "../../../types/api";
import { DataPanel } from "../../../components/common/DataPanel";
import { EmptyAction } from "../../../components/common/EmptyAction";
import { WorkbenchCard } from "../../../components/common/WorkbenchCard";
import { useAsyncData } from "../../../hooks/useAsyncData";
import { DetailRows, formatTime, parseJsonObject } from "./shared";
import { JobCard } from "./JobCard";
import { JobLogEventList, JobRequestEventList } from "./JobRunEventList";

type JobFormValues = {
  display_name?: string;
  description?: string;
  trigger_type?: string;
  cron_expr?: string;
  enabled?: boolean;
  timeout_seconds?: number;
  max_retries?: number;
};

export function JobsSection() {
  const jobs = useAsyncData(useCallback(listJobs, []), []);
  const requests = useAsyncData(useCallback(listRunRequests, []), []);
  const [selectedJob, setSelectedJob] = useState<JobConfig | null>(null);
  const [keyword, setKeyword] = useState("");
  const [moduleFilter, setModuleFilter] = useState<string | undefined>();
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [enabledFilter, setEnabledFilter] = useState<string | undefined>();
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

  const moduleOptions = useMemo(() => {
    return Array.from(new Set(jobs.data.map((item) => item.module_name).filter(Boolean)))
      .sort()
      .map((moduleName) => ({ value: moduleName, label: moduleName }));
  }, [jobs.data]);

  const filteredJobs = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    return jobs.data.filter((job) => {
      const status = job.last_status || "未运行";
      const text = `${job.display_name || ""}\n${job.job_name}\n${job.module_name}\n${job.description || ""}`.toLowerCase();
      return (
        (!query || text.includes(query)) &&
        (!moduleFilter || job.module_name === moduleFilter) &&
        (!statusFilter || status === statusFilter) &&
        (!enabledFilter || String(job.enabled) === enabledFilter)
      );
    });
  }, [enabledFilter, jobs.data, keyword, moduleFilter, statusFilter]);

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

  return (
    <>
      <div className="job-center-layout">
        <DataPanel
          toolbar={
            <div className="job-center-toolbar">
              <Input.Search
                allowClear
                size="small"
                placeholder="搜索任务"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                className="job-center-search"
              />
              <Select
                allowClear
                size="small"
                placeholder="模块"
                value={moduleFilter}
                options={moduleOptions}
                onChange={setModuleFilter}
                className="job-center-filter"
              />
              <Select
                allowClear
                size="small"
                placeholder="状态"
                value={statusFilter}
                options={[
                  { value: "success", label: "success" },
                  { value: "completed", label: "completed" },
                  { value: "running", label: "running" },
                  { value: "failed", label: "failed" },
                  { value: "error", label: "error" },
                  { value: "未运行", label: "未运行" }
                ]}
                onChange={setStatusFilter}
                className="job-center-filter"
              />
              <Select
                allowClear
                size="small"
                placeholder="启用"
                value={enabledFilter}
                options={[
                  { value: "true", label: "启用" },
                  { value: "false", label: "停用" }
                ]}
                onChange={setEnabledFilter}
                className="job-center-filter"
              />
              <div className="data-panel-toolbar-spacer" />
              <Button size="small" onClick={sync}>同步任务定义</Button>
            </div>
          }
        >
          <div className="job-card-grid-wrap">
            {jobs.loading ? <EmptyAction description="正在加载任务定义" /> : null}
            {!jobs.loading && filteredJobs.length === 0 ? <EmptyAction description="暂无匹配任务" /> : null}
            {!jobs.loading && filteredJobs.length > 0 ? (
              <div className="job-card-grid">
                {filteredJobs.map((job) => (
                  <JobCard
                    key={job.job_name}
                    job={job}
                    selected={selectedJob?.job_name === job.job_name}
                    onSelect={selectJob}
                    onRun={openRun}
                    onEdit={openEdit}
                    onLogs={selectJob}
                    onDetail={(record) => setDetailRecord(record as unknown as Record<string, unknown>)}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </DataPanel>

        <aside className="job-center-side">
          <WorkbenchCard title={selectedJob ? `运行记录：${selectedJob.display_name || selectedJob.job_name}` : "运行记录"}>
            <Tabs
              size="small"
              items={[
                {
                  key: "requests",
                  label: "运行请求",
                  children: <JobRequestEventList rows={requestRows} loading={requests.loading} />
                },
                {
                  key: "logs",
                  label: "执行日志",
                  children: <JobLogEventList rows={logs} loading={logsLoading} />
                }
              ]}
            />
          </WorkbenchCard>
        </aside>
      </div>

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
