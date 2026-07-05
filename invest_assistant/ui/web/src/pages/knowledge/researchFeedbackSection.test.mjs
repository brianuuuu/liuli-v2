import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./KnowledgePage.tsx", import.meta.url), "utf8");

assert.match(source, /const\s+\[bulkImporting,\s*setBulkImporting\]\s*=\s*useState\(false\)/, "research feedback must track one-click import loading state");
assert.match(source, /record\.status\s*!==\s*"imported"/, "one-click import must skip already imported feedback rows");
assert.match(source, /Promise\.all\(/, "one-click import must attempt remaining feedback rows without stopping at the first failure");
assert.match(source, /message\.success\(`一键导入完成：成功 \$\{successCount\} 个，失败 \$\{failureCount\} 个`\)/, "one-click import must summarize success and failure counts");
assert.doesNotMatch(source, /Modal\.error\(\{[\s\S]*一键导入/, "one-click import failures must not show a blocking error modal");
assert.match(source, />刷新<\/Button>/, "refresh button label should be concise");
assert.match(source, />一键导入<\/Button>/, "toolbar must expose one-click import");
assert.match(source, /\{\s*title:\s*"标题",\s*dataIndex:\s*"title",\s*width:\s*320,\s*ellipsis:\s*true\s*\}/, "title column width should be explicitly reduced");
assert.match(source, /\{\s*title:\s*"来源",\s*dataIndex:\s*"source",\s*width:\s*130,\s*ellipsis:\s*true,\s*render:\s*\(value\)\s*=>\s*<span style=\{\{ whiteSpace: "nowrap" \}\}>\{value \|\| "-"\}<\/span>\s*\}/, "source column must be slightly wider and single-line");
