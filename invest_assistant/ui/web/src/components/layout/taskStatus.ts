import type { JobConfig, JobRunRequest } from "../../types/api";

export type TaskStatusView = {
  label: string;
  className: "status-ok" | "status-warn" | "status-danger";
};

function jobDisplayName(job?: Pick<JobConfig, "display_name" | "job_name"> | null) {
  return job?.display_name || job?.job_name || "";
}

function formatLatestRunTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  const hour = String(parsed.getHours()).padStart(2, "0");
  const minute = String(parsed.getMinutes()).padStart(2, "0");
  return `${month}-${day} ${hour}:${minute}`;
}

function getLatestJob(jobs: JobConfig[]) {
  return jobs
    .filter((job) => job.last_run_at)
    .sort((a, b) => new Date(b.last_run_at || "").getTime() - new Date(a.last_run_at || "").getTime())[0];
}

function appendLatestJob(label: string, jobs: JobConfig[]) {
  const latestJob = getLatestJob(jobs);
  if (!latestJob?.last_run_at) return label;

  return `${label} · 最近: ${jobDisplayName(latestJob)} · ${formatLatestRunTime(latestJob.last_run_at)}`;
}

export function getTaskStatus(jobs: JobConfig[], requests: JobRunRequest[], loading: boolean): TaskStatusView {
  if (loading && jobs.length === 0 && requests.length === 0) {
    return { label: "任务同步中", className: "status-warn" };
  }

  const runningJobs = jobs.filter((job) => job.last_status === "running");
  const runningReqs = requests.filter((request) => request.status === "running");

  if (runningJobs.length > 0 || runningReqs.length > 0) {
    const runningNames = Array.from(new Set([
      ...runningJobs.map((j) => jobDisplayName(j)),
      ...runningReqs.map((r) => {
        const job = jobs.find((j) => j.job_name === r.job_name);
        return jobDisplayName(job) || r.job_name;
      })
    ])).filter(Boolean);

    const namesText = runningNames.length > 0 ? `: ${runningNames.slice(0, 2).join(" / ")}${runningNames.length > 2 ? ` +${runningNames.length - 2}` : ""}` : "";
    return { label: appendLatestJob(`运行中${namesText}`, jobs), className: "status-warn" };
  }

  const pendingReqs = requests.filter((request) => request.status === "pending");
  if (pendingReqs.length > 0) {
    const pendingNames = Array.from(new Set(
      pendingReqs.map((r) => {
        const job = jobs.find((j) => j.job_name === r.job_name);
        return jobDisplayName(job) || r.job_name;
      })
    )).filter(Boolean);

    const namesText = pendingNames.length > 0 ? `: ${pendingNames.slice(0, 2).join(" / ")}${pendingNames.length > 2 ? ` +${pendingNames.length - 2}` : ""}` : "";
    return { label: appendLatestJob(`待执行${namesText}`, jobs), className: "status-warn" };
  }

  const failedJobs = jobs.filter((job) => job.last_status === "failed" || job.last_status === "error");
  if (failedJobs.length > 0) {
    const failedNames = Array.from(new Set(
      failedJobs.map((j) => jobDisplayName(j))
    )).filter(Boolean);

    const namesText = failedNames.length > 0 ? `: ${failedNames.slice(0, 2).join(" / ")}${failedNames.length > 2 ? ` +${failedNames.length - 2}` : ""}` : "";
    return { label: appendLatestJob(`异常${namesText}`, jobs), className: "status-danger" };
  }

  return { label: appendLatestJob("任务正常", jobs), className: "status-ok" };
}
