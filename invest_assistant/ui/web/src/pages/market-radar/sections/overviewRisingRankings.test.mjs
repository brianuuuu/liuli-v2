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
  { id: 1, rank_no: 1, heat_score: 100, rank_change: 1, rank_movement: "up", tag_id: 1, window_type: "7d", stat_time: "2026-06-01T09:30:00" },
  { id: 2, rank_no: 2, heat_score: 50, rank_change: 4, rank_movement: "up", tag_id: 2, window_type: "7d", stat_time: "2026-06-01T09:30:00" },
  { id: 3, rank_no: 3, heat_score: 80, rank_change: 4, rank_movement: "up", tag_id: 3, window_type: "7d", stat_time: "2026-06-01T09:30:00" },
  { id: 4, rank_no: 4, heat_score: 20, rank_change: -2, rank_movement: "down", tag_id: 4, window_type: "7d", stat_time: "2026-06-01T09:30:00" },
  { id: 5, rank_no: 5, heat_score: 10, rank_change: null, rank_movement: "new", tag_id: 5, window_type: "7d", stat_time: "2026-06-01T09:30:00" },
  { id: 6, rank_no: 6, heat_score: 9, rank_change: 2, rank_movement: "up", tag_id: 6, window_type: "7d", stat_time: "2026-06-01T09:30:00" }
];

const sorted = helper.risingTopRows(sampleRows);
if (sorted.length !== 5) {
  throw new Error(`Expected risingTopRows to keep only positive rows, got ${sorted.length}`);
}

if (sorted.map((item) => item.id).join(",") !== "3,2,6,1,5") {
  throw new Error(`Expected rank_change-first ordering with new entries after true rises, got ${sorted.map((item) => item.id).join(",")}`);
}

const twelveRisingRows = [
  ...sampleRows,
  { id: 21, rank_no: 7, heat_score: 8, rank_change: 2, rank_movement: "up", tag_id: 21, window_type: "7d", stat_time: "2026-06-01T09:30:00" },
  { id: 22, rank_no: 8, heat_score: 7, rank_change: 2, rank_movement: "up", tag_id: 22, window_type: "7d", stat_time: "2026-06-01T09:30:00" },
  { id: 23, rank_no: 9, heat_score: 6, rank_change: 2, rank_movement: "up", tag_id: 23, window_type: "7d", stat_time: "2026-06-01T09:30:00" },
  { id: 24, rank_no: 10, heat_score: 5, rank_change: 2, rank_movement: "up", tag_id: 24, window_type: "7d", stat_time: "2026-06-01T09:30:00" },
  { id: 25, rank_no: 11, heat_score: 4, rank_change: 2, rank_movement: "up", tag_id: 25, window_type: "7d", stat_time: "2026-06-01T09:30:00" },
  { id: 26, rank_no: 12, heat_score: 3, rank_change: 2, rank_movement: "up", tag_id: 26, window_type: "7d", stat_time: "2026-06-01T09:30:00" },
  { id: 27, rank_no: 13, heat_score: 2, rank_change: 2, rank_movement: "up", tag_id: 27, window_type: "7d", stat_time: "2026-06-01T09:30:00" }
];
const sortedTwelve = helper.risingTopRows(twelveRisingRows);
if (sortedTwelve.length !== 10) {
  throw new Error(`Expected risingTopRows to limit to 10 rows by default, got ${sortedTwelve.length}`);
}

const coolingRows = [
  { id: 7, rank_no: 1, heat_score: 50, rank_change: -3, rank_movement: "down", tag_id: 7, window_type: "7d", stat_time: "2026-06-01T09:30:00" },
  { id: 8, rank_no: 2, heat_score: 30, rank_change: -8, rank_movement: "down", tag_id: 8, window_type: "7d", stat_time: "2026-06-01T09:30:00" },
  { id: 9, rank_no: 3, heat_score: 60, rank_change: -8, rank_movement: "down", tag_id: 9, window_type: "7d", stat_time: "2026-06-01T09:30:00" },
  { id: 10, rank_no: 4, heat_score: 90, rank_change: 0, rank_movement: "flat", tag_id: 10, window_type: "7d", stat_time: "2026-06-01T09:30:00" },
  { id: 11, rank_no: 5, heat_score: 45, rank_change: -1, rank_movement: "down", tag_id: 11, window_type: "7d", stat_time: "2026-06-01T09:30:00" },
  { id: 12, rank_no: 6, heat_score: 25, rank_change: 1, rank_movement: "up", tag_id: 12, window_type: "7d", stat_time: "2026-06-01T09:30:00" }
];

