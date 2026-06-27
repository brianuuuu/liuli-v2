import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./TopStatusBar.tsx", import.meta.url), "utf8");
const globalCss = readFileSync(new URL("../../styles/global.css", import.meta.url), "utf8");

assert.doesNotMatch(source, />\s*brian\s*</, "top user button must not hard-code brian");
assert.match(source, /Dropdown/, "user button must be wrapped in an Ant Design Dropdown");
assert.match(source, /getMe/, "top bar must load the current user from auth API");
assert.match(source, /changePassword/, "top bar must call auth changePassword API");
assert.match(source, /Modal[\s\S]*修改密码/, "top bar must include a change-password modal");
assert.match(source, /confirm_password/, "change-password form must include confirmation password");
assert.match(source, /window\.localStorage\.removeItem\(tokenStorageKey\)/, "logout must clear the stored auth token");
assert.match(source, /AutoComplete/, "top search must use a candidate dropdown without replacing the top bar");
assert.match(source, /searchStockPool/, "top search must query stock pool results");
assert.match(source, /searchTracks/, "top search must query track library results");
assert.match(source, /搜索标的池 \/ 赛道库/, "top search placeholder must reflect the limited scope");
assert.match(source, /stock-analysis\/stocks/, "stock candidates must navigate to stock detail pages");
assert.match(source, /track-discovery\/tracks/, "track candidates must navigate to track detail pages");
assert.doesNotMatch(source, /搜索股票\/赛道\/公告\/知识库/, "top search must not advertise unsupported scopes");
assert.match(globalCss, /\[data-theme="dark"\]\s+\.global-search\s+\.ant-input-affix-wrapper/, "dark mode must style the inner AutoComplete input wrapper");
assert.match(globalCss, /\[data-theme="dark"\]\s+\.global-search\s+\.ant-input-affix-wrapper:hover/, "dark mode hover must target the inner AutoComplete input wrapper");
