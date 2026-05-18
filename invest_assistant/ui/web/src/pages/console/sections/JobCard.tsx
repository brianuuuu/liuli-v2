import { Button, Space, Tag } from "antd";
import type { JobConfig } from "../../../types/api";
import { formatTime } from "./shared";

export function jobStatusColor(status?: string | null) {
  if (status === "success" || status === "completed") return "green";
  if (status === "failed" || status === "error") return "red";
  if (status === "running") return "blue";
  return "default";
}

export function JobCard({
  job,
  selected,
  onSelect,
  onRun,
  onEdit,
  onLogs,
  onDetail
}: {
  job: JobConfig;
  selected: boolean;
  onSelect: (job: JobConfig) => void;
  onRun: (job: JobConfig) => void;
  onEdit: (job: JobConfig) => void;
  onLogs: (job: JobConfig) => void;
  onDetail: (job: JobConfig) => void;
}) {
  const title = job.display_name || job.job_name;
  return (
    <article className={selected ? "job-card selected" : "job-card"} onClick={() => onSelect(job)}>
      <div className="job-card-head">
        <div className="job-card-title-wrap">
          <div className="job-card-title">{title}</div>
          <div className="job-card-name">{job.job_name}</div>
        </div>
        <Tag color={jobStatusColor(job.last_status)}>{job.last_status || "未运行"}</Tag>
      </div>

      {job.description ? <p className="job-card-desc">{job.description}</p> : null}

      <div className="job-card-meta">
        <span>模块</span><strong>{job.module_name}</strong>
        <span>触发</span><strong>{job.trigger_type || "manual"}</strong>
        <span>最近运行</span><strong>{formatTime(job.last_run_at)}</strong>
        <span>超时</span><strong>{job.timeout_seconds || 300}s</strong>
        <span>重试</span><strong>{job.max_retries || 0}</strong>
        <span>启用</span><strong>{job.enabled ? "启用" : "停用"}</strong>
      </div>

      <div className="job-card-actions" onClick={(event) => event.stopPropagation()}>
        <Space size={6} wrap>
          <Button size="small" type="primary" onClick={() => onRun(job)}>运行</Button>
          <Button size="small" onClick={() => onEdit(job)}>配置</Button>
          <Button size="small" onClick={() => onLogs(job)}>日志</Button>
          <Button size="small" onClick={() => onDetail(job)}>详情</Button>
        </Space>
      </div>
    </article>
  );
}
