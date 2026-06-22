import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("invest_assistant/ui/web/src/pages/console/sections/DisclosuresSection.tsx", "utf8");
const columnsStart = source.indexOf("const columns: ColumnsType<Disclosure>");
const columnsEnd = source.indexOf("return (", columnsStart);

assert.notEqual(columnsStart, -1, "DisclosuresSection should define disclosure table columns");
assert.notEqual(columnsEnd, -1, "DisclosuresSection should render after column definitions");

const columnsSource = source.slice(columnsStart, columnsEnd);

assert.doesNotMatch(
  columnsSource,
  /title:\s*"报告期"[\s\S]*?dataIndex:\s*"report_period"[\s\S]*?render:\s*\(value\)\s*=>\s*value\s*\|\|\s*"-"/,
  "Console disclosure table should not render legacy stock codes as raw report periods"
);
assert.match(columnsSource, /title:\s*"公司名称"/, "Console disclosure table should show the company name column");
assert.match(columnsSource, /title:\s*"报告期"/, "Console disclosure table should include a report period column");
assert.match(columnsSource, /title:\s*"处理状态"/, "Console disclosure table should label parse_status as processing status");
assert.doesNotMatch(columnsSource, />编辑<\/Button>/, "Console disclosure table action column should not show edit button");
assert.doesNotMatch(columnsSource, />入雷达<\/Button>/, "Console disclosure table action column should not show per-row source-item button");
assert.doesNotMatch(columnsSource, />下载<\/Button>/, "Console disclosure table action column should not call server-side sync download");
assert.match(columnsSource, />同步原文<\/Button>/, "Console disclosure table action column should sync original files");
assert.match(source, /scroll=\{\{\s*x:\s*1180\s*\}\}/, "Console disclosure table should reserve horizontal width");
assert.match(source, /pending.*待同步/s, "Processing status options should localize pending");
assert.match(source, /downloaded.*已同步/s, "Processing status options should localize downloaded");
assert.match(source, /parsed.*已解析/s, "Processing status options should localize parsed");
assert.match(source, /parse_failed.*解析失败/s, "Processing status options should use backend parse_failed value");
assert.match(source, /placeholder="公司名称 \/ 标题"/, "Disclosure list search should describe local company/title filtering");
assert.match(source, /listDisclosures\(\{\s*limit:\s*pageSize,\s*offset:\s*\(page - 1\) \* pageSize,\s*q:\s*searchText\.trim\(\),\s*pool_only:\s*true/s, "Disclosure list should pass q and default pool_only filter");
assert.match(source, /onSearch=\{runListSearch\}/, "Disclosure search box should run list search");
assert.match(source, /<Button size="small" onClick=\{fetchRemote\}>拉取公告<\/Button>/, "Remote fetch button should remain available");
assert.doesNotMatch(source, /value=\{keyword\}/, "Disclosure search input should not be only a remote fetch keyword");
