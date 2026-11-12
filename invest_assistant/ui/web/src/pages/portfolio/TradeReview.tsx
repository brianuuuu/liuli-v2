import { ReloadOutlined } from "@ant-design/icons";
import { Alert, Button, Select, Space, Tooltip } from "antd";
import { useCallback, useState } from "react";
import { getAdjustAdviceReviews, getPositionChangeReview } from "../../api/portfolio";
import { CountLabel } from "../../components/common/CountLabel";
import { useAsyncData } from "../../hooks/useAsyncData";
import type { AdjustAdviceReviews, PositionChangeReview as PositionChangeReviewData } from "../../types/api";
import {
  AdviceReportList,
  MarketReviewTable,
  adviceKpis,
  initialAdviceReviews,
  marketReviewHint,
  riskStatsHint,
  signalStatsHint
} from "./AdjustAdviceReview";
import { AdviceStatsReview } from "./AdviceStatsReview";
import { HintTitle } from "./HintTitle";
import { PortfolioScopeBar } from "./PortfolioScopeBar";
import { PositionChangeTable, initialPositionChangeReview, positionChangeHint, sourceWinRate } from "./PositionChangeReview";
import { PositionChangeDateFilter } from "./PositionChangeDateFilter";
import { buildPositionChangeReviewRange, positionChangeReviewRangeParams } from "./positionChangeReviewRange";

type StatsView = "changes" | "signals" | "risks" | "market";

const initialReviewSnapshot = { scopeKey: "", changes: initialPositionChangeReview, advice: initialAdviceReviews };

type TradeReviewProps = {
  portfolioId: number | null;
  portfolioOptions: { value: number; label: string }[];
  onPortfolioChange: (portfolioId: number | null) => void;
};

/** 没有样本时写 NA，不用一排横线让人误以为出错；下方小字只放数字（样本数或比值） */
function Kpi({ label, value, note, hint }: { label: string; value: string | number | null; note: string | number; hint?: string }) {
  return (
    <div className="review-kpi">
      <div className="review-kpi-label">{hint ? <Tooltip title={hint}>{label}</Tooltip> : label}</div>
      {value === null ? <div className="review-kpi-value is-pending">NA</div> : <div className="review-kpi-value">{value}</div>}
      <div className="review-kpi-note">{note}</div>
    </div>
  );
}

/**
 * 调仓复盘：组合、研究员和日期共同筛选明细及汇总。
 * 指标（实际调仓 / AI 建议两组）→ 统计表（分段切换）→ 微操报告明细，由浅到深。
 */
