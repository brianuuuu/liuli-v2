import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./FlashSection.tsx", import.meta.url), "utf8");
const toolbarIndex = source.indexOf('className="flash-command-bar"');
const layoutIndex = source.indexOf('className="flash-layout"');
const contentIndex = source.indexOf('className="flash-content-column"');
const panelIndex = source.indexOf('className="flash-feed-panel"');
const scrollIndex = source.indexOf('className="flash-scroll"');

assert.ok(toolbarIndex > -1, "flash command bar should be rendered");
assert.ok(layoutIndex > -1, "flash layout should still be rendered");
assert.ok(contentIndex > -1, "feed column should wrap the merged feed panel");
assert.ok(layoutIndex < contentIndex, "feed column should sit inside the flash layout");
assert.ok(contentIndex < panelIndex, "feed panel should sit inside the feed column");
assert.ok(panelIndex < toolbarIndex, "command bar should be merged into the feed panel");
assert.ok(toolbarIndex < scrollIndex, "command bar should sit above the scroll area inside the feed panel");
assert.doesNotMatch(source, /className="flash-toolbar"/);
assert.doesNotMatch(source, /同步财联社/);
assert.doesNotMatch(source, /同步富途/);
assert.doesNotMatch(source, /syncClsMarketFlashes/);
assert.doesNotMatch(source, /syncFutuMarketFlashes/);
assert.match(source, /刷新/);
assert.match(source, /onScroll=\{handleFlashScroll\}/);
