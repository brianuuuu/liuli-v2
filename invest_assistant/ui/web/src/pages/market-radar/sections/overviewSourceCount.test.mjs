import { readFileSync } from "node:fs";

const overview = readFileSync("invest_assistant/ui/web/src/pages/market-radar/sections/OverviewSection.tsx", "utf8");
const flash = readFileSync("invest_assistant/ui/web/src/pages/market-radar/sections/FlashSection.tsx", "utf8");

if (overview.includes("listSourceItems")) {
  throw new Error("Overview market signal count must not depend on paged source item loading");
}

if (!overview.includes('value={overview.data.source_items}')) {
  throw new Error("Overview market signal count must use overview.data.source_items directly");
}

if (flash.includes("sourceItems.length} 条")) {
  throw new Error("Flash toolbar should not show loaded item count");
}
