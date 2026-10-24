import fs from "node:fs";
import assert from "node:assert/strict";

const page = fs.readFileSync(new URL("./CompareSection.tsx", import.meta.url), "utf8");

// 操作列：雷达图并进详情，删除收进菜单并二次确认，不在每行铺红色按钮
assert.match(page, />详情</);
assert.doesNotMatch(page, />雷达图</);
assert.doesNotMatch(page, /<Popconfirm/);
assert.match(page, /confirmRemoveScore/);

// 分项分数只标两头（≥9 长项、≤7 短板），不铺底色：底色会满屏色块且和勾选高亮撞色
assert.match(page, /const STRONG_SCORE = 9;/);
assert.match(page, /const WEAK_SCORE = 7;/);
assert.doesNotMatch(page, /scoreHeatStyle|rgba\(37, 99, 235/);

// 研究员显示中文名
assert.match(page, /listKnowledgeResearchers/);
assert.match(page, /researcherLabel\(value\)/);

// 勾选 2–4 只叠加对比雷达
assert.match(page, /rowSelection=/);
assert.match(page, /const MAX_COMPARE = 4;/);
assert.match(page, /对比雷达/);

// 赛道：隐藏 0 个标的的赛道、按数量排序、换行不横向滚动；去掉"横向比较"字样
assert.match(page, /\.filter\(\(item\) => item\.count > 0 \|\| item\.value === trackFilter\)/);
assert.match(page, /<Space size=\{4\} wrap className="toolbar-track-buttons">/);
assert.doesNotMatch(page, /no-scrollbar/);
assert.doesNotMatch(page, /横向比较/);

// 评分 / 估值不自动插空格；分页统一每页 10 条、不显示条数切换
assert.match(page, /autoInsertSpace=\{false\}/);
assert.doesNotMatch(page, /showSizeChanger: true/);
// 第三个页签"趋势"：最新趋势研究横向比，长文字进详情弹窗
assert.match(page, /\{ value: "trend", label: "趋势" \}/);
assert.match(page, /listStockTrendComparison/);
assert.match(page, /趋势等级/);
assert.match(page, /建议分组/);
assert.match(page, /趋势研究/);
