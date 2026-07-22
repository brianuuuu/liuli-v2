import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("mobile card elevation", () => {
  it("keeps ordinary content cards flat while floating actions remain elevated", () => {
    const styles = readFileSync("src/styles.css", "utf8");
    const lightTheme = styles.match(/:root\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(lightTheme).toMatch(/--shadow:\s*none;/);
    expect(styles).toMatch(/\.floating-button\s*\{[^}]*box-shadow:\s*(?!none)[^;}]+;/s);
  });

  it("keeps note cards compact and distinguishes their group metadata", () => {
    const styles = readFileSync("src/styles.css", "utf8");

    expect(styles).toMatch(/\.note-card\s*\{[^}]*padding:\s*12px 14px;/s);
    expect(styles).toMatch(/\.note-card p\s*\{[^}]*margin:\s*6px 0 0;[^}]*line-height:\s*1\.55;/s);
    expect(styles).toMatch(/\.note-card footer\s*\{[^}]*margin-top:\s*7px;/s);
    expect(styles).toMatch(/\.note-card footer \.note-card-group\s*\{/);
  });

  it("allows the composer to scroll inside the visual viewport", () => {
    const styles = readFileSync("src/styles.css", "utf8");

    expect(styles).toMatch(/\.composer-backdrop\s*\{[^}]*bottom:\s*auto;/s);
    expect(styles).toMatch(/\.composer-sheet\s*\{[^}]*max-height:\s*100%;[^}]*overflow-y:\s*auto;/s);
  });
});