export function TradeReview({ portfolioId, portfolioOptions, onPortfolioChange }: TradeReviewProps) {
  const [dateRange, setDateRange] = useState(() => buildPositionChangeReviewRange());
  const [researcherCode, setResearcherCode] = useState<string | undefined>();
  const { start_date: startDate, end_date: endDate } = positionChangeReviewRangeParams(dateRange);
  const changeReviewKey = `${portfolioId ?? "all"}:${researcherCode ?? "all"}:${startDate}:${endDate}`;
  const snapshot = useAsyncData<{ scopeKey: string; changes: PositionChangeReviewData; advice: AdjustAdviceReviews }>(
    useCallback(async () => {
      const filters = { start_date: startDate, end_date: endDate, researcher_code: researcherCode };
      const [changes, advice] = await Promise.all([
        getPositionChangeReview(portfolioId, filters), getAdjustAdviceReviews(portfolioId, 200, filters)
      ]);
      return { scopeKey: changeReviewKey, changes, advice };
    }, [portfolioId, startDate, endDate, researcherCode, changeReviewKey]), initialReviewSnapshot
  );
  // 两个请求完成后一起发布，切换范围或失败时不显示旧合计。
  const current = snapshot.data.scopeKey === changeReviewKey && !snapshot.error;
  const changeReviewData = current ? snapshot.data.changes : initialPositionChangeReview;
  const adviceData = current ? snapshot.data.advice : initialAdviceReviews;
  const aiRate = sourceWinRate(changeReviewData.rows, "ai_advice");
  const personalRate = sourceWinRate(changeReviewData.rows, "personal");
  const kpis = adviceKpis(adviceData);
  const [statsView, setStatsView] = useState<StatsView>("changes");
  // 分段上的数字：调仓来源为调仓笔数，另两段为已评估样本数，切换前就知道有没有数据
  const changeCount = changeReviewData.rows.reduce((sum, row) => sum + row.change_count, 0);
  const signalSamples = adviceData.signal_stats.by_signal.reduce((sum, row) => sum + row.samples, 0);
  const statsViews: { value: StatsView; label: string; count: number }[] = [
    { value: "changes", label: "调仓来源", count: changeCount },
    { value: "signals", label: "AI建议", count: signalSamples },
    { value: "risks", label: "AI警示", count: kpis.risk.samples },
    { value: "market", label: "AI大盘判断", count: adviceData.market_review.rows.length }
  ];
  const coverageHint = adviceData.reports.length < adviceData.summary.report_count
    ? `统计含 ${adviceData.summary.report_count} 份报告，明细仅展示最近 ${adviceData.reports.length} 份。`
    : "";
  const statsHint = statsView === "changes" ? positionChangeHint : statsView === "signals" ? signalStatsHint + coverageHint : statsView === "risks" ? riskStatsHint + coverageHint : marketReviewHint;

  return (
    <div className="portfolio-dashboard trade-review">
      <PortfolioScopeBar
        value={portfolioId}
        options={portfolioOptions}
        onChange={onPortfolioChange}
        extra={(
          <Space wrap>
            <Select
              size="small" allowClear showSearch optionFilterProp="label" aria-label="研究员筛选"
              placeholder="全部研究员" value={researcherCode} onChange={setResearcherCode} style={{ minWidth: 180 }}
              options={(snapshot.data.advice.researcher_options ?? []).map((item) => ({ value: item.researcher_code, label: item.display_name }))}
            />
            <PositionChangeDateFilter value={dateRange} onChange={setDateRange} />
            <Tooltip title="刷新复盘">
              <Button
                size="small"
                type="text"
                aria-label="刷新复盘"
                icon={<ReloadOutlined />}
                loading={snapshot.loading}
                onClick={() => {
                  void snapshot.refresh();
                }}
              />
            </Tooltip>
          </Space>
        )}
      />
      {snapshot.error ? <Alert type="error" showIcon title="复盘加载失败" action={<Button size="small" onClick={() => void snapshot.refresh()} loading={snapshot.loading}>重试</Button>} /> : null}
      <div className="review-kpi-strip">
        <section className="review-kpi-group review-kpi-group--changes">
          {/* 组名放左侧竖列，每个指标只剩名称、数值、样本三行 */}
          <header>实际调仓</header>
          <div className="review-kpi-row">
            <Kpi label="AI 建议" value={aiRate.rate} note={aiRate.samples} hint="所选日期范围内，AI 建议来源调仓的 20 日胜率" />
            <Kpi label="个人判断" value={personalRate.rate} note={personalRate.samples} hint="所选日期范围内，个人判断来源调仓的 20 日胜率" />
          </div>
        </section>
        <section className="review-kpi-group review-kpi-group--advice">
          <header>AI 建议</header>
          <div className="review-kpi-row">
            <Kpi label="增持胜率" value={kpis.addRate.rate} note={kpis.addRate.samples} />
            <Kpi label="减持胜率" value={kpis.reduceRate.rate} note={kpis.reduceRate.samples} />
            <Kpi label="明确采纳率" value={kpis.executed.rate} note={kpis.executed.note} hint="已到适用日或已关联的建议中，明确关联实际调仓的比例" />
            <Kpi label="警示命中率" value={kpis.risk.rate} note={kpis.risk.samples} />
            <Kpi label="仓位方向" value={kpis.market.rate} note={kpis.market.samples} hint="整体仓位净增持 / 净减持方向按沪深300 20 日收益判定的胜率" />
            <Kpi label="待评估" value={kpis.pending.count} note={`${kpis.pending.count} / ${kpis.pending.total}`} />
          </div>
        </section>
      </div>
      {/* 三张统计表维度不同，不需要并排对照：切换按钮作为表格框的顶栏，和表格是一个整体；
          页首的组合切换条管整页，这里只管下面这张表，两者层级不同、外观也区分开 */}
      <section className="tabbed-table-panel">
        <div className="data-panel-toolbar tabbed-table-toolbar">
          <Space size={4} className="toolbar-status-buttons">
            {statsViews.map((item) => (
              <Button
                key={item.value}
                size="small"
                className={statsView === item.value ? "toolbar-filter-button active" : "toolbar-filter-button"}
                onClick={() => setStatsView(item.value)}
              >
                <CountLabel label={item.label} count={item.count} />
              </Button>
            ))}
          </Space>
          <Space size={8} className="tabbed-table-actions">
            <HintTitle title={null} hint={statsHint} />
          </Space>
        </div>
        {statsView === "changes" ? <PositionChangeTable key={changeReviewKey} data={changeReviewData} loading={snapshot.loading} /> : null}
        {statsView === "signals" || statsView === "risks" ? (
          <AdviceStatsReview key={`${changeReviewKey}:${statsView}`} kind={statsView === "signals" ? "signal" : "risk"} data={adviceData} loading={snapshot.loading} />
        ) : null}
        {statsView === "market" ? <MarketReviewTable data={adviceData} /> : null}
      </section>
      <AdviceReportList key={changeReviewKey} data={adviceData} loading={snapshot.loading} />
    </div>
  );
}
