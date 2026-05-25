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

  const status = getTaskStatus(jobs, [], false);

  assert.equal(status.className, "status-ok");
  assert.equal(status.label, "任务正常 · 最近: 刷新股票池 · 05-24 15:06");
} finally {
  await rm(outDir, { recursive: true, force: true });
}
