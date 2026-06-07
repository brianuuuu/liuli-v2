import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const sourcePath = new URL("./knowledgeNotesTimeline.ts", import.meta.url);
const source = readFileSync(sourcePath, "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022
  }
});

const tempDir = mkdtempSync(join(tmpdir(), "liuli-knowledge-notes-"));
const compiledPath = join(tempDir, "knowledgeNotesTimeline.mjs");
writeFileSync(compiledPath, output.outputText);

const {
  KNOWLEDGE_NOTES_PAGE_SIZE,
  groupKnowledgeNotesByDate,
  mergeKnowledgeNotePage,
  refreshKnowledgeNoteQuery,
  shouldLoadNextKnowledgeNotePage
} = await import(pathToFileURL(compiledPath));

assert.equal(KNOWLEDGE_NOTES_PAGE_SIZE, 20);

const rows = [
  { id: 1, title: "旧笔记", created_at: "2026-06-05T10:00:00", updated_at: "2026-06-05T10:00:00" },
  { id: 2, title: "今天 A", created_at: "2026-06-07T09:00:00", updated_at: "2026-06-07T09:00:00" },
  { id: 3, title: "今天 B", created_at: "2026-06-07T21:00:00", updated_at: "2026-06-07T21:00:00" }
];

const grouped = groupKnowledgeNotesByDate(rows);
assert.deepEqual(grouped.map((group) => group.date), ["2026-06-07", "2026-06-05"]);
assert.deepEqual(grouped[0].items.map((item) => item.id), [3, 2]);

assert.deepEqual(
  mergeKnowledgeNotePage([{ id: 1, title: "old" }, { id: 2, title: "kept" }], [{ id: 2, title: "new" }, { id: 3, title: "added" }]).map((item) => item.id),
  [1, 2, 3]
);

const currentQuery = { status: "active", group_id: 7, tag_id: 3, q: "算力", limit: 20, offset: 40 };
assert.deepEqual(refreshKnowledgeNoteQuery(currentQuery), { status: "active", group_id: 7, tag_id: 3, q: "算力", limit: 20, offset: 0 });

assert.equal(shouldLoadNextKnowledgeNotePage({ scrollTop: 720, clientHeight: 260, scrollHeight: 1000 }, true, false), true);
assert.equal(shouldLoadNextKnowledgeNotePage({ scrollTop: 600, clientHeight: 260, scrollHeight: 1000 }, true, false), false);
assert.equal(shouldLoadNextKnowledgeNotePage({ scrollTop: 720, clientHeight: 260, scrollHeight: 1000 }, false, false), false);
assert.equal(shouldLoadNextKnowledgeNotePage({ scrollTop: 720, clientHeight: 260, scrollHeight: 1000 }, true, true), false);
