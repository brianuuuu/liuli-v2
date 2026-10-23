import fs from "node:fs";
import assert from "node:assert/strict";

const page = fs.readFileSync(new URL("./CompareSection.tsx", import.meta.url), "utf8");

// 操作列：雷达图并进详情，删除收进菜单并二次确认，不在每行铺红色按钮
assert.match(page, />详情</);
assert.doesNotMatch(page, />雷达图</);
assert.doesNotMatch(page, /<Popconfirm/);
assert.match(page, /confirmRemoveScore/);

// 分项分数按高低加底色，便于横向比较
assert.match(page, /scoreHeatStyle/);

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
