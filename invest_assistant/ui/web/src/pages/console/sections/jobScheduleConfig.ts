import type { JobConfig } from "../../../types/api";

export type JobExecutionMode = "manual" | "schedule";
export type JobScheduleKind = "daily" | "interval" | "custom";

export type JobScheduleFormValues = {
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
  config_json: Record<string, unknown>;
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
  if (job.config_json) {
    const config = job.config_json;
    return {
      enabled: config.enabled === true,
      execution_mode: config.execution_mode === "schedule" ? "schedule" : "manual",
      schedule_kind: config.schedule_kind === "interval" || config.schedule_kind === "custom" ? config.schedule_kind : "daily",
      run_time: typeof config.run_time === "string" ? config.run_time : "08:00",
      cron_expr: typeof config.cron_expr === "string" ? config.cron_expr : undefined,
      allow_manual_run: config.allow_manual_run === true,
      timeout_seconds: typeof config.timeout_seconds === "number" ? config.timeout_seconds : 300,
      max_retries: typeof config.max_retries === "number" ? config.max_retries : 0
    };
  }
  return getDefaultJobScheduleValues();
}

export function getDefaultJobScheduleValues(): JobScheduleFormValues {
  return {
    enabled: true,
    execution_mode: "manual",
    schedule_kind: "daily",
    run_time: "08:00",
    cron_expr: undefined,
    allow_manual_run: true,
    timeout_seconds: 300,
    max_retries: 0
  };
}

export function getJobConfigEnabled(job: JobConfig): boolean {
  return getFormValuesFromJob(job).enabled === true;
}

export function getJobConfigTriggerLabel(job: JobConfig): string {
  const values = getFormValuesFromJob(job);
  if (values.execution_mode !== "schedule") return "manual";
  return values.allow_manual_run ? "both" : "schedule";
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
  const configJson = {
    enabled: values.enabled === true,
    execution_mode: values.execution_mode || "manual",
    schedule_kind: values.schedule_kind || "daily",
    run_time: values.run_time || "08:00",
    cron_expr: cronExpr,
    allow_manual_run: values.allow_manual_run === true,
    timeout_seconds: values.timeout_seconds || 300,
    max_retries: values.max_retries || 0
  };
  return {
    config_json: configJson
  };
}
