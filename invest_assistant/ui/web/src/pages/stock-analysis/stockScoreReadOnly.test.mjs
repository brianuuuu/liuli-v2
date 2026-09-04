import { readFileSync } from "node:fs";

const page = readFileSync("invest_assistant/ui/web/src/pages/stock-analysis/StockDetailPage.tsx", "utf8");

for (const manualScoreEntry of ["createStockScore", "scoreOpen", "scoreForm", "submitScore", "新增评分", "评分记录"]) {
  if (page.includes(manualScoreEntry)) {
    throw new Error(`Stock detail scores must be read-only; found manual entry: ${manualScoreEntry}`);
  }
}

if (!page.includes("评分趋势") || !page.includes("data.score_history")) {
  throw new Error("Stock detail should retain the imported score trend and history table");
}
