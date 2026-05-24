import { MoonOutlined, MoreOutlined, ReloadOutlined, SearchOutlined, SunOutlined, UserOutlined } from "@ant-design/icons";
import { Button, Input, Space } from "antd";
import { useEffect, useMemo, useState } from "react";
import { listJobs, listRunRequests } from "../../api/jobs";
import { useLiuliTheme } from "../../app/theme";
import type { JobConfig, JobRunRequest } from "../../types/api";

function getTaskStatus(jobs: JobConfig[], requests: JobRunRequest[], loading: boolean) {
  if (loading && jobs.length === 0 && requests.length === 0) {
    return { label: "任务同步中", className: "status-warn" };
  }

  const runningJobs = jobs.filter((job) => job.last_status === "running");
  const runningReqs = requests.filter((request) => request.status === "running");

  if (runningJobs.length > 0 || runningReqs.length > 0) {
    const runningNames = Array.from(new Set([
      ...runningJobs.map((j) => j.display_name || j.job_name),
      ...runningReqs.map((r) => {
        const job = jobs.find((j) => j.job_name === r.job_name);
        return job?.display_name || r.job_name;
      })
    ])).filter(Boolean);

    const namesText = runningNames.length > 0 ? `: ${runningNames.slice(0, 2).join(" / ")}${runningNames.length > 2 ? ` +${runningNames.length - 2}` : ""}` : "";
    return { label: `运行中${namesText}`, className: "status-warn" };
  }

  const pendingReqs = requests.filter((request) => request.status === "pending");
  if (pendingReqs.length > 0) {
    const pendingNames = Array.from(new Set(
      pendingReqs.map((r) => {
        const job = jobs.find((j) => j.job_name === r.job_name);
        return job?.display_name || r.job_name;
      })
    )).filter(Boolean);

    const namesText = pendingNames.length > 0 ? `: ${pendingNames.slice(0, 2).join(" / ")}${pendingNames.length > 2 ? ` +${pendingNames.length - 2}` : ""}` : "";
    return { label: `待执行${namesText}`, className: "status-warn" };
  }

  const failedJobs = jobs.filter((job) => job.last_status === "failed" || job.last_status === "error");
  if (failedJobs.length > 0) {
    const failedNames = Array.from(new Set(
      failedJobs.map((j) => j.display_name || j.job_name)
    )).filter(Boolean);

    const namesText = failedNames.length > 0 ? `: ${failedNames.slice(0, 2).join(" / ")}${failedNames.length > 2 ? ` +${failedNames.length - 2}` : ""}` : "";
    return { label: `异常${namesText}`, className: "status-danger" };
  }

  return { label: "任务正常", className: "status-ok" };
}

export function TopStatusBar() {
  const { resolvedMode, setMode } = useLiuliTheme();
  const [jobs, setJobs] = useState<JobConfig[]>([]);
  const [requests, setRequests] = useState<JobRunRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function refreshTaskStatus() {
      try {
        const [nextJobs, nextRequests] = await Promise.all([listJobs(), listRunRequests()]);
        if (!active) return;
        setJobs(nextJobs);
        setRequests(nextRequests);
      } catch {
        if (!active) return;
      } finally {
        if (active) setLoading(false);
      }
    }

    refreshTaskStatus();
    const timer = window.setInterval(refreshTaskStatus, 3000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const taskStatus = useMemo(() => getTaskStatus(jobs, requests, loading), [jobs, loading, requests]);

  return (
    <div className="top-status-bar">
      <Space size={8} className="top-status-left">
        <Input
          size="small"
          className="global-search"
          prefix={<SearchOutlined />}
          placeholder="搜索股票/赛道/公告/知识库"
          suffix={<span className="search-shortcut">⌘ K</span>}
        />
        <span className={`status-chip ${taskStatus.className}`}><i />{taskStatus.label}</span>
      </Space>
      <Space size={6} className="top-status-right">
        <Button
          size="small"
          type="text"
          className="toolbar-button"
          icon={resolvedMode === "dark" ? <MoonOutlined /> : <SunOutlined />}
          onClick={() => setMode(resolvedMode === "dark" ? "light" : "dark")}
        >
          {resolvedMode === "dark" ? "深色" : "浅色"}
        </Button>
        <span className="toolbar-separator" />
        <Button size="small" type="text" className="toolbar-button" icon={<ReloadOutlined />} onClick={() => window.location.reload()}>
          刷新
        </Button>
        <Button size="small" type="text" className="toolbar-button user-button" icon={<UserOutlined />}>
          brian
        </Button>
        <Button size="small" type="text" className="toolbar-icon" icon={<MoreOutlined />} />
      </Space>
    </div>
  );
}
