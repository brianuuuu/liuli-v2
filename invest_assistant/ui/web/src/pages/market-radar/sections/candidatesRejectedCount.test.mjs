import { readFileSync } from "node:fs";

const section = readFileSync("invest_assistant/ui/web/src/pages/market-radar/sections/CandidatesSection.tsx", "utf8");
const types = readFileSync("invest_assistant/ui/web/src/types/api.ts", "utf8");

if (!types.includes("rejected_count: number")) {
  throw new Error("AiTagSuggestion type must expose rejected_count");
}

if (!section.includes('title: "拒绝次数"') || !section.includes('dataIndex: "rejected_count"')) {
  throw new Error("AI 推荐词列表 must show rejected_count as 拒绝次数");
}
