import { describe, expect, it } from "vitest";
import { buildPortfolioTreemapOption, fitTreemapLabel } from "../src/components/portfolioTreemapOption";

type TreemapSeries = {
  type: string;
  roam: boolean;
  nodeClick: boolean;
  silent: boolean;
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
  it("is display-only so a swipe starting on the chart switches tabs", () => {
    const option = buildPortfolioTreemapOption([{ name: "宁德时代", marketValue: 1, weight: 40, dayPct: 1 }], "light");
    expect(firstSeries(option)).toEqual(expect.objectContaining({ silent: true, roam: false, nodeClick: false }));
    expect(option).not.toHaveProperty("tooltip");
  });

  it("shows name, position weight, and signed change in a large rising holding", () => {
    const series = firstSeries(buildPortfolioTreemapOption([{
      name: "宁德时代",
      marketValue: 72_000,
      weight: 40,
      dayPct: 2.35
    }], "light"));

    expect(series.data[0]).toEqual(expect.objectContaining({
      name: "宁德时代",
      value: 72_000,
      label: expect.objectContaining({
        formatter: "宁德时代\n40.0%\n+2.35%",
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
      dayPct: -1.2
    }], "light")).data[0];
    const largeMove = firstSeries(buildPortfolioTreemapOption([{
      name: "机器人",
      marketValue: 20_000,
      weight: 10,
      dayPct: -4.8
    }], "light")).data[0];

    expect(smallMove.label.formatter).toBe("机器人\n10.0%\n-1.20%");
    expect(smallMove.itemStyle.color).toBe("#4f9a6a");
    expect(largeMove.itemStyle.color).toBe("#2f7149");
  });

  it("uses neutral colors and a double-dash fallback for a missing quote", () => {
    const datum = firstSeries(buildPortfolioTreemapOption([{
      name: "缺失行情",
      marketValue: 10_000,
      weight: 9,
      dayPct: null
    }], "dark")).data[0];

    expect(datum.label.formatter).toBe("缺失行情\n9.0%\n--");
    expect(datum.itemStyle.color).toBe("#475569");
  });

  it("reduces label detail as holding rectangles get smaller", () => {
    const data = firstSeries(buildPortfolioTreemapOption([
      { name: "完整", marketValue: 80, weight: 8, dayPct: 1 },
      { name: "精简", marketValue: 50, weight: 5, dayPct: -2 },
      { name: "最小", marketValue: 20, weight: 2, dayPct: 0 }
    ], "light")).data;

    expect(data.map((item) => item.label.formatter)).toEqual([
      "完整\n8.0%\n+1.00%",
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

// 尺寸取自真机持仓在 360 / 412 宽屏上排出来的块（已扣描边）
describe("treemap labels fitted to the laid-out tile", () => {
  const holding = (name: string, weight: number, dayPct: number) => ({ name, marketValue: weight, weight, dayPct });

  it("shows name, weight, and change when the tile is big enough", () => {
    expect(fitTreemapLabel(holding("招商银行", 23.4, -0.85), { width: 147, height: 194 }))
      .toEqual({ show: true, formatter: "招商银行\n23.4%\n-0.85%", fontSize: 12, lineHeight: 17 });
  });

  it("drops the weight line before clipping the change on a flat tile", () => {
    expect(fitTreemapLabel(holding("万东医疗", 8.2, 0.42), { width: 148, height: 45 }))
      .toEqual({ show: true, formatter: "万东医疗\n+0.42%", fontSize: 12, lineHeight: 17 });
  });

  it("shrinks the font before wrapping a name on a narrow tile", () => {
    expect(fitTreemapLabel(holding("佳驰科技", 4, 7.25), { width: 52, height: 84 }))
      .toEqual({ show: true, formatter: "佳驰科技\n4.0%\n+7.25%", fontSize: 11, lineHeight: 15 });
  });

  it("wraps the name and shortens the change instead of truncating on a very narrow tile", () => {
    expect(fitTreemapLabel(holding("航天南湖", 3, 8.21), { width: 43, height: 52 }))
      .toEqual({ show: true, formatter: "航天\n南湖\n+8.2%", fontSize: 10, lineHeight: 14 });
  });

  it("writes nothing on a sliver too small for one line", () => {
    expect(fitTreemapLabel(holding("零头", 0.2, 1), { width: 30, height: 12 })).toEqual({ show: false });
  });

  it("feeds the fitted labels into the chart option by data index", () => {
    const data = firstSeries(buildPortfolioTreemapOption(
      [holding("航天南湖", 3, 8.21)],
      "light",
      new Map([["0", { width: 43, height: 52 }]])
    )).data;
    expect(data[0].label.formatter).toBe("航天\n南湖\n+8.2%");
  });
});
