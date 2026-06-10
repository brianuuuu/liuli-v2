import { SearchOutlined } from "@ant-design/icons";
import { Button, Checkbox, Drawer, Form, Input, InputNumber, Modal, Segmented, Select, Space, Switch, Tabs, message } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { listJobLogs, listJobs, listRunRequests, runJob, syncJobDefinitions, updateJob } from "../../../api/jobs";
import type { JobConfig, JobRunLog } from "../../../types/api";

import { EmptyAction } from "../../../components/common/EmptyAction";
import { useAsyncData } from "../../../hooks/useAsyncData";
import { DetailRows, formatTime } from "./shared";
import { JobCard } from "./JobCard";
import { JobLogEventList, JobRequestEventList } from "./JobRunEventList";
import {
  buildJobConfigPayload,
  getJobConfigEnabled,
  getDefaultJobScheduleValues,
  getFormValuesFromJob,
  type JobScheduleFormValues
} from "./jobScheduleConfig";

type RunParamType = "string" | "number" | "boolean";

type RunParamRow = {
  id: number;
  key: string;
  type: RunParamType;
  value: string;
};

type RunParamSchemaItem = {
  type?: string;
  label?: string;
  default?: unknown;
  placeholder?: string;
  min?: number;
  options?: Array<{ value: string; label: string }>;
};

type RunParamSchemaEntry = [string, RunParamSchemaItem];

function runParamSchemaEntries(job: JobConfig | null): RunParamSchemaEntry[] {
  const schema = job?.params_schema;
  if (!schema) return [];
  return Object.entries(schema)
    .filter((entry): entry is RunParamSchemaEntry => Boolean(entry[1]) && typeof entry[1] === "object" && !Array.isArray(entry[1]));
}

function defaultRunParamValues(job: JobConfig): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const [key, schema] of runParamSchemaEntries(job)) {
    if (schema.default !== undefined) {
      values[key] = schema.default;
    } else if (schema.type === "boolean") {
      values[key] = false;
    } else {
      values[key] = undefined;
    }
  }
  return values;
}

