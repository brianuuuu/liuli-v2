import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(join(dir, "KnowledgePage.tsx"), "utf8");

assert.match(page, /<Modal title=\{editing \? "编辑 Prompt" : "新增 Prompt"\} width=\{980\}/);
assert.match(page, /style=\{\{ top: 24 \}\}/);
assert.match(page, /<Input\.TextArea rows=\{6\}/);
assert.match(page, /<Input\.TextArea rows=\{12\}/);
