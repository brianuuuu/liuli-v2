import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const flash = readFileSync("invest_assistant/ui/web/src/pages/market-radar/sections/FlashSection.tsx", "utf8");
const api = readFileSync("invest_assistant/ui/web/src/api/marketRadar.ts", "utf8");
const types = readFileSync("invest_assistant/ui/web/src/types/api.ts", "utf8");
const css = readFileSync("invest_assistant/ui/web/src/styles/global.css", "utf8");

assert.match(types, /author\?:\s*string\s*\|\s*null/);
assert.match(api, /author\?:\s*string/);

// 舆情按作者走服务端筛选，点作者名即筛选
assert.match(flash, /author:\s*author\.trim\(\)\s*\|\|\s*undefined/);
assert.match(flash, /className="flash-author"[\s\S]*setAuthor\(item\.author/);
assert.match(flash, /placeholder="舆情作者"/);
assert.match(flash, /作者：\{author\.trim\(\)\}/);

// 舆情不显示标题，正文直接展示；类型显示中文
assert.match(flash, /\{sentiment \? null : <div className="flash-title">/);
assert.match(flash, /\{sentiment \? null : <h2 className="flash-detail-title">/);
assert.match(flash, /sourceTypeNames\[item\.source_type\]/);
assert.doesNotMatch(flash, /<span>\{item\.source_type\}<\/span>/);

for (const platform of ["雪球", "微博", "知乎"]) {
  assert.match(flash, new RegExp(`value:\\s*"${platform}"`));
}

assert.match(css, /\.flash-dot\.sentiment\s*\{/);
assert.match(css, /\.flash-content\.sentiment\s*\{[\s\S]*-webkit-line-clamp:\s*4/);
