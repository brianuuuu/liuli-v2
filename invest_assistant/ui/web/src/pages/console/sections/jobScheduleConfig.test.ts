import {
  buildJobConfigPayload,
  getFormValuesFromJob,
  getIntervalMinutesFromCron,
  getScheduleKindFromCron,
  getTimeFromCron
} from "./jobScheduleConfig";
import type { JobScheduleFormValues } from "./jobScheduleConfig";

const dailyJob = getFormValuesFromJob({
  id: 1,
  job_name: "market_radar.fetch_news",
  module_name: "market_radar",
  display_name: "抓取市场新闻",
  config_json: {
    enabled: true,
    execution_mode: "schedule",
    schedule_kind: "daily",
    run_time: "08:00",
    cron_expr: "0 8 * * *",
    allow_manual_run: true,
    timeout_seconds: 300,
    max_retries: 0
  },
  ext_json: {}
});

if (dailyJob.execution_mode !== "schedule") {
  throw new Error("scheduled jobs should open in schedule mode");
}

if (dailyJob.enabled !== true) {
  throw new Error("enabled jobs should open with enabled switch on");
}

if (dailyJob.allow_manual_run !== true) {
  throw new Error("both trigger type should allow manual run");
}

if (getScheduleKindFromCron("0 8 * * *") !== "daily") {
  throw new Error("daily cron should be detected as daily");
}

if (getTimeFromCron("0 8 * * *") !== "08:00") {
  throw new Error("daily cron should expose HH:mm time");
}

if (getIntervalMinutesFromCron("*/5 * * * *") !== 5 || getIntervalMinutesFromCron("*/30 * * * *") !== 30) {
  throw new Error("interval cron should expose minute interval");
}

const intervalJob = getFormValuesFromJob({
  id: 2,
  job_name: "market_radar.fetch_interval",
  module_name: "market_radar",
  display_name: "间隔任务",
  config_json: {
    enabled: true,
    execution_mode: "schedule",
    schedule_kind: "interval",
    cron_expr: "*/5 * * * *"
  },
  ext_json: {}
});

if (intervalJob.interval_minutes !== 5) {
  throw new Error("interval jobs should open with interval_minutes from cron");
}

const valuesWithDefinitionFields: JobScheduleFormValues & { display_name: string; description: string } = {
  display_name: "抓取市场新闻",
  description: "",
  enabled: true,
  execution_mode: "schedule",
  schedule_kind: "daily",
  run_time: "08:30",
  cron_expr: "",
  allow_manual_run: false,
  timeout_seconds: 300,
  max_retries: 0
};

const payload = buildJobConfigPayload(valuesWithDefinitionFields);

if (payload.config_json.cron_expr !== "30 8 * * *" || payload.config_json.execution_mode !== "schedule") {
  throw new Error("job configuration should submit normalized config_json");
}

const intervalPayload = buildJobConfigPayload({
  enabled: true,
  execution_mode: "schedule",
  schedule_kind: "interval",
  interval_minutes: 15,
  timeout_seconds: 300,
  max_retries: 0
});

if (intervalPayload.config_json.cron_expr !== "*/15 * * * *") {
  throw new Error("interval minutes should submit normalized interval cron");
}

if ("display_name" in payload || "description" in payload) {
  throw new Error("job configuration should not submit display name or description");
}
