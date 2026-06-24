import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const page = readFileSync("invest_assistant/ui/web/src/pages/alerts/AlertsPage.tsx", "utf8");
const api = readFileSync("invest_assistant/ui/web/src/api/alerts.ts", "utf8");

assert.doesNotMatch(page, /处理首条/);
assert.doesNotMatch(page, /markAlertHandled/);
assert.doesNotMatch(api, /markAlertHandled/);
assert.match(page, /一键已读/);
assert.match(page, /markAllAlertsRead/);
assert.match(page, /已读/);
assert.match(page, /删除/);
assert.match(page, /启用/);
assert.match(page, /禁用/);
assert.match(page, /stopPropagation/);
assert.match(api, /markAllAlertsRead/);
assert.match(api, /markAlertRead/);
assert.match(api, /deleteAlertEvent/);
assert.match(api, /enableAlertRule/);
assert.match(api, /disableAlertRule/);
assert.match(api, /deleteAlertRule/);
assert.match(api, /\/api\/alerts\/events\/read-all/);
assert.match(api, /\/api\/alerts\/events\/\$\{eventId\}\/read/);
assert.match(api, /\/api\/alerts\/events\/\$\{eventId\}/);
assert.match(api, /\/api\/alerts\/rules\/\$\{ruleId\}\/enable/);
assert.match(api, /\/api\/alerts\/rules\/\$\{ruleId\}\/disable/);
assert.match(api, /\/api\/alerts\/rules\/\$\{ruleId\}/);
