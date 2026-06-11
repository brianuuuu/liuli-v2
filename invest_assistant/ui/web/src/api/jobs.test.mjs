import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./jobs.ts", import.meta.url), "utf8");

assert.match(source, /const\s+runRequestsInFlight\s*=\s*new Map<string,\s*Promise<Page<JobRunRequest>>>/, "run requests must share in-flight calls by params");
assert.match(source, /limit:\s*8[\s,]/, "run request list default should match the small dashboard table");
assert.match(source, /if\s*\(\s*runRequestsInFlight\.has\(key\)\s*\)/, "run request list must reuse matching in-flight calls");
assert.match(source, /runRequestsInFlight\.delete\(key\)/, "run request in-flight cache must be released after completion");
