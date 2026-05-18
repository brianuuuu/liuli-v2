import { Button, Dropdown, Tag } from "antd";
import type { MenuProps } from "antd";
import type { JobConfig } from "../../../types/api";
import { formatTime } from "./shared";

export function jobStatusColor(status?: string | null) {
  if (status === "success" || status === "completed") return "green";
  if (status === "failed" || status === "error") return "red";
  if (status === "running") return "blue";
  return "default";
}

function jobStatusClass(status?: string | null) {
  if (status === "success" || status === "completed") return "success";
  if (status === "failed" || status === "error") return "failed";
  if (status === "running") return "running";
  return "idle";
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
  const moreItems: MenuProps["items"] = [
    { key: "detail", label: "详情" }
  ];

  return (
    <article className={`job-card ${selected ? "selected" : ""} ${jobStatusClass(job.last_status)}`} onClick={() => onSelect(job)}>
      <div className="job-card-head">
        <div className="job-card-title-wrap">
          <div className="job-card-title">{title}</div>
          <div className="job-card-name">{job.job_name}</div>
        </div>
        <Tag color={jobStatusColor(job.last_status)}>{job.last_status || "未运行"}</Tag>
      </div>

      {job.description ? <p className="job-card-desc">{job.description}</p> : null}

      <div className="job-card-meta">
        <span>模块 <strong>{job.module_name}</strong></span>
        <span>最近 <strong>{formatTime(job.last_run_at)}</strong></span>
        <span>触发 <strong>{job.trigger_type || "manual"}</strong></span>
        <span>启用 <strong>{job.enabled ? "是" : "否"}</strong></span>
      </div>

      <div className="job-card-actions" onClick={(event) => event.stopPropagation()}>
        <Button size="small" className="job-card-action primary-soft" onClick={() => onRun(job)}>
          {job.last_status === "failed" || job.last_status === "error" ? "重试" : "运行"}
        </Button>
        <Button size="small" className="job-card-action" onClick={() => onEdit(job)}>配置</Button>
        <Button size="small" className="job-card-action" onClick={() => onLogs(job)}>日志</Button>
        <Dropdown
          trigger={["click"]}
          menu={{
            items: moreItems,
            onClick: ({ key }) => {
              if (key === "detail") onDetail(job);
            }
          }}
        >
          <Button size="small" className="job-card-action">更多</Button>
        </Dropdown>
      </div>
    </article>
  );
}
