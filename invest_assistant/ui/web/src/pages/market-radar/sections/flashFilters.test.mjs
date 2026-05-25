import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const sourcePath = new URL("./flashFilters.ts", import.meta.url);
const source = readFileSync(sourcePath, "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022
  }
});

const tempDir = mkdtempSync(join(tmpdir(), "liuli-flash-filters-"));
const compiledPath = join(tempDir, "flashFilters.mjs");
writeFileSync(compiledPath, output.outputText);

const { filterFlashRows } = await import(pathToFileURL(compiledPath));

const rows = [
  {
    id: 1,
    title: "AI 算力",
    content: "产业链更新",
    source_type: "news",
    source_name: "财联社",
    source_tags: [{ tag: { id: 10, name: "AI" } }]
  },
  {
    id: 2,
    title: "创新药",
    content: "临床进展",
    source_type: "news",
    source_name: "财联社",
    source_tags: [{ tag: { id: 20, name: "医药" } }]
  }
];

assert.deepEqual(
  filterFlashRows(rows, { activeTagId: 10 }).map((item) => item.id),
  [1]
);

assert.deepEqual(
  filterFlashRows(rows, { activeTagId: null }).map((item) => item.id),
  [1, 2]
);
