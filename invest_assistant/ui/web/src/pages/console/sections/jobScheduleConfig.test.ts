import {
  buildJobConfigPayload,
  getFormValuesFromJob,
  getScheduleKindFromCron,
  getTimeFromCron
} from "./jobScheduleConfig";

const dailyJob = getFormValuesFromJob({
  id: 1,
  job_name: "market_radar.fetch_news",
  module_name: "market_radar",
  display_name: "抓取市场新闻",
  enabled: true,
  trigger_type: "both",
  cron_expr: "0 8 * * *"
});

if (dailyJob.execution_mode !== "schedule") {
  throw new Error("scheduled jobs should open in schedule mode");
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

const payload = buildJobConfigPayload({
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
});

if (payload.trigger_type !== "schedule" || payload.cron_expr !== "30 8 * * *") {
  throw new Error("daily schedule form should submit schedule trigger and cron");
}
