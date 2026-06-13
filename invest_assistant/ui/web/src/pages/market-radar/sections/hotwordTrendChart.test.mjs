import { existsSync, readFileSync } from "node:fs";

const tagsPath = "invest_assistant/ui/web/src/pages/market-radar/sections/TagsSection.tsx";
const rankingsPath = "invest_assistant/ui/web/src/pages/market-radar/sections/RankingsSection.tsx";

if (!existsSync(tagsPath)) {
  throw new Error("Market hotword section must exist");
}

const tagsSource = readFileSync(tagsPath, "utf8");
const rankingsSource = readFileSync(rankingsPath, "utf8");

if (!rankingsSource.includes("trendLineOption(trend, selected ? tagName(selected) : undefined, selected?.window_type)")) {
  throw new Error("Market heat trend chart should keep using the selected ranking window");
}

if (!tagsSource.includes('const HOTWORD_TREND_WINDOW: RankingWindow = "24h"')) {
  throw new Error("Market hotword trend chart should use the same default heat window as the market heat page");
}

if (!tagsSource.includes("trendLineOption(trend, selected?.name, HOTWORD_TREND_WINDOW)")) {
  throw new Error("Market hotword trend chart should pass a heat window into trendLineOption");
}
