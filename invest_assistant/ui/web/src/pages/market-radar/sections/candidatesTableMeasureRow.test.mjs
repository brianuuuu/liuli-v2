import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const section = readFileSync(new URL("./CandidatesSection.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../../../styles/global.css", import.meta.url), "utf8");

// AI 推荐词表格已精简列宽，改用固定表格布局撑满容器，不再需要横向滚动
assert.match(section, /tableLayout="fixed"/, "AI 推荐词表格使用固定表格布局");
assert.doesNotMatch(section, /scroll=\{\{\s*x:/, "AI 推荐词表格不应重新引入横向滚动");
assert.match(styles, /\.ant-table-measure-row/, "全局表格样式必须处理 Ant Table 横向滚动测量行");
assert.match(
  styles,
  /\.ant-table-wrapper\s+\.ant-table-tbody\s*>\s*tr:not\(\.ant-table-measure-row\)\s*>\s*td/,
  "普通数据行 padding 不能套到 Ant Table 测量行上"
);
assert.match(
  styles,
  /\.ant-table-wrapper\s+\.ant-table-tbody\s*>\s*tr\.ant-table-measure-row\s*>\s*td\s*\{[\s\S]*padding:\s*0\s*!important/,
  "测量行单元格必须保持 0 padding，避免表头和首行之间出现空行"
);
