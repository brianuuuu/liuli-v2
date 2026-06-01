import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { transform } from "esbuild";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sourcePath = resolve(__dirname, "taskStatus.ts");
const outDir = resolve(__dirname, ".task-status-test");
const outPath = resolve(outDir, "taskStatus.mjs");

await mkdir(outDir, { recursive: true });
const source = await readFile(sourcePath, "utf8");
const result = await transform(source, {
  format: "esm",
  loader: "ts",
  sourcemap: false,
});
await writeFile(outPath, result.code, "utf8");

try {
  const { getTaskStatus } = await import(pathToFileURL(outPath).href);

  const jobs = [
    {
      id: 1,
      job_name: "market_radar.old",
      module_name: "market_radar",
      display_name: "旧任务",
      config_json: {},
      ext_json: {},
      last_run_at: "2026-05-23T09:30:00",
      last_status: "success",
    },
    {
      id: 2,
      job_name: "stock_analysis.refresh_pool",
      module_name: "stock_analysis",
      display_name: "刷新股票池",
      config_json: {},
      ext_json: {},
      last_run_at: "2026-05-24T15:06:00",
      last_status: "success",
    },
  ];

  // Case 1: Normal jobs, should be status-ok
  const statusNormal = getTaskStatus(jobs, [], false);
  assert.equal(statusNormal.className, "status-ok");
  assert.equal(statusNormal.label, "任务正常 · 最近: 刷新股票池 · 05-24 15:06");

  // Case 2: Has a failed job which is enabled (default or config_json.enabled is true), should be status-danger
  const jobsWithFailed = [
    ...jobs,
    {
      id: 3,
      job_name: "market_radar.fetch_news",
      module_name: "market_radar",
      display_name: "抓取市场新闻",
      config_json: { enabled: true },
      ext_json: {},
      last_run_at: "2026-05-24T16:00:00",
      last_status: "failed",
    }
  ];
  const statusFailed = getTaskStatus(jobsWithFailed, [], false);
  assert.equal(statusFailed.className, "status-danger");
  assert.match(statusFailed.label, /^异常: 抓取市场新闻/);

  // Case 3: Has a failed job which has been disabled (config_json.enabled is false), should ignore failure and be status-ok
  const jobsWithDisabledFailed = [
    ...jobs,
    {
      id: 3,
      job_name: "market_radar.fetch_news",
      module_name: "market_radar",
      display_name: "抓取市场新闻",
      config_json: { enabled: false },
      ext_json: {},
      last_run_at: "2026-05-24T16:00:00",
      last_status: "failed",
    }
  ];
  const statusDisabledFailed = getTaskStatus(jobsWithDisabledFailed, [], false);
  assert.equal(statusDisabledFailed.className, "status-ok");
} finally {
  await rm(outDir, { recursive: true, force: true });
}
