import { describe, expect, it } from "vitest";
import { buildPortfolioTreemapOption } from "../src/components/portfolioTreemap";

type TreemapSeries = {
  type: string;
  roam: boolean;
  nodeClick: boolean;
  sort: string;
  breadcrumb: { show: boolean };
  data: Array<{
    name: string;
    value: number;
    label: { formatter: string; color: string };
    itemStyle: { color: string };
  }>;
};

function firstSeries(option: ReturnType<typeof buildPortfolioTreemapOption>) {
  return (option.series as TreemapSeries[])[0];
}

describe("portfolio treemap option", () => {
  it("shows name, price, and signed change in a large rising holding", () => {
    const series = firstSeries(buildPortfolioTreemapOption([{
      name: "宁德时代",
      marketValue: 72_000,
      weight: 40,
      currentPrice: 286.5,
      dayPct: 2.35
    }], "light"));

    expect(series.data[0]).toEqual(expect.objectContaining({
      name: "宁德时代",
      value: 72_000,
      label: expect.objectContaining({
        formatter: "宁德时代\n¥286.50\n+2.35%",
        color: "#ffffff"
      }),
      itemStyle: { color: "#b94747" }
    }));
  });

  it("uses green for falling holdings and deepens colors for larger moves", () => {
    const smallMove = firstSeries(buildPortfolioTreemapOption([{
      name: "机器人",
      marketValue: 20_000,
      weight: 10,
      currentPrice: 18.2,
      dayPct: -1.2
    }], "light")).data[0];
    const largeMove = firstSeries(buildPortfolioTreemapOption([{
      name: "机器人",
      marketValue: 20_000,
      weight: 10,
      currentPrice: 18.2,
      dayPct: -4.8
    }], "light")).data[0];

    expect(smallMove.label.formatter).toBe("机器人\n¥18.20\n-1.20%");
    expect(smallMove.itemStyle.color).toBe("#4f9a6a");
    expect(largeMove.itemStyle.color).toBe("#2f7149");
  });

  it("uses neutral colors and double-dash fallbacks for missing quotes", () => {
    const datum = firstSeries(buildPortfolioTreemapOption([{
      name: "缺失行情",
      marketValue: 10_000,
      weight: 9,
      currentPrice: null,
      dayPct: null
    }], "dark")).data[0];

    expect(datum.label.formatter).toBe("缺失行情\n--\n--");
    expect(datum.itemStyle.color).toBe("#475569");
  });

  it("reduces label detail as holding rectangles get smaller", () => {
    const data = firstSeries(buildPortfolioTreemapOption([
      { name: "完整", marketValue: 80, weight: 8, currentPrice: 10, dayPct: 1 },
      { name: "精简", marketValue: 50, weight: 5, currentPrice: 10, dayPct: -2 },
      { name: "最小", marketValue: 20, weight: 2, currentPrice: 10, dayPct: 0 }
    ], "light")).data;

    expect(data.map((item) => item.label.formatter)).toEqual([
      "完整\n¥10.00\n+1.00%",
      "精简\n-2.00%",
      "最小"
    ]);
  });

  it("disables treemap navigation and keeps the largest holdings first", () => {
    const series = firstSeries(buildPortfolioTreemapOption([], "light"));

    expect(series).toEqual(expect.objectContaining({
      type: "treemap",
      roam: false,
      nodeClick: false,
      sort: "desc",
      breadcrumb: { show: false }
    }));
  });
});
