import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const sourcePath = new URL("./knowledgePage.ts", import.meta.url);
const source = readFileSync(sourcePath, "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022
  }
});

const tempDir = mkdtempSync(join(tmpdir(), "liuli-knowledge-page-"));
const compiledPath = join(tempDir, "knowledgePage.mjs");
writeFileSync(compiledPath, output.outputText);

const { normalizeKnowledgeNotePage } = await import(pathToFileURL(compiledPath));

assert.deepEqual(
  normalizeKnowledgeNotePage([{ id: 1, title: "旧接口", tags: "#AI" }], { limit: 20, offset: 0 }),
  {
    items: [{ id: 1, title: "旧接口", tags: [] }],
    total: 1,
    limit: 20,
    offset: 0,
    has_more: false
  }
);

assert.deepEqual(
  normalizeKnowledgeNotePage({ items: [{ id: 2, title: "新接口", tags: [{ id: 3, name: "AI" }] }], total: 3, limit: 1, offset: 1, has_more: true }, { limit: 20, offset: 0 }),
  {
    items: [{ id: 2, title: "新接口", tags: [{ id: 3, name: "AI" }] }],
    total: 3,
    limit: 1,
    offset: 1,
    has_more: true
  }
);
