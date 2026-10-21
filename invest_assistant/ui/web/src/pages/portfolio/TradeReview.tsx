import { Button, Select, Space } from "antd";
import { useCallback } from "react";
import { getAdjustAdviceReviews, getPositionChangeReview } from "../../api/portfolio";
import { WorkbenchCard } from "../../components/common/WorkbenchCard";
import { useAsyncData } from "../../hooks/useAsyncData";
import type { AdjustAdviceReviews, PositionChangeReview as PositionChangeReviewData } from "../../types/api";
import { AdviceReportList, RiskStatsCard, SignalStatsCard, adviceKpis, initialAdviceReviews } from "./AdjustAdviceReview";
import { PositionChangeReview, initialPositionChangeReview, sourceWinRate } from "./PositionChangeReview";

type TradeReviewProps = {
  portfolioId: number | null;
  portfolioOptions: { value: number; label: string }[];
  portfoliosLoading: boolean;
  onPortfolioChange: (portfolioId: number | null) => void;
};

function Kpi({ label, value, note }: { label: string; value: string | number; note: string }) {
  return (
    <div className="review-kpi">
      <div className="review-kpi-label">{label}</div>
      <div className="review-kpi-value">{value}</div>
      <div className="review-kpi-note">{note}</div>
    </div>
  );
}

/**
 * 调仓复盘：看每次调仓和 AI 建议的事后效果，与收益周期无关，只按组合筛选。
 * 指标条 → 三张统计表 → 微操报告明细，由浅到深。
 */
export function TradeReview({ portfolioId, portfolioOptions, portfoliosLoading, onPortfolioChange }: TradeReviewProps) {
  const changes = useAsyncData<PositionChangeReviewData>(
    useCallback(() => getPositionChangeReview(portfolioId), [portfolioId]),
    initialPositionChangeReview
  );
  const advice = useAsyncData<AdjustAdviceReviews>(
    useCallback(() => getAdjustAdviceReviews(portfolioId, 30), [portfolioId]),
    initialAdviceReviews
  );
  const aiRate = sourceWinRate(changes.data.rows, "ai_advice");
  const personalRate = sourceWinRate(changes.data.rows, "personal");
  const kpis = adviceKpis(advice.data);

  return (
    <div className="portfolio-dashboard">
      <WorkbenchCard>
        <Space wrap>
          <Select
            style={{ width: 260 }}
            value={portfolioId ?? 0}
            loading={portfoliosLoading}
            options={[{ value: 0, label: "所有组合" }, ...portfolioOptions]}
            onChange={(value) => onPortfolioChange(value === 0 ? null : value)}
          />
          <Button
            loading={changes.loading || advice.loading}
            onClick={() => {
              void changes.refresh();
              void advice.refresh();
            }}
          >
            刷新复盘
          </Button>
        </Space>
      </WorkbenchCard>
      <div className="review-kpi-strip">
        <Kpi label="AI建议 20日胜率" value={aiRate.text} note={`调仓样本 ${aiRate.samples}`} />
        <Kpi label="个人判断 20日胜率" value={personalRate.text} note={`调仓样本 ${personalRate.samples}`} />
        <Kpi label="增持建议胜率" value={kpis.addRate.text} note={`建议样本 ${kpis.addRate.samples}`} />
        <Kpi label="减持建议胜率" value={kpis.reduceRate.text} note={`建议样本 ${kpis.reduceRate.samples}`} />
        <Kpi label="建议执行率" value={kpis.executed.text} note={kpis.executed.note} />
        <Kpi label="警示命中率" value={kpis.risk.text} note={`警示样本 ${kpis.risk.samples}`} />
        <Kpi label="待评估建议" value={kpis.pending.count} note={`共 ${kpis.pending.total} 条调仓建议`} />
      </div>
      <div className="trade-review-grid">
        <PositionChangeReview data={changes.data} loading={changes.loading} />
        <SignalStatsCard data={advice.data} />
        <RiskStatsCard data={advice.data} />
      </div>
      <AdviceReportList data={advice.data} loading={advice.loading} />
    </div>
  );
}
