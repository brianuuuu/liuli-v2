import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./trackDiscovery.ts", import.meta.url), "utf8");

assert.match(source, /let\s+trackDashboardRequest:\s*Promise<TrackDashboard>\s*\|\s*null/, "track dashboard must keep one in-flight request");
assert.match(source, /if\s*\(\s*trackDashboardRequest\s*\)\s*return\s+trackDashboardRequest/, "track dashboard must reuse the in-flight request");
assert.match(source, /\.finally\(\(\)\s*=>\s*\{\s*trackDashboardRequest\s*=\s*null;\s*\}\)/s, "track dashboard must clear the in-flight request");
