import { describe, expect, it } from "vitest";
import { plainMarkdownText } from "../src/utils/format";

describe("plainMarkdownText", () => {
  it("strips markdown markers from a report summary but keeps the words", () => {
    expect(plainMarkdownText("**趋势等级T4→T2，属于修复机会。** 基准价格33.05—35.01元"))
      .toBe("趋势等级T4→T2，属于修复机会。 基准价格33.05—35.01元");
    expect(plainMarkdownText("## 结论\n> 维持 *A* 级，见[估值报告](/reports/465) 与 `priority_rank`"))
      .toBe("结论 维持 A 级，见估值报告 与 priority_rank");
  });

  it("leaves multiplication signs and plain text alone", () => {
    expect(plainMarkdownText("145亿元归母净利润×15倍PE，3 * 4 = 12")).toBe("145亿元归母净利润×15倍PE，3 * 4 = 12");
    expect(plainMarkdownText(null)).toBe("");
  });
});
