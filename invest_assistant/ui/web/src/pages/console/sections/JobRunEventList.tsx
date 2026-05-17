import { useState } from "react";
import { Tag } from "antd";
import { EmptyAction } from "../../../components/common/EmptyAction";
import type { JobRunLog, JobRunRequest } from "../../../types/api";
import { formatTime } from "./shared";
import { jobStatusColor } from "./JobCard";

function statusClass(status?: string | null) {
  if (status === "success" || status === "completed") return "success";
  if (status === "failed" || status === "error") return "failed";
  if (status === "running") return "running";
  return "default";
}

function JsonBlock({ title, value }: { title: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="job-run-json">
      <span>{title}</span>
      <pre>{value}</pre>
    </div>
  );
}

export function JobRequestEventList({ rows, loading }: { rows: JobRunRequest[]; loading: boolean }) {
  const [openId, setOpenId] = useState<number | null>(null);

  if (loading) return <EmptyAction description="正在加载运行请求" />;
  if (rows.length === 0) return <EmptyAction description="暂无运行请求" />;

  return (
    <div className="job-run-list">
      {rows.map((row) => {
        const open = openId === row.id;
        return (
          <button className={open ? "job-run-event open" : "job-run-event"} key={row.id} onClick={() => setOpenId(open ? null : row.id)}>
            <span className={`job-run-dot ${statusClass(row.status)}`} />
            <div className="job-run-main">
              <div className="job-run-head">
                <strong>请求 #{row.id}</strong>
                <Tag color={jobStatusColor(row.status)}>{row.status}</Tag>
              </div>
              <div className="job-run-sub">{row.job_name}</div>
              <div className="job-run-meta">
                <span>请求时间</span><strong>{formatTime(row.requested_at)}</strong>
                <span>请求人</span><strong>{row.requested_by || "-"}</strong>
              </div>
              {row.error_message ? <div className="job-run-error">{row.error_message}</div> : null}
              {open ? (
                <div className="job-run-detail">
                  <div><span>开始</span><strong>{formatTime(row.started_at)}</strong></div>
                  <div><span>结束</span><strong>{formatTime(row.finished_at)}</strong></div>
                  <JsonBlock title="params_json" value={row.params_json} />
                </div>
              ) : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function JobLogEventList({ rows, loading }: { rows: JobRunLog[]; loading: boolean }) {
  const [openId, setOpenId] = useState<number | null>(null);

  if (loading) return <EmptyAction description="正在加载执行日志" />;
  if (rows.length === 0) return <EmptyAction description="暂无执行日志" />;

  return (
    <div className="job-run-list">
      {rows.map((row) => {
        const open = openId === row.id;
        return (
          <button className={open ? "job-run-event open" : "job-run-event"} key={row.id} onClick={() => setOpenId(open ? null : row.id)}>
            <span className={`job-run-dot ${statusClass(row.status)}`} />
            <div className="job-run-main">
              <div className="job-run-head">
                <strong>日志 #{row.id}</strong>
                <Tag color={jobStatusColor(row.status)}>{row.status}</Tag>
              </div>
              <div className="job-run-sub">{formatTime(row.started_at)} / {row.duration_ms} ms</div>
              <div className="job-run-metrics">
                <span>抓取 {row.fetched_count}</span>
                <span>处理 {row.processed_count}</span>
                <span>新增 {row.inserted_count}</span>
                <span>更新 {row.updated_count}</span>
              </div>
              {row.error_message ? <div className="job-run-error">{row.error_message}</div> : null}
              {open ? (
                <div className="job-run-detail">
                  <div><span>任务</span><strong>{row.job_name}</strong></div>
                  <div><span>模块</span><strong>{row.module_name}</strong></div>
                  <div><span>触发</span><strong>{row.trigger_type}</strong></div>
                  <div><span>结束</span><strong>{formatTime(row.finished_at)}</strong></div>
                  <JsonBlock title="params_json" value={row.params_json} />
                  <JsonBlock title="result_json" value={row.result_json} />
                  <JsonBlock title="error_message" value={row.error_message} />
                </div>
              ) : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}
