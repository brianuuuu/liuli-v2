import { describe, expect, it } from "vitest";
import { alertMatchesTab, newsQueryForTab } from "../src/api/filters";

describe("mobile filters", () => {
  it("maps stock news to Eastmoney without changing the API", () => {
    expect(newsQueryForTab("stock")).toEqual({ source_name: "东方财富" });
  });

  it("maps announcement and important tabs to existing query parameters", () => {
    expect(newsQueryForTab("announcement")).toEqual({ source_type: "announcement" });
    expect(newsQueryForTab("important")).toEqual({ important_only: true });
    expect(newsQueryForTab("all")).toEqual({});
  });

  it("filters alert states locally using existing event status", () => {
    expect(alertMatchesTab("unread", { status: "unread" })).toBe(true);
    expect(alertMatchesTab("unread", { status: "read" })).toBe(false);
    expect(alertMatchesTab("handled", { status: "handled" })).toBe(true);
    expect(alertMatchesTab("all", { status: "read" })).toBe(true);
  });
});
