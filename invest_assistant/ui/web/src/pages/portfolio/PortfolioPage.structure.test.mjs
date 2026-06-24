import fs from "node:fs";
import assert from "node:assert/strict";

const page = fs.readFileSync(new URL("./PortfolioPage.tsx", import.meta.url), "utf8");

assert.match(page, /新建组合/);
assert.match(page, /重命名/);
assert.match(page, /删除组合/);
assert.match(page, /刷新实时价格/);
assert.match(page, /新增持仓/);
assert.match(page, /请选择标的/);
assert.match(page, /股数/);
assert.match(page, /当日盈亏/);
assert.match(page, /当日涨跌幅/);
assert.match(page, /Popconfirm/);
assert.match(page, /searchStocks/);
