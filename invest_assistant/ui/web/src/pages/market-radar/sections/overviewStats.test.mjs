import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const overview = readFileSync("invest_assistant/ui/web/src/pages/market-radar/sections/OverviewSection.tsx", "utf8");
const api = readFileSync("invest_assistant/ui/web/src/api/marketRadar.ts", "utf8");

assert.match(api, /active_tags:\s*number/, "market overview response must include active tag count");
assert.match(overview, /overview\.data\.active_tags/, "overview must use aggregate active tag count");
assert.doesNotMatch(overview, /listMarketTags/, "overview must not fetch the full tag list for a count");
