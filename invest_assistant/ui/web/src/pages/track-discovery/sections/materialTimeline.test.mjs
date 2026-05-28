import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { transform } from "esbuild";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sourcePath = resolve(__dirname, "materialTimeline.ts");
const outDir = resolve(__dirname, ".material-timeline-test");
const outPath = resolve(outDir, "materialTimeline.mjs");

await mkdir(outDir, { recursive: true });
const source = await readFile(sourcePath, "utf8");
const result = await transform(source, {
  format: "esm",
  loader: "ts",
  sourcemap: false,
});
await writeFile(outPath, result.code, "utf8");

try {
  const { compactMaterialSummary, filterMaterialsByStatus, groupMaterialsByDate, pendingMaterials, timelineMaterials } = await import(
    pathToFileURL(outPath).href
  );

  const rows = [
    { id: 1, status: "confirmed", updated_at: "2026-05-26T10:00:00", created_at: "2026-05-25T10:00:00" },
    { id: 2, status: "pending", updated_at: "2026-05-27T08:00:00", created_at: "2026-05-26T08:00:00" },
    { id: 3, status: "ignored", updated_at: null, created_at: "2026-05-27T09:00:00" },
    { id: 4, status: "pending", updated_at: "2026-05-27T12:00:00", created_at: "2026-05-27T11:00:00" },
  ];

  assert.deepEqual(filterMaterialsByStatus(rows, "pending").map((item) => item.id), [4, 2]);
  assert.deepEqual(filterMaterialsByStatus(rows, "all").map((item) => item.id), [4, 3, 2, 1]);
  assert.deepEqual(pendingMaterials(rows).map((item) => item.id), [4, 2]);
  assert.deepEqual(timelineMaterials(rows, "all").map((item) => item.id), [3, 1]);

  const groups = groupMaterialsByDate(rows);
  assert.deepEqual(groups.map((group) => group.date), ["2026-05-27", "2026-05-26"]);
  assert.deepEqual(groups[0].items.map((item) => item.id), [4, 3, 2]);

  assert.equal(compactMaterialSummary({ material_summary: "  一二三四五六七八九十十一十二  " }, 10), "一二三四五六七八九十...");
  assert.equal(compactMaterialSummary({ material_title: "材料标题" }, 10), "材料标题");
  assert.equal(compactMaterialSummary({ note: "已有判断" }, 10), "已有判断");
} finally {
  await rm(outDir, { recursive: true, force: true });
}
