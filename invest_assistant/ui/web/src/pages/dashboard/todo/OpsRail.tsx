import { CheckCircleFilled, CloseCircleFilled, LoadingOutlined, PlayCircleOutlined } from "@ant-design/icons";
import { Button } from "antd";
import { useNavigate } from "react-router-dom";
import type { WorkbenchAiJob, WorkbenchOperations, WorkbenchRunLog, WorkbenchRunRequest } from "../../../api/console";
import { STOCK_EVENT_REVIEW_JOB_NAME, TRACK_EVENT_REVIEW_JOB_NAME } from "../../../api/jobs";
import { clockTime, formatDuration, relativeTime, shortTime } from "./todoFormat";

// 任务中心的 display_name 偏内部叫法，工作台按"它替我做什么"命名
const aiJobLabels: Record<string, string> = {
  [TRACK_EVENT_REVIEW_JOB_NAME]: "AI 审核赛道材料",
  [STOCK_EVENT_REVIEW_JOB_NAME]: "AI 审核标的材料",
  "market_radar.extract_daily_hotwords_deepseek": "AI 筛选热词"
};

type OpsRailProps = {
  data: WorkbenchOperations;
  runningKey: string | null;
  onRun: (jobName: string) => void;
};

export function OpsRail({ data, runningKey, onRun }: OpsRailProps) {
  return (
    <aside className="todo-rail">
      <RailCard title="AI 任务">
        {data.ai_jobs.map((job) => (
          <AiJobRow key={job.job_name} job={job} submitting={runningKey === job.job_name} onRun={onRun} />
        ))}
      </RailCard>
      <FailedJobs data={data} runningKey={runningKey} onRun={onRun} />
      <RailCard title="最近执行">
        {data.recent_runs.length ? (
          data.recent_runs.map((run) => (
            <div className="todo-run-row" key={run.id} title={run.error_message || undefined}>
              <span className="todo-run-time">{shortTime(run.finished_at)}</span>
              <RunStatusIcon status={run.status} />
              <span className="todo-run-name">{run.display_name}</span>
              <span className="todo-run-duration">{formatDuration(run.duration_ms)}</span>
            </div>
          ))
        ) : (
          <div className="todo-rail-empty">暂无执行记录</div>
        )}
      </RailCard>
    </aside>
  );
}

function RailCard({ title, extra, children }: { title: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="todo-rail-card">
      <header>
        <span>{title}</span>
        {extra}
      </header>
      <div className="todo-rail-body">{children}</div>
    </section>
  );
}

function RunStatusIcon({ status }: { status: string }) {
  if (status === "success") return <CheckCircleFilled className="todo-status-icon success" />;
  if (status === "running" || status === "pending") return <LoadingOutlined className="todo-status-icon running" />;
  return <CloseCircleFilled className="todo-status-icon danger" />;
}

function activeText(request: WorkbenchRunRequest) {
  return request.status === "running" ? `执行中 · ${relativeTime(request.started_at || request.requested_at).replace("前", "")}` : "排队中";
}

function lastRunText(run: WorkbenchRunLog) {
  const changed = run.inserted_count + run.updated_count;
  return [clockTime(run.finished_at), changed ? `写入 ${changed}` : `处理 ${run.processed_count}`, formatDuration(run.duration_ms)].join(" · ");
}

function AiJobRow({ job, submitting, onRun }: { job: WorkbenchAiJob; submitting: boolean; onRun: (jobName: string) => void }) {
  const active = job.active_request;
  const hasPending = job.pending > 0;
  return (
    <div className="todo-job-row">
      <div className="todo-job-main">
        <div className="todo-job-title">
          <span>{aiJobLabels[job.job_name] || job.display_name}</span>
          {hasPending ? <span className="todo-count-pill warning">{job.pending}</span> : null}
        </div>
        <div className="todo-job-meta">
          {active ? (
            <>
              <LoadingOutlined className="todo-status-icon running" />
              <span>{activeText(active)}</span>
            </>
          ) : job.last_run ? (
            <>
              <RunStatusIcon status={job.last_run.status} />
              <span>{lastRunText(job.last_run)}</span>
            </>
          ) : (
            <span>尚未运行</span>
          )}
        </div>
        {job.next_run_at ? <div className="todo-job-next">下次 {shortTime(job.next_run_at)}</div> : null}
      </div>
      <Button
        size="small"
        type={hasPending && !active ? "primary" : "default"}
        icon={<PlayCircleOutlined />}
        loading={submitting}
        disabled={!job.exists || Boolean(active)}
        onClick={() => onRun(job.job_name)}
      >
        {job.exists ? "执行" : "未接入"}
      </Button>
    </div>
  );
}

function FailedJobs({ data, runningKey, onRun }: OpsRailProps) {
  const navigate = useNavigate();
  const jobs = data.failed_jobs;
  return (
    <RailCard title="异常任务" extra={jobs.length ? <span className="todo-count-pill danger">{jobs.length}</span> : null}>
      {jobs.length ? (
        jobs.map((job) => (
          <div className="todo-failed-row" key={job.job_name}>
            <div className="todo-failed-head">
              <CloseCircleFilled className="todo-status-icon danger" />
              <span className="todo-failed-name">{job.display_name}</span>
              <span className="todo-failed-time">{shortTime(job.last_run_at)}</span>
            </div>
            {job.error_message ? <div className="todo-failed-error">{job.error_message}</div> : null}
            <div className="todo-failed-actions">
              <Button
                size="small"
                type="link"
                loading={runningKey === job.job_name}
                disabled={!job.exists || Boolean(job.active_request)}
                onClick={() => onRun(job.job_name)}
              >
                {job.active_request ? activeText(job.active_request) : "重跑"}
              </Button>
              <Button size="small" type="link" onClick={() => navigate("/console", { state: { tab: "jobs" } })}>
                查看日志
              </Button>
            </div>
          </div>
        ))
      ) : (
        <div className="todo-rail-ok">
          <CheckCircleFilled className="todo-status-icon success" />
          全部任务运行正常
        </div>
      )}
    </RailCard>
  );
}
