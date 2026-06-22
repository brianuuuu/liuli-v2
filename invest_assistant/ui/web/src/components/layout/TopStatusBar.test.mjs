import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./TopStatusBar.tsx", import.meta.url), "utf8");

assert.doesNotMatch(source, />\s*brian\s*</, "top user button must not hard-code brian");
assert.match(source, /Dropdown/, "user button must be wrapped in an Ant Design Dropdown");
assert.match(source, /getMe/, "top bar must load the current user from auth API");
assert.match(source, /changePassword/, "top bar must call auth changePassword API");
assert.match(source, /Modal[\s\S]*修改密码/, "top bar must include a change-password modal");
assert.match(source, /confirm_password/, "change-password form must include confirmation password");
assert.match(source, /window\.localStorage\.removeItem\(tokenStorageKey\)/, "logout must clear the stored auth token");
