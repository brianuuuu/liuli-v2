import { Button, Select } from "antd";
import { useCallback } from "react";
import { getAdjustAdviceReviews, getPositionChangeReview } from "../../api/portfolio";
import { useAsyncData } from "../../hooks/useAsyncData";
import type { AdjustAdviceReviews, PositionChangeReview as PositionChangeReviewData } from "../../types/api";
import { AdviceReportList, AdviceStatsPending, RiskStatsCard, SignalStatsCard, adviceKpis, initialAdviceReviews } from "./AdjustAdviceReview";
import { PositionChangeReview, initialPositionChangeReview, sourceWinRate } from "./PositionChangeReview";

type TradeReviewProps = {
  portfolioId: number | null;
  portfolioOptions: { value: number; label: string }[];
  portfoliosLoading: boolean;
  onPortfolioChange: (portfolioId: number | null) => void;
};

/** 没有样本时写"待积累"，不用一排横线让人误以为出错 */
function Kpi({ label, value, note }: { label: string; value: string | number | null; note: string }) {
  return (
    <div className="review-kpi">
      <div className="review-kpi-label">{label}</div>
      {value === null ? <div className="review-kpi-value is-pending">待积累</div> : <div className="review-kpi-value">{value}</div>}
      <div className="review-kpi-note">{note}</div>
    </div>
  );
}

/**
 * 调仓复盘：看每次调仓和 AI 建议的事后效果，与收益周期无关，只按组合筛选。
 * 指标（实际调仓 / AI 建议两组）→ 统计表 → 微操报告明细，由浅到深。
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
  const statsPending = !advice.data.signal_stats.by_signal.length && !advice.data.risk_stats.length;

  return (
    <div className="portfolio-dashboard trade-review">
      <div className="review-toolbar">
        <Select
          style={{ width: 240 }}
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
      </div>
      <div className="review-kpi-strip">
        <section className="review-kpi-group review-kpi-group--changes">
          <header>实际调仓 · 20 日胜率</header>
          <div className="review-kpi-row">
            <Kpi label="AI 建议" value={aiRate.rate} note={`样本 ${aiRate.samples}`} />
            <Kpi label="个人判断" value={personalRate.rate} note={`样本 ${personalRate.samples}`} />
          </div>
        </section>
        <section className="review-kpi-group review-kpi-group--advice">
          <header>AI 建议</header>
          <div className="review-kpi-row">
            <Kpi label="增持胜率" value={kpis.addRate.rate} note={`样本 ${kpis.addRate.samples}`} />
            <Kpi label="减持胜率" value={kpis.reduceRate.rate} note={`样本 ${kpis.reduceRate.samples}`} />
            <Kpi label="执行率" value={kpis.executed.rate} note={kpis.executed.note} />
            <Kpi label="警示命中率" value={kpis.risk.rate} note={`样本 ${kpis.risk.samples}`} />
            <Kpi label="待评估" value={kpis.pending.count} note={`共 ${kpis.pending.total} 条建议`} />
          </div>
        </section>
      </div>
      <div className={statsPending ? "trade-review-grid trade-review-grid--pending" : "trade-review-grid"}>
        <PositionChangeReview data={changes.data} loading={changes.loading} />
        {statsPending ? (
          <AdviceStatsPending data={advice.data} />
        ) : (
          <>
            <SignalStatsCard data={advice.data} />
            <RiskStatsCard data={advice.data} />
          </>
        )}
      </div>
      <AdviceReportList data={advice.data} loading={advice.loading} />
    </div>
  );
}
