import { existsSync, readFileSync } from "node:fs";
import { Buffer } from "node:buffer";
import ts from "../../../../node_modules/typescript/lib/typescript.js";

const overviewPath = "invest_assistant/ui/web/src/pages/market-radar/sections/OverviewSection.tsx";
const helperPath = "invest_assistant/ui/web/src/pages/market-radar/sections/overviewRisingRankings.ts";
const apiPath = "invest_assistant/ui/web/src/api/marketRadar.ts";
const cssPath = "invest_assistant/ui/web/src/styles/global.css";

if (!existsSync(helperPath)) {
  throw new Error("Overview rising ranking helper must exist");
}

const overview = readFileSync(overviewPath, "utf8");
const api = readFileSync(apiPath, "utf8");
const css = readFileSync(cssPath, "utf8");
const helperSource = readFileSync(helperPath, "utf8");

const compiled = ts.transpileModule(helperSource, {
  compilerOptions: {
    module: ts.ModuleKind.ES2020,
    target: ts.ScriptTarget.ES2020
  }
}).outputText;
const helper = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

const sampleRows = [
  { id: 1, rank_no: 1, heat_score: 100, change_ratio: 0.08, tag_id: 1, window_type: "7d", stat_time: "2026-06-01T09:30:00" },
  { id: 2, rank_no: 2, heat_score: 50, change_ratio: 0.12, tag_id: 2, window_type: "7d", stat_time: "2026-06-01T09:30:00" },
  { id: 3, rank_no: 3, heat_score: 80, change_ratio: 0.12, tag_id: 3, window_type: "7d", stat_time: "2026-06-01T09:30:00" },
  { id: 4, rank_no: 4, heat_score: 20, change_ratio: -0.02, tag_id: 4, window_type: "7d", stat_time: "2026-06-01T09:30:00" },
  { id: 5, rank_no: 5, heat_score: 10, change_ratio: 0.01, tag_id: 5, window_type: "7d", stat_time: "2026-06-01T09:30:00" },
  { id: 6, rank_no: 6, heat_score: 9, change_ratio: 0.02, tag_id: 6, window_type: "7d", stat_time: "2026-06-01T09:30:00" }
];

const sorted = helper.risingTopRows(sampleRows);
if (sorted.length !== 5) {
  throw new Error(`Expected risingTopRows to keep only positive rows, got ${sorted.length}`);
}

if (sorted.map((item) => item.id).join(",") !== "3,2,1,6,5") {
  throw new Error(`Expected change_ratio-first stable ordering, got ${sorted.map((item) => item.id).join(",")}`);
}

const coolingRows = [
  { id: 7, rank_no: 1, heat_score: 50, change_ratio: -0.1, tag_id: 7, window_type: "7d", stat_time: "2026-06-01T09:30:00" },
  { id: 8, rank_no: 2, heat_score: 30, change_ratio: -0.22, tag_id: 8, window_type: "7d", stat_time: "2026-06-01T09:30:00" },
  { id: 9, rank_no: 3, heat_score: 60, change_ratio: -0.22, tag_id: 9, window_type: "7d", stat_time: "2026-06-01T09:30:00" },
  { id: 10, rank_no: 4, heat_score: 90, change_ratio: 0, tag_id: 10, window_type: "7d", stat_time: "2026-06-01T09:30:00" },
  { id: 11, rank_no: 5, heat_score: 45, change_ratio: -0.05, tag_id: 11, window_type: "7d", stat_time: "2026-06-01T09:30:00" },
  { id: 12, rank_no: 6, heat_score: 25, change_ratio: -0.01, tag_id: 12, window_type: "7d", stat_time: "2026-06-01T09:30:00" }
];

const coolingSorted = helper.coolingTopRows(coolingRows);
if (coolingSorted.map((item) => item.id).join(",") !== "9,8,7,11,12") {
  throw new Error(`Expected coolingTopRows to sort largest drops first, got ${coolingSorted.map((item) => item.id).join(",")}`);
}

const neutralRows = [
  { id: 13, rank_no: 1, heat_score: 70, change_ratio: 0, tag_id: 13, window_type: "7d", stat_time: "2026-06-01T09:30:00" },
  { id: 14, rank_no: 2, heat_score: 40, change_ratio: -0.04, tag_id: 14, window_type: "7d", stat_time: "2026-06-01T09:30:00" },
  { id: 15, rank_no: 3, heat_score: 30, change_ratio: 0.05, tag_id: 15, window_type: "7d", stat_time: "2026-06-01T09:30:00" }
];

if (helper.risingTopRows(neutralRows).map((item) => item.id).join(",") !== "15") {
  throw new Error("risingTopRows should filter neutral and cooling rows");
}

if (helper.coolingTopRows(neutralRows).map((item) => item.id).join(",") !== "14") {
  throw new Error("coolingTopRows should filter neutral and rising rows");
}

if (helper.formatRisePercent(0.12) !== "+12%") {
  throw new Error(`Expected 0.12 to display as +12%, got ${helper.formatRisePercent(0.12)}`);
}

if (helper.formatRisePercent(-0.02) !== "-2%") {
  throw new Error(`Expected -0.02 to display as -2%, got ${helper.formatRisePercent(-0.02)}`);
}

if (overview.includes("24h 热度排行")) {
  throw new Error("Overview should no longer render the 24h heat ranking chart");
}

if (overview.includes('listRankings("hotword", "24h")') || overview.includes('listRankings("track", "24h")') || overview.includes('listRankings("stock", "24h")')) {
  throw new Error("Overview should no longer load three 24h ranking lists");
}

if (!overview.includes("risingWindows") || !overview.includes("risingTypes")) {
  throw new Error("Overview should render rising ranking groups by window and type");
}

if (overview.includes("Segmented")) {
  throw new Error("Overview heat boards should use the shared toolbar button segmented style instead of raw Segmented");
}

if (!overview.includes("heat-board-segmented") || !overview.includes("toolbar-status-buttons") || !overview.includes("toolbar-filter-button")) {
  throw new Error("Overview heat boards should use the shared segmented button classes");
}

const risingListRule = css.match(/\.market-rising-list \{[\s\S]*?\}/)?.[0] || "";
if (!risingListRule.includes("align-content: start")) {
  throw new Error("Sparse heat ranking columns should stay top-aligned and leave missing rows at the bottom");
}

const heatSegmentedContainerRule = css.match(/\.workbench-card \.ant-card-extra \.heat-board-segmented \{[\s\S]*?\}/)?.[0] || "";
if (heatSegmentedContainerRule.includes("border:")) {
  throw new Error("Heat board segmented container should not render an outer border");
}

if (!overview.includes("activeRisingWindow")) {
  throw new Error("Overview should show one active rising window at a time");
}

if (!overview.includes("activeCoolingWindow")) {
  throw new Error("Overview should show one active cooling window at a time");
}

if (overview.includes("risingWindows.map((window)")) {
  throw new Error("Overview should not render one card per rising window");
}

if (!overview.includes('title="热度升温榜"')) {
  throw new Error("Overview should render a single rising ranking card");
}

if (!overview.includes('title="热度降温榜"')) {
  throw new Error("Overview should render a cooling ranking card next to the rising card");
}

if (!api.includes('export type RankingWindow = "1h" | "24h" | "7d" | "30d" | "90d"')) {
  throw new Error("RankingWindow must support 90d");
}
