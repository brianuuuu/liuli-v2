import type { JobConfig } from "../../../types/api";

export type JobExecutionMode = "manual" | "schedule";
export type JobScheduleKind = "daily" | "interval" | "custom";

export type JobScheduleFormValues = {
  display_name?: string;
  description?: string;
  enabled?: boolean;
  execution_mode?: JobExecutionMode;
  schedule_kind?: JobScheduleKind;
  run_time?: string;
  cron_expr?: string;
  allow_manual_run?: boolean;
  timeout_seconds?: number;
  max_retries?: number;
};

export type JobSchedulePayload = {
  display_name?: string;
  description?: string | null;
  trigger_type?: string;
  cron_expr?: string | null;
  enabled?: boolean;
  timeout_seconds?: number;
  max_retries?: number;
};

const DAILY_CRON_PATTERN = /^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+\*$/;
const INTERVAL_CRON_PATTERN = /^\*\/(\d+)\s+\*\s+\*\s+\*\s+\*$/;

function padTime(value: string | number) {
  return String(value).padStart(2, "0");
}

export function getScheduleKindFromCron(cronExpr?: string | null): JobScheduleKind {
  if (!cronExpr) return "daily";
  if (DAILY_CRON_PATTERN.test(cronExpr)) return "daily";
  if (INTERVAL_CRON_PATTERN.test(cronExpr)) return "interval";
  return "custom";
}

export function getTimeFromCron(cronExpr?: string | null): string {
  const match = cronExpr?.match(DAILY_CRON_PATTERN);
  if (!match) return "08:00";
  return `${padTime(match[2])}:${padTime(match[1])}`;
}

export function getIntervalCronValue(cronExpr?: string | null): string {
  return INTERVAL_CRON_PATTERN.test(cronExpr || "") ? String(cronExpr) : "*/30 * * * *";
}

export function getFormValuesFromJob(job: JobConfig): JobScheduleFormValues {
  const triggerType = job.trigger_type || "manual";
  const hasSchedule = Boolean(job.cron_expr) || triggerType === "schedule" || triggerType === "cron" || triggerType === "both";
  return {
    display_name: job.display_name,
    description: job.description || undefined,
    enabled: job.enabled,
    execution_mode: hasSchedule ? "schedule" : "manual",
    schedule_kind: getScheduleKindFromCron(job.cron_expr),
    run_time: getTimeFromCron(job.cron_expr),
    cron_expr: job.cron_expr || undefined,
    allow_manual_run: triggerType === "manual" || triggerType === "both",
    timeout_seconds: job.timeout_seconds || 300,
    max_retries: job.max_retries || 0
  };
}

export function buildCronExpr(values: JobScheduleFormValues): string | null {
  if (values.execution_mode !== "schedule") return null;
  if (values.schedule_kind === "daily") {
    const [hour = "08", minute = "00"] = (values.run_time || "08:00").split(":");
    return `${Number(minute)} ${Number(hour)} * * *`;
  }
  if (values.schedule_kind === "interval") return values.cron_expr || "*/30 * * * *";
  return values.cron_expr || null;
}

export function buildJobConfigPayload(values: JobScheduleFormValues): JobSchedulePayload {
  const cronExpr = buildCronExpr(values);
  const triggerType = values.execution_mode === "schedule"
    ? values.allow_manual_run ? "both" : "schedule"
    : "manual";
  return {
    display_name: values.display_name,
    description: values.description || null,
    trigger_type: triggerType,
    cron_expr: cronExpr,
    enabled: values.enabled,
    timeout_seconds: values.timeout_seconds,
    max_retries: values.max_retries
  };
}
