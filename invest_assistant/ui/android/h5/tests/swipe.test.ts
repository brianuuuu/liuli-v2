import { describe, expect, it } from "vitest";
import { tabAfterSwipe } from "../src/app/swipe";

const tabs = [
  { key: "all", label: "全部" },
  { key: "important", label: "重要" },
  { key: "stock", label: "个股" }
] as const;

describe("mobile tab swiping", () => {
  it("moves one tab at a time and stops at both ends", () => {
    expect(tabAfterSwipe(tabs, "all", -80)).toBe("important");
    expect(tabAfterSwipe(tabs, "important", 80)).toBe("all");
    expect(tabAfterSwipe(tabs, "all", 80)).toBe("all");
    expect(tabAfterSwipe(tabs, "stock", -80)).toBe("stock");
  });

  it("ignores short horizontal movement", () => {
    expect(tabAfterSwipe(tabs, "important", 30)).toBe("important");
  });
});