const coolingSorted = helper.coolingTopRows(coolingRows);
if (coolingSorted.map((item) => item.id).join(",") !== "9,8,7,11") {
  throw new Error(`Expected coolingTopRows to sort largest drops first, got ${coolingSorted.map((item) => item.id).join(",")}`);
}

const twelveCoolingRows = [
  ...coolingRows,
  { id: 31, rank_no: 7, heat_score: 8, rank_change: -2, rank_movement: "down", tag_id: 31, window_type: "7d", stat_time: "2026-06-01T09:30:00" },
  { id: 32, rank_no: 8, heat_score: 7, rank_change: -2, rank_movement: "down", tag_id: 32, window_type: "7d", stat_time: "2026-06-01T09:30:00" },
  { id: 33, rank_no: 9, heat_score: 6, rank_change: -2, rank_movement: "down", tag_id: 33, window_type: "7d", stat_time: "2026-06-01T09:30:00" },
  { id: 34, rank_no: 10, heat_score: 5, rank_change: -2, rank_movement: "down", tag_id: 34, window_type: "7d", stat_time: "2026-06-01T09:30:00" },
  { id: 35, rank_no: 11, heat_score: 4, rank_change: -2, rank_movement: "down", tag_id: 35, window_type: "7d", stat_time: "2026-06-01T09:30:00" },
  { id: 36, rank_no: 12, heat_score: 3, rank_change: -2, rank_movement: "down", tag_id: 36, window_type: "7d", stat_time: "2026-06-01T09:30:00" },
  { id: 37, rank_no: 13, heat_score: 2, rank_change: -2, rank_movement: "down", tag_id: 37, window_type: "7d", stat_time: "2026-06-01T09:30:00" }
];
const coolingTwelveSorted = helper.coolingTopRows(twelveCoolingRows);
if (coolingTwelveSorted.length !== 10) {
  throw new Error(`Expected coolingTopRows to limit to 10 rows by default, got ${coolingTwelveSorted.length}`);
}

const neutralRows = [
  { id: 13, rank_no: 1, heat_score: 70, rank_change: 0, rank_movement: "flat", tag_id: 13, window_type: "7d", stat_time: "2026-06-01T09:30:00" },
  { id: 14, rank_no: 2, heat_score: 40, rank_change: -1, rank_movement: "down", tag_id: 14, window_type: "7d", stat_time: "2026-06-01T09:30:00" },
  { id: 15, rank_no: 3, heat_score: 30, rank_change: 1, rank_movement: "up", tag_id: 15, window_type: "7d", stat_time: "2026-06-01T09:30:00" }
];

if (helper.risingTopRows(neutralRows).map((item) => item.id).join(",") !== "15") {
  throw new Error("risingTopRows should filter neutral and cooling rows");
}

if (helper.coolingTopRows(neutralRows).map((item) => item.id).join(",") !== "14") {
  throw new Error("coolingTopRows should filter neutral and rising rows");
}

if (helper.formatRankMovement({ rank_change: 4, rank_movement: "up" }) !== "↑ 4") {
  throw new Error("Expected positive rank movement to display as rank rise text");
}

if (helper.formatRankMovement({ rank_change: -2, rank_movement: "down" }) !== "↓ 2") {
  throw new Error("Expected negative rank movement to display as rank fall text");
}

if (helper.formatRankMovement({ rank_change: null, rank_movement: "new" }) !== "新进") {
  throw new Error("Expected new rank movement to display as new entry");
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

if (!api.includes('export type RankingWindow = "24h" | "7d" | "30d"')) {
  throw new Error("RankingWindow should only expose 24h, 7d, and 30d");
}

if (helperSource.includes("change_ratio") || overview.includes("change_ratio")) {
  throw new Error("Overview rising/cooling rankings should not depend on change_ratio");
}
