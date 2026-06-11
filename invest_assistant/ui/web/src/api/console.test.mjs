import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const api = readFileSync(new URL("./console.ts", import.meta.url), "utf8");
const sections = readFileSync("invest_assistant/ui/web/src/pages/console/sections.tsx", "utf8");
const statusSection = readFileSync("invest_assistant/ui/web/src/pages/console/sections/StatusSection.tsx", "utf8");

assert.match(api, /export async function getAiLogStats\(\)/, "console API must expose aggregate AI log stats");
assert.match(api, /let\s+aiLogsRequest:\s*Promise<AiRequestLog\[]>\s*\|\s*null/, "AI log list must dedupe in-flight requests");
assert.match(api, /if\s*\(\s*aiLogsRequest\s*\)\s*return\s+aiLogsRequest/, "AI log list must reuse an in-flight request");
assert.match(api, /params:\s*\{\s*limit:\s*20[\s,]/, "AI log tab should only request the visible first rows");

assert.match(sections, /getAiLogs\(\{\s*limit:\s*20\s*\}\)/, "AI logs tab must request a small explicit limit");
assert.match(statusSection, /getAiLogStats/, "console status must use aggregate AI log stats");
assert.doesNotMatch(statusSection, /getAiLogs/, "console status must not fetch the AI log list for a count");
