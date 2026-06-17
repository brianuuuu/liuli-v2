import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const api = readFileSync(new URL("./console.ts", import.meta.url), "utf8");
const sections = readFileSync("invest_assistant/ui/web/src/pages/console/sections.tsx", "utf8");
const statusSection = readFileSync("invest_assistant/ui/web/src/pages/console/sections/StatusSection.tsx", "utf8");

assert.match(api, /export async function getAiLogStats\(\)/, "console API must expose aggregate AI log stats");
assert.match(api, /const\s+aiLogsRequests\s*=\s*new Map<string, Promise<Page<AiRequestLog>>>/, "AI log list must dedupe in-flight requests by params");
assert.match(api, /const\s+requestKey\s*=\s*JSON\.stringify\(requestParams\)/, "AI log list must key in-flight requests by pagination params");
assert.match(api, /offset\?:\s*number/, "AI log list params must support offset pagination");

assert.match(sections, /getAiLogs\(\{\s*limit:\s*pageSize,\s*offset:\s*\(page - 1\) \* pageSize\s*\}\)/, "AI logs tab must request the selected server-side page");
assert.match(statusSection, /getAiLogStats/, "console status must use aggregate AI log stats");
assert.doesNotMatch(statusSection, /getAiLogs/, "console status must not fetch the AI log list for a count");
