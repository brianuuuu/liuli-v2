import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = "invest_assistant/ui/web/src";

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const files = walk(root).filter((path) => /\.(ts|tsx)$/.test(path));
const sourceByPath = new Map(files.map((path) => [path.replaceAll("\\", "/"), readFileSync(path, "utf8")]));
const allSource = [...sourceByPath.values()].join("\n");

assert.doesNotMatch(allSource, /limit:\s*200\b/, "growth list requests must not use limit: 200");
assert.doesNotMatch(allSource, /pageSizeOptions:\s*\[[^\]]*\b200\b[^\]]*\]/, "table page size options must not include 200");

const serverPagedTables = [
  "invest_assistant/ui/web/src/pages/market-radar/sections/SourcesSection.tsx",
  "invest_assistant/ui/web/src/pages/market-radar/sections/CandidatesSection.tsx",
  "invest_assistant/ui/web/src/pages/market-radar/sections/TagsSection.tsx",
  "invest_assistant/ui/web/src/pages/console/sections/ReportsSection.tsx",
  "invest_assistant/ui/web/src/pages/console/sections/DisclosuresSection.tsx",
];

for (const path of serverPagedTables) {
  const source = sourceByPath.get(path) || "";
  assert.match(source, /limit:\s*pageSize/, `${path} must request the selected table page size`);
  assert.match(source, /offset:\s*\(page - 1\) \* pageSize/, `${path} must derive offset from current page and pageSize`);
  assert.match(source, /current:\s*page/, `${path} must bind table current page`);
  assert.match(source, /total:\s*[^,]+\.data\.total/, `${path} must use backend total`);
}
