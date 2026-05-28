import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./marketRadar.ts", import.meta.url), "utf8");

assert.match(source, /syncFutuMarketFlashes/);
assert.match(source, /\/api\/jobs\/market_radar\.fetch_futu_news\/run/);
assert.match(source, /params:\s*\{\s*limit\s*\}/);
assert.match(source, /listSourceItems\(\s*params/);
assert.match(source, /limit\?:\s*number/);
assert.match(source, /offset\?:\s*number/);
