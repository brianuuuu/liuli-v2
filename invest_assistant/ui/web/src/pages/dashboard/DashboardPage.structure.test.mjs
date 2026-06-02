import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const navigation = readFileSync("invest_assistant/ui/web/src/app/navigation.tsx", "utf8");
const page = readFileSync("invest_assistant/ui/web/src/pages/dashboard/DashboardPage.tsx", "utf8");
const todaySection = page.match(/function TodayDashboardSection\(\)[\s\S]*?function OperationsPanelSection/)?.[0] || "";
const operationsSection = page.match(/function OperationsPanelSection\(\)[\s\S]*?function ReportTable/)?.[0] || "";

assert.match(navigation, /key:\s*"dashboard",\s*label:\s*"工作台"/);
assert.doesNotMatch(navigation, /key:\s*"dashboard",\s*label:\s*"总览"/);
assert.doesNotMatch(navigation, /primaryNavItems[\s\S]*label:\s*"今日看板"[\s\S]*moduleTabs/);

assert.match(navigation, /dashboard:\s*\[[\s\S]*label:\s*"今日看板"[\s\S]*label:\s*"操作面板"[\s\S]*label:\s*"最新报告"[\s\S]*\]/);

assert.match(page, /<PageHeader\s+title="工作台"/);
assert.doesNotMatch(page, /<PageHeader\s+title="今日看板"/);
assert.match(page, /<ModuleTabs\s+activeKey=\{activeTab\}\s+items=\{moduleTabs\.dashboard\}/);

assert.match(page, /title="新增"/);
assert.match(page, /title="活跃"/);
assert.match(page, /title="统计"/);
assert.match(page, /title="待办入口"/);
assert.match(page, /title="AI 控制面板"/);
assert.match(page, /workbench-action-grid/);
assert.doesNotMatch(page, /title="待办队列摘要"/);
assert.match(todaySection, /title="最近执行记录"/);
assert.doesNotMatch(operationsSection, /title="最近执行记录"/);
assert.doesNotMatch(page, /常用网页快捷入口/);
assert.doesNotMatch(page, /待办处理入口/);
assert.doesNotMatch(page, /AI 操作按钮/);
assert.match(page, /workbench-report-list/);
assert.match(page, /title="赛道分析报告"/);
assert.match(page, /title="标的分析报告"/);
