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
  const running = jobs.filter((job) => job.last_status === "running").length + requests.filter((request) => request.status === "running").length;
  if (running > 0) return { label: `运行中 ${running}`, className: "status-warn" };

  const pending = requests.filter((request) => request.status === "pending").length;
  if (pending > 0) return { label: `待执行 ${pending}`, className: "status-warn" };

  const failed = jobs.filter((job) => job.last_status === "failed" || job.last_status === "error").length;
  if (failed > 0) return { label: `异常 ${failed}`, className: "status-danger" };

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
    const timer = window.setInterval(refreshTaskStatus, 10000);
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
