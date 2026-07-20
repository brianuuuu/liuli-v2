import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("mobile card elevation", () => {
  it("keeps ordinary content cards flat while floating actions remain elevated", () => {
    const styles = readFileSync("src/styles.css", "utf8");
    const lightTheme = styles.match(/:root\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(lightTheme).toMatch(/--shadow:\s*none;/);
    expect(styles).toMatch(/\.floating-button\s*\{[^}]*box-shadow:\s*(?!none)[^;}]+;/s);
  });
});
