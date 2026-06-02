import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(join(dir, "CandidatesSection.tsx"), "utf-8");

assert.doesNotMatch(page, /label="已有对象 ID"/);
assert.doesNotMatch(page, /<InputNumber[^>]*min=\{1\}[^>]*style=\{\{ width: "100%" \}\}/);
assert.match(page, /label="已有对象"/);
assert.match(page, /showSearch/);
assert.match(page, /optionFilterProp="searchText"/);
assert.match(page, /searchStocks/);
