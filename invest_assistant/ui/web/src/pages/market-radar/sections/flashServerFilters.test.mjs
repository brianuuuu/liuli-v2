import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const flash = readFileSync("invest_assistant/ui/web/src/pages/market-radar/sections/FlashSection.tsx", "utf8");
const api = readFileSync("invest_assistant/ui/web/src/api/marketRadar.ts", "utf8");

assert.match(api, /q\?:\s*string/);
assert.match(api, /source_name\?:\s*string/);
assert.match(api, /source_type\?:\s*string/);
assert.match(api, /important_only\?:\s*boolean/);
assert.match(api, /tag_id\?:\s*number/);

assert.match(flash, /const\s+sourceFilterOptions\s*=/);
assert.match(flash, /value:\s*"东方财富"[\s\S]*label:\s*"东方财富"/);
assert.match(flash, /value:\s*"富途牛牛"[\s\S]*label:\s*"富途牛牛"/);
assert.match(flash, /value:\s*"cninfo"[\s\S]*label:\s*"巨潮"/);
assert.match(flash, /showSearch/);
assert.match(flash, /listSourceItems\(\{\s*limit:\s*FLASH_PAGE_SIZE,\s*offset,\s*q:/);
assert.match(flash, /source_name:\s*sourceName/);
assert.match(flash, /source_type:\s*sourceType/);
assert.match(flash, /important_only:\s*importantOnly/);
assert.match(flash, /tag_id:\s*activeTagId/);

assert.doesNotMatch(flash, /\.filter\(\(item\)\s*=>\s*!sourceName/);
assert.doesNotMatch(flash, /\.filter\(\(item\)\s*=>\s*!sourceType/);
assert.doesNotMatch(flash, /\.filter\(\(item\)\s*=>\s*!importantOnly/);
assert.doesNotMatch(flash, /flashText\(item\)\.includes\(query\)/);
