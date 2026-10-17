import { existsSync, readFileSync } from "node:fs";

const sectionsDir = "invest_assistant/ui/web/src/pages/market-radar/sections";
const tagsPath = `${sectionsDir}/TagsSection.tsx`;
const rankingsPath = `${sectionsDir}/RankingsSection.tsx`;
const drawerPath = `${sectionsDir}/TagTrendDrawer.tsx`;
const apiPath = "invest_assistant/ui/web/src/api/marketRadar.ts";

for (const path of [tagsPath, rankingsPath, drawerPath]) {
  if (!existsSync(path)) {
    throw new Error(`${path} must exist`);
  }
}

const tagsSource = readFileSync(tagsPath, "utf8");
const rankingsSource = readFileSync(rankingsPath, "utf8");
const drawerSource = readFileSync(drawerPath, "utf8");
const apiSource = readFileSync(apiPath, "utf8");

if (!apiSource.includes("params: { window }")) {
  throw new Error("Tag trend API must request the heat window from the backend instead of filtering client-side");
}

if (!drawerSource.includes("getTagTrend(tagId, timeWindow)")) {
  throw new Error("Tag trend drawer should fetch trend data for the active heat window");
}

if (!rankingsSource.includes("defaultWindow={(selected?.window_type as RankingWindow) || timeWindow}")) {
  throw new Error("Market heat trend drawer should open on the selected ranking window");
}

if (!tagsSource.includes('const HOTWORD_TREND_WINDOW: RankingWindow = "24h"')) {
  throw new Error("Market hotword trend chart should use the same default heat window as the market heat page");
}

if (!tagsSource.includes("defaultWindow={HOTWORD_TREND_WINDOW}")) {
  throw new Error("Market hotword trend drawer should pass the hotword heat window");
}
