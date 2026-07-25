import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("mobile card elevation", () => {
  it("keeps ordinary content cards flat while floating actions remain elevated", () => {
    const styles = readFileSync("src/styles.css", "utf8");
    const lightTheme = styles.match(/:root\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(lightTheme).toMatch(/--shadow:\s*none;/);
    expect(styles).toMatch(/\.floating-button\s*\{[^}]*box-shadow:\s*(?!none)[^;}]+;/s);
  });

  it("renders notes as a continuous divided list on the page background", () => {
    const styles = readFileSync("src/styles.css", "utf8");

    expect(styles).toMatch(/\.note-list\s*\{[^}]*gap:\s*0;[^}]*background:\s*transparent;/s);
    expect(styles).toMatch(/\.note-card\s*\{[^}]*padding:\s*12px 14px;[^}]*border:\s*0;[^}]*border-radius:\s*0;[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/s);
    expect(styles).toMatch(/\.note-card \+ \.note-card\s*\{[^}]*border-top:\s*1px solid var\(--border\);/s);
    expect(styles).toMatch(/\.note-card-meta\s*\{[^}]*display:\s*flex;[^}]*gap:\s*8px;/s);
    expect(styles).toMatch(/\.note-card p\s*\{[^}]*margin:\s*6px 0 0;[^}]*font-weight:\s*500;[^}]*line-height:\s*1\.62;/s);
    expect(styles).toMatch(/\.note-card footer\s*\{[^}]*margin-top:\s*8px;/s);
    expect(styles).toMatch(/\.note-card footer \.note-card-tag\s*\{[^}]*background:\s*transparent;/s);
  });

  it("keeps the note editor usable when the visual viewport shrinks", () => {
    const styles = readFileSync("src/styles.css", "utf8");

    expect(styles).toMatch(/\.note-editor textarea\s*\{[^}]*min-height:\s*calc\(3 \* 1\.7em \+ 30px\);/s);
  });

  it("keeps the mobile content surface full-height across WebView viewport implementations", () => {
    const styles = readFileSync("src/styles.css", "utf8");

    expect(styles).toMatch(/\.mobile-page-frame__content\s*\{[^}]*min-height:\s*calc\(100vh - 36px\);[^}]*min-height:\s*calc\(100dvh - 36px\);/s);
  });

  it("allows the composer to scroll inside the visual viewport", () => {
    const styles = readFileSync("src/styles.css", "utf8");

    expect(styles).toMatch(/\.composer-backdrop\s*\{[^}]*bottom:\s*auto;/s);
    expect(styles).toMatch(/\.composer-sheet\s*\{[^}]*max-height:\s*100%;[^}]*overflow-y:\s*auto;/s);
  });
});