export function JobsSection() {
  const jobs = useAsyncData(useCallback(listJobs, []), []);
  const requests = useAsyncData(useCallback(async () => (await listRunRequests({ limit: 200, offset: 0 })).items, []), []);
  const [selectedJob, setSelectedJob] = useState<JobConfig | null>(null);
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [enabledFilter, setEnabledFilter] = useState<string>("true");
  const [logs, setLogs] = useState<JobRunLog[]>([]);
  const [allLogs, setAllLogs] = useState<JobRunLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logDrawerOpen, setLogDrawerOpen] = useState(false);
  const [logDrawerMode, setLogDrawerMode] = useState<"single" | "all">("single");
  const [editOpen, setEditOpen] = useState(false);
  const [runOpen, setRunOpen] = useState(false);
  const [detailRecord, setDetailRecord] = useState<Record<string, unknown> | null>(null);
  const [runParamRows, setRunParamRows] = useState<RunParamRow[]>([]);
  const [schemaParamValues, setSchemaParamValues] = useState<Record<string, unknown>>({});
  const [showAdvancedParams, setShowAdvancedParams] = useState(false);
  const [editForm] = Form.useForm<JobScheduleFormValues>();
  const executionMode = Form.useWatch("execution_mode", editForm);
  const scheduleKind = Form.useWatch("schedule_kind", editForm);
  const editInitialValues = useMemo(
    () => selectedJob ? getFormValuesFromJob(selectedJob) : getDefaultJobScheduleValues(),
    [selectedJob]
  );
  const editFormKey = useMemo(
    () => `${selectedJob?.job_name || "job-config"}:${JSON.stringify(selectedJob?.config_json || {})}`,
    [selectedJob]
  );

  useEffect(() => {
    if (!editOpen || !selectedJob) return;
    editForm.resetFields();
    editForm.setFieldsValue(editInitialValues);
  }, [editForm, editInitialValues, editOpen, selectedJob]);

  const jobMap = useMemo(() => {
    const map = new Map<string, string>();
    jobs.data.forEach((job) => {
      if (job.display_name) {
        map.set(job.job_name, job.display_name);
      }
    });
    return map;
  }, [jobs.data]);

  const requestRows = useMemo(
    () => logDrawerMode === "all" ? requests.data : requests.data.filter((item) => !selectedJob || item.job_name === selectedJob.job_name),
    [logDrawerMode, requests.data, selectedJob]
  );

  const jobSummary = useMemo(() => {
    const total = jobs.data.length;
    const failed = jobs.data.filter((job) => job.last_status === "failed" || job.last_status === "error").length;
    const running = jobs.data.filter((job) => job.last_status === "running").length;
    const idle = jobs.data.filter((job) => !job.last_status || job.last_status === "未运行").length;
    const completed = jobs.data.filter((job) => job.last_status === "success" || job.last_status === "completed").length;
    const enabled = jobs.data.filter(getJobConfigEnabled).length;
    const lastRun = jobs.data
      .map((job) => job.last_run_at)
      .filter(Boolean)
      .sort((a, b) => String(b).localeCompare(String(a)))[0];
    return {
      total,
      enabled,
      running,
      failed,
      idle,
      completed,
      lastRun: lastRun ? formatTime(lastRun) : "-"
    };
  }, [jobs.data]);

  const filteredJobs = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    const result = jobs.data.filter((job) => {
      const status = job.last_status || "未运行";
      const text = `${job.display_name || ""}\n${job.job_name}\n${job.module_name}\n${job.description || ""}`.toLowerCase();
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "failed" && (status === "failed" || status === "error")) ||
        (statusFilter === "running" && status === "running") ||
        (statusFilter === "idle" && status === "未运行") ||
        (statusFilter === "completed" && (status === "success" || status === "completed"));
      return (
        (!query || text.includes(query)) &&
        matchesStatus &&
        (enabledFilter === "all" || String(getJobConfigEnabled(job)) === enabledFilter)
      );
    });
    return result.sort((a, b) => {
      const timeA = a.last_run_at || "";
      const timeB = b.last_run_at || "";
      if (timeA !== timeB) {
        return timeB.localeCompare(timeA);
      }
      return a.job_name.localeCompare(b.job_name);
    });
  }, [enabledFilter, jobs.data, keyword, statusFilter]);

  async function refreshAll() {
    await Promise.all([jobs.refresh(), requests.refresh()]);
    if (selectedJob) await loadLogs(selectedJob.job_name);
  }

  async function loadLogs(jobName: string) {
    setLogsLoading(true);
    try {
      const page = await listJobLogs(jobName, { limit: 200, offset: 0 });
      setLogs(page.items);
    } finally {
      setLogsLoading(false);
    }
  }

  async function selectJob(record: JobConfig) {
    setSelectedJob(record);
    await loadLogs(record.job_name);
  }

  async function openJobLogs(record: JobConfig) {
    setSelectedJob(record);
    setLogDrawerMode("single");
    setLogDrawerOpen(true);
    await loadLogs(record.job_name);
  }

  async function openAllLogs() {
    setLogDrawerMode("all");
    setSelectedJob(null);
    setLogDrawerOpen(true);
    setLogsLoading(true);
    try {
      const result = await Promise.all(jobs.data.map((job) => listJobLogs(job.job_name, { limit: 200, offset: 0 })));
      setAllLogs(result.flatMap((page) => page.items).sort((a, b) => String(b.started_at || "").localeCompare(String(a.started_at || ""))));
    } finally {
      setLogsLoading(false);
    }
  }

  async function sync() {
    const result = await syncJobDefinitions();
    message.success(`已同步 ${result.synced} 个任务定义`);
    await refreshAll();
  }

  function openEdit(record: JobConfig) {
    setSelectedJob(record);
    setEditOpen(true);
  }

  async function submitEdit() {
    if (!selectedJob) return;
    const values = await editForm.validateFields();
    await updateJob(selectedJob.job_name, buildJobConfigPayload(values));
    message.success("任务配置已更新");
    setEditOpen(false);
    await refreshAll();
  }

  function openRun(record: JobConfig) {
    setSelectedJob(record);
    setRunParamRows([]);
    setSchemaParamValues(defaultRunParamValues(record));
    setShowAdvancedParams(false);
    setRunOpen(true);
  }

  function addRunParamRow() {
    setRunParamRows((rows) => [...rows, { id: Date.now(), key: "", type: "string", value: "" }]);
    setShowAdvancedParams(true);
  }

  function updateRunParamRow(id: number, patch: Partial<RunParamRow>) {
    setRunParamRows((rows) => rows.map((row) => row.id === id ? { ...row, ...patch } : row));
  }

  function removeRunParamRow(id: number) {
    setRunParamRows((rows) => rows.filter((row) => row.id !== id));
  }

  function updateSchemaParam(key: string, value: unknown) {
    setSchemaParamValues((values) => ({ ...values, [key]: value }));
  }

  function buildRunParams(showError: boolean): Record<string, unknown> | null {
    const params: Record<string, unknown> = {};
    for (const [key, schema] of runParamSchemaEntries(selectedJob)) {
      const value = schemaParamValues[key];
      if (value === undefined || value === null || value === "") continue;
      if (schema.type === "number") {
        const numericValue = Number(value);
        if (!Number.isFinite(numericValue)) {
          if (showError) message.error(`参数 ${key} 需要填写数字`);
          return null;
        }
        params[key] = numericValue;
      } else if (schema.type === "boolean") {
        params[key] = value === true;
      } else {
        params[key] = value;
      }
    }
    const keys = new Set<string>();
    for (const row of runParamRows) {
      const key = row.key.trim();
      if (!key && !row.value.trim()) continue;
      if (!key) {
        if (showError) message.error("请填写参数名，或删除空参数行");
        return null;
      }
      if (keys.has(key)) {
        if (showError) message.error(`参数名重复：${key}`);
        return null;
      }
      keys.add(key);
      if (row.type === "number") {
        const value = Number(row.value);
        if (!Number.isFinite(value)) {
          if (showError) message.error(`参数 ${key} 需要填写数字`);
          return null;
        }
        params[key] = value;
      } else if (row.type === "boolean") {
        params[key] = row.value === "true";
      } else {
        params[key] = row.value;
      }
    }
    return params;
  }

  function renderRunParamValue(row: RunParamRow) {
    if (row.type === "boolean") {
      return (
        <Select
          size="small"
          value={row.value || "false"}
          options={[
            { value: "true", label: "是" },
            { value: "false", label: "否" }
          ]}
          onChange={(value) => updateRunParamRow(row.id, { value })}
        />
      );
    }
    return (
      <Input
        size="small"
        placeholder={row.type === "number" ? "数字" : "参数值"}
        value={row.value}
        onChange={(event) => updateRunParamRow(row.id, { value: event.target.value })}
      />
    );
  }

  function renderSchemaParam(key: string, schema: RunParamSchemaItem) {
    const label = schema.label || key;
    if (schema.type === "boolean") {
      return (
        <label className="job-config-inline-field" key={key}>
          <span>{label}</span>
          <Switch checked={schemaParamValues[key] === true} onChange={(checked) => updateSchemaParam(key, checked)} />
        </label>
      );
    }
    if (schema.type === "number") {
      return (
        <label className="job-config-inline-field" key={key}>
          <span>{label}</span>
          <InputNumber
            min={schema.min}
            precision={0}
            placeholder={schema.placeholder}
            value={schemaParamValues[key] as number | null | undefined}
            onChange={(value) => updateSchemaParam(key, value)}
            style={{ width: "100%" }}
          />
        </label>
      );
    }
    if (schema.type === "select") {
      return (
        <label className="job-config-inline-field" key={key}>
          <span>{label}</span>
          <Select
            allowClear
            placeholder={schema.placeholder}
            value={schemaParamValues[key] as string | undefined}
            options={schema.options || []}
            onChange={(value) => updateSchemaParam(key, value)}
          />
        </label>
      );
    }
    return (
      <label className="job-config-inline-field" key={key}>
        <span>{label}</span>
        <Input
          placeholder={schema.placeholder}
          value={(schemaParamValues[key] as string | undefined) || ""}
          onChange={(event) => updateSchemaParam(key, event.target.value)}
        />
      </label>
    );
  }

  async function submitRun() {
    if (!selectedJob) return;
    const params = buildRunParams(true);
    if (!params) return;
    await runJob(selectedJob.job_name, params);
    message.success("已提交运行请求");
    setRunOpen(false);
    await refreshAll();
  }

  return (
    <>
      <div className="job-center-layout">
        <div className="data-panel-toolbar job-center-toolbar">
          <Segmented
            size="small"
            value={statusFilter}
            options={[
              { value: "all", label: `全部 (${jobSummary.total})` },
              { value: "failed", label: `异常 (${jobSummary.failed})` },
              { value: "running", label: `运行中 (${jobSummary.running})` },
              { value: "idle", label: `未运行 (${jobSummary.idle})` },
              { value: "completed", label: `已完成 (${jobSummary.completed})` }
            ]}
            onChange={(value) => setStatusFilter(String(value))}
          />
          <Input.Search
            allowClear
            size="small"
            placeholder="搜索任务名 / 描述"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            style={{ width: 210 }}
          />
          <Select
            size="small"
            value={enabledFilter}
            options={[
              { value: "all", label: "显示全部" },
              { value: "true", label: `启用 (${jobSummary.enabled})` },
              { value: "false", label: `停用 (${jobSummary.total - jobSummary.enabled})` }
            ]}
            onChange={setEnabledFilter}
            style={{ width: 110 }}
          />
          <div className="data-panel-toolbar-spacer" />
          <span style={{ fontSize: "13px", color: "var(--ll-muted)", whiteSpace: "nowrap" }}>
            最近运行: <span style={{ color: "var(--ll-text)" }}>{jobSummary.lastRun}</span>
          </span>
          <div className="data-panel-toolbar-divider" />
          <Button size="small" onClick={sync}>同步任务定义</Button>
          <Button size="small" onClick={openAllLogs}>查看所有日志</Button>
        </div>
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
                onLogs={openJobLogs}
                onDetail={(record) => setDetailRecord(record as unknown as Record<string, unknown>)}
              />
            ))}
          </div>
        ) : null}
      </div>

      <Modal
        title={`编辑任务：${selectedJob?.display_name || selectedJob?.job_name || ""}`}
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={submitEdit}
        okText="保存"
        cancelText="取消"
        width={520}
        destroyOnHidden
      >
        <Form
          key={editFormKey}
          form={editForm}
          initialValues={editInitialValues}
          layout="vertical"
          preserve={false}
          className="job-config-form"
        >
          <div className="job-config-section">
            <div className="job-config-section-title">任务状态</div>
            <div className="job-config-status-row">
              <Form.Item
                name="enabled"
                valuePropName="checked"
                getValueProps={(value) => ({ checked: value === true })}
                normalize={(value) => value === true}
                noStyle
              >
                <Switch checkedChildren="启用" unCheckedChildren="停用" />
              </Form.Item>
            </div>
          </div>

          <div className="job-config-section">
            <div className="job-config-section-title">执行方式</div>
            <Form.Item name="execution_mode">
              <Segmented
                block
                options={[
                  { value: "manual", label: "手动执行" },
                  { value: "schedule", label: "周期执行" }
                ]}
                onChange={(value) => {
                  if (value === "manual") {
                    editForm.setFieldsValue({ allow_manual_run: true, cron_expr: undefined });
                  } else {
                    editForm.setFieldsValue({ schedule_kind: "daily", run_time: "08:00", interval_minutes: 30 });
                  }
                }}
              />
            </Form.Item>

            {executionMode === "schedule" ? (
              <>
                <Form.Item name="schedule_kind" label="周期类型">
                  <Select
                    options={[
                      { value: "daily", label: "每日" },
                      { value: "interval", label: "固定间隔" },
                      { value: "custom", label: "自定义 Cron" }
                    ]}
                    onChange={(value) => {
                      if (value === "daily") editForm.setFieldValue("run_time", "08:00");
                      if (value === "interval") editForm.setFieldValue("interval_minutes", editForm.getFieldValue("interval_minutes") || 30);
                    }}
                  />
                </Form.Item>
                {scheduleKind === "daily" ? (
                  <Form.Item name="run_time" label="执行时间">
                    <Input type="time" />
                  </Form.Item>
                ) : null}
                {scheduleKind === "interval" ? (
                  <label className="job-config-inline-field job-config-interval-field">
                    <span>间隔时间</span>
                    <Form.Item name="interval_minutes" noStyle rules={[{ required: true, message: "请输入间隔分钟数" }]}>
                      <InputNumber min={1} precision={0} addonAfter="分钟" style={{ width: "100%" }} />
                    </Form.Item>
                  </label>
                ) : null}
                {scheduleKind === "custom" ? (
                  <Form.Item
                    name="cron_expr"
                    label="Cron 表达式"
                    rules={[{ required: true, message: "请输入 Cron 表达式" }]}
                  >
                    <Input placeholder="例如 0 8 * * *" />
                  </Form.Item>
                ) : null}
              </>
            ) : null}
          </div>

          <div className="job-config-section">
            <div className="job-config-section-title">运行参数</div>
            <div className="job-config-two-col">
              <label className="job-config-inline-field">
                <span>超时秒数</span>
                <Form.Item name="timeout_seconds" noStyle>
                  <InputNumber min={1} style={{ width: "100%" }} />
                </Form.Item>
              </label>
              <label className="job-config-inline-field">
                <span>最大重试</span>
                <Form.Item name="max_retries" noStyle>
                  <InputNumber min={0} style={{ width: "100%" }} />
                </Form.Item>
              </label>
            </div>
          </div>

          <div className="job-config-section">
            <div className="job-config-section-title">任务通知</div>
            <div className="job-config-notify-row">
              <Checkbox disabled>企业微信</Checkbox>
              <Checkbox checked disabled>邮件通知</Checkbox>
            </div>
            <div className="job-config-hint">通知渠道仅作界面展示，当前版本暂不保存。</div>
          </div>
        </Form>
      </Modal>

      <Modal
        title="运行任务"
        open={runOpen}
        onCancel={() => setRunOpen(false)}
        onOk={submitRun}
        okText="立即运行"
        cancelText="取消"
        destroyOnHidden
      >
        {selectedJob ? (
          <div className="job-run-panel">
            <div className="job-run-summary">
              <div>
                <span>任务</span>
                <strong>{selectedJob.display_name || selectedJob.job_name}</strong>
              </div>
              <div>
                <span>模块</span>
                <strong>{selectedJob.module_name}</strong>
              </div>
              <div>
                <span>最近状态</span>
                <strong>{selectedJob.last_status || "未运行"}</strong>
              </div>
            </div>
            {selectedJob.description ? <p className="job-run-description">{selectedJob.description}</p> : null}
            {runParamSchemaEntries(selectedJob).length ? (
              <div className="job-config-section">
                <div className="job-config-section-title">运行参数</div>
                <Space orientation="vertical" size={12} style={{ width: "100%" }}>
                  {runParamSchemaEntries(selectedJob).map(([key, schema]) => renderSchemaParam(key, schema))}
                </Space>
              </div>
            ) : (
              <div className="job-run-no-params">此任务默认无需填写参数，可以直接运行。</div>
            )}
            <button
              type="button"
              className="job-run-advanced-toggle"
              onClick={() => setShowAdvancedParams((value) => !value)}
            >
              {showAdvancedParams ? "收起高级参数" : "高级参数"}
            </button>
            {showAdvancedParams ? (
              <div className="job-run-advanced">
                <div className="job-run-param-head">
                  <span>参数名</span>
                  <span>类型</span>
                  <span>值</span>
                  <span />
                </div>
                {runParamRows.map((row) => (
                  <div className="job-run-param-row" key={row.id}>
                    <Input
                      size="small"
                      placeholder="例如 stock_code"
                      value={row.key}
                      onChange={(event) => updateRunParamRow(row.id, { key: event.target.value })}
                    />
                    <Select
                      size="small"
                      value={row.type}
                      options={[
                        { value: "string", label: "文本" },
                        { value: "number", label: "数字" },
                        { value: "boolean", label: "是否" }
                      ]}
                      onChange={(value) => updateRunParamRow(row.id, { type: value, value: value === "boolean" ? "false" : "" })}
                    />
                    {renderRunParamValue(row)}
                    <Button size="small" onClick={() => removeRunParamRow(row.id)}>删除</Button>
                  </div>
                ))}
                <Button size="small" onClick={addRunParamRow}>添加参数</Button>
                <pre className="job-run-json-preview">
                  {JSON.stringify(buildRunParams(false) || {}, null, 2)}
                </pre>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <Drawer title="任务详情" open={Boolean(detailRecord)} onClose={() => setDetailRecord(null)} size={540}>
        {detailRecord ? <DetailRows record={detailRecord} /> : null}
      </Drawer>

      <Drawer
        title={logDrawerMode === "all" ? "所有任务日志" : `运行记录：${selectedJob?.display_name || selectedJob?.job_name || ""}`}
        open={logDrawerOpen}
        onClose={() => setLogDrawerOpen(false)}
        size={720}
      >
        <Tabs
          size="small"
          items={[
            {
              key: "requests",
              label: "运行请求",
              children: <JobRequestEventList rows={requestRows} loading={requests.loading} jobMap={jobMap} />
            },
            {
              key: "logs",
              label: "执行日志",
              children: <JobLogEventList rows={logDrawerMode === "all" ? allLogs : logs} loading={logsLoading} jobMap={jobMap} />
            }
          ]}
        />
      </Drawer>
    </>
  );
}
