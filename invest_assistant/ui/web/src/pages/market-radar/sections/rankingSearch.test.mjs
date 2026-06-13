import { existsSync, readFileSync } from "node:fs";
import { Buffer } from "node:buffer";
import ts from "../../../../node_modules/typescript/lib/typescript.js";

const helperPath = "invest_assistant/ui/web/src/pages/market-radar/sections/rankingSearch.ts";
const rankingsPath = "invest_assistant/ui/web/src/pages/market-radar/sections/RankingsSection.tsx";

if (!existsSync(helperPath)) {
  throw new Error("Market heat ranking search helper must exist");
}

const helperSource = readFileSync(helperPath, "utf8");
const rankingsSource = readFileSync(rankingsPath, "utf8");

const compiled = ts.transpileModule(helperSource, {
  compilerOptions: {
    module: ts.ModuleKind.ES2020,
    target: ts.ScriptTarget.ES2020
  }
}).outputText;
const helper = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

const rows = [
  { id: 1, tag_id: 101, rank_no: 1, heat_score: 90, trigger_count: 8, source_count: 3, avg_count: 2, window_type: "24h", stat_time: "2026-06-01T09:30:00", tag: { id: 101, name: "机器人", type: "track", status: "active" } },
  { id: 2, tag_id: 202, rank_no: 2, heat_score: 70, trigger_count: 6, source_count: 2, avg_count: 1, window_type: "24h", stat_time: "2026-06-01T09:30:00", tag: { id: 202, name: "半导体", type: "stock", status: "active" } },
  { id: 3, tag_id: 303, rank_no: 3, heat_score: 50, trigger_count: 4, source_count: 1, avg_count: 1, window_type: "24h", stat_time: "2026-06-01T09:30:00", tag: { id: 303, name: "降息预期", type: "hotword", status: "active" } }
];

if (helper.filterRankingRows(rows, "").length !== rows.length) {
  throw new Error("Empty market heat search should keep all ranking rows");
}

if (helper.filterRankingRows(rows, "机器人").map((item) => item.id).join(",") !== "1") {
  throw new Error("Market heat search should match tag names");
}

if (helper.filterRankingRows(rows, "202").map((item) => item.id).join(",") !== "2") {
  throw new Error("Market heat search should match tag ids");
}

if (helper.filterRankingRows(rows, "市场热词").map((item) => item.id).join(",") !== "3") {
  throw new Error("Market heat search should match Chinese tag type labels");
}

if (!rankingsSource.includes("Input.Search") || !rankingsSource.includes("filterRankingRows")) {
  throw new Error("Market heat toolbar should render a search box and filter ranking rows");
}
