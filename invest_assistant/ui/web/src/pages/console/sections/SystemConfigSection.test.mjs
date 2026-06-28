import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./SystemConfigSection.tsx", import.meta.url), "utf8");

assert.match(source, /function\s+displayConfigValue/, "system config table must use a displayConfigValue helper");
assert.match(source, /mcp\.clients/, "system config table must treat mcp.clients as sensitive");
assert.match(source, /\*\*\*/, "sensitive system config values must be masked in table display");
assert.match(source, /configValueForEditor\(editing\)/, "edit modal must keep using the raw config value");
assert.doesNotMatch(source, /MCP 示例/, "system config toolbar must not carry one-off MCP sample buttons");
