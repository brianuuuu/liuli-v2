import { describe, expect, it } from "vitest";
import { newsQueryForTab } from "../src/api/filters";

describe("mobile filters", () => {
  it("maps stock news to Eastmoney without changing the API", () => {
    expect(newsQueryForTab("stock")).toEqual({ source_name: "东方财富" });
  });

  it("maps announcement and important tabs to existing query parameters", () => {
    expect(newsQueryForTab("announcement")).toEqual({ source_type: "announcement" });
    expect(newsQueryForTab("important")).toEqual({ important_only: true });
    expect(newsQueryForTab("sentiment")).toEqual({ source_type: "sentiment" });
    expect(newsQueryForTab("all")).toEqual({});
  });
});
