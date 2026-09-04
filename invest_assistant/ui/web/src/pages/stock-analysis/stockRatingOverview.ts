import type { EChartsOption } from "echarts";
import type { StockScoreSnapshot } from "../../types/api";

export type LatestRatingOverview = {
  totalScore: number;
  investmentLevel: string | null;
  researcherCode: string | null;
  reportTime: string;
  coreLogic: string | null;
  primaryRisk: string | null;
  dimensions: { name: string; value: number }[];
};

export function buildLatestRatingOverview(
  score?: StockScoreSnapshot | null
): LatestRatingOverview | null {
  if (!score) return null;

  return {
    totalScore: score.total_score,
    investmentLevel: score.investment_level ?? null,
    researcherCode: score.researcher_code ?? null,
    reportTime: score.report_time,
    coreLogic: score.core_logic ?? null,
    primaryRisk: score.primary_risk ?? null,
    dimensions: [
      { name: "壁垒", value: score.business_moat_score },
      { name: "管理", value: score.management_score },
      { name: "治理", value: score.governance_score },
      { name: "战略", value: score.strategy_score },
      { name: "确定性", value: score.certainty_score },
      { name: "成长", value: score.growth_score }
    ]
  };
}

export function buildLatestRatingRadarOption(
  overview: LatestRatingOverview,
  mode: "light" | "dark"
): EChartsOption {
  const dark = mode === "dark";
  return {
    tooltip: { trigger: "item" },
    radar: {
      center: ["50%", "52%"],
      radius: "68%",
      splitNumber: 5,
      indicator: overview.dimensions.map((item) => ({ name: item.name, max: 10 })),
      axisName: { color: dark ? "#d5d9e0" : "#4b5563", fontSize: 12 },
      axisLine: { lineStyle: { color: dark ? "#3b4450" : "#d7dde7" } },
      splitLine: { lineStyle: { color: dark ? "#303946" : "#dfe4ec" } },
      splitArea: {
        areaStyle: {
          color: dark
            ? ["rgba(255,255,255,0.01)", "rgba(255,255,255,0.025)"]
            : ["rgba(37,99,235,0.01)", "rgba(37,99,235,0.035)"]
        }
      }
    },
    series: [
      {
        name: "最新评分",
        type: "radar",
        symbol: "circle",
        symbolSize: 5,
        lineStyle: { width: 2, color: "#4f7cff" },
        itemStyle: { color: "#4f7cff" },
        areaStyle: { color: "#4f7cff", opacity: 0.2 },
        data: [{ value: overview.dimensions.map((item) => item.value), name: "最新评分" }]
      }
    ]
  };
}
