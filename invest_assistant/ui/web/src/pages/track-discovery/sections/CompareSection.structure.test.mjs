import fs from "node:fs";
import assert from "node:assert/strict";

const page = fs.readFileSync(new URL("./CompareSection.tsx", import.meta.url), "utf8");

// 对比数据走专用接口，默认列表就带六维分数，不再靠单选赛道查快照
assert.match(page, /listTrackComparison/);
assert.doesNotMatch(page, /listTrackTrendSnapshots/);
assert.doesNotMatch(page, /选择赛道查看快照/);
// 列名用 spec 11.4 的展示名
assert.match(page, /资金热度/);
assert.match(page, /行业集中度/);
// 分数只标两头，阈值按赛道分布定
assert.match(page, /STRONG_SCORE = 8/);
assert.match(page, /WEAK_SCORE = 4/);
// 勾选 2–4 个叠加雷达，结论文字在弹窗里并排
assert.match(page, /rowSelection=/);
assert.match(page, /对比雷达/);
assert.match(page, /下一步验证/);
assert.match(page, /待研究/);
