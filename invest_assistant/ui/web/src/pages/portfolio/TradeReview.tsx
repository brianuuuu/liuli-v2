import { ReloadOutlined } from "@ant-design/icons";
import { Alert, Button, Space, Tooltip } from "antd";
import { useCallback, useState } from "react";
import { getAdjustAdviceReviews, getPositionChangeReview } from "../../api/portfolio";
import { CountLabel } from "../../components/common/CountLabel";
import { useAsyncData } from "../../hooks/useAsyncData";
import type { AdjustAdviceReviews, PositionChangeReview as PositionChangeReviewData } from "../../types/api";
import {
  AdviceReportList,
  MarketReviewTable,
  RiskStatsTable,
  SignalStatsTable,
  adviceKpis,
  initialAdviceReviews,
  marketReviewHint,
  riskStatsHint,
  signalStatsHint
} from "./AdjustAdviceReview";
import { HintTitle } from "./HintTitle";
import { PortfolioScopeBar } from "./PortfolioScopeBar";
import { PositionChangeTable, initialPositionChangeReview, positionChangeHint, sourceWinRate } from "./PositionChangeReview";
import { PositionChangeDateFilter } from "./PositionChangeDateFilter";
import { buildPositionChangeReviewRange, positionChangeReviewRangeParams } from "./positionChangeReviewRange";

type StatsView = "changes" | "signals" | "risks" | "market";

const initialChangeReviewSnapshot = { scopeKey: "", review: initialPositionChangeReview };

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
 * 调仓复盘：实际调仓按组合、调仓发生日期筛选，AI 建议保留独立统计范围。
 * 指标（实际调仓 / AI 建议两组）→ 统计表（分段切换）→ 微操报告明细，由浅到深。
 */
export function TradeReview({ portfolioId, portfolioOptions, onPortfolioChange }: TradeReviewProps) {
  const [dateRange, setDateRange] = useState(() => buildPositionChangeReviewRange());
  const { start_date: startDate, end_date: endDate } = positionChangeReviewRangeParams(dateRange);
  const changeReviewKey = `${portfolioId ?? "all"}:${startDate}:${endDate}`;
  const changes = useAsyncData<{ scopeKey: string; review: PositionChangeReviewData }>(
    useCallback(async () => ({
      scopeKey: changeReviewKey,
      review: await getPositionChangeReview(portfolioId, { start_date: startDate, end_date: endDate })
    }), [portfolioId, startDate, endDate, changeReviewKey]),
    initialChangeReviewSnapshot
  );
  // 新范围加载或失败时隐藏旧结果，不能把旧合计显示在新日期下。
  const changeReviewData = changes.data.scopeKey === changeReviewKey ? changes.data.review : initialPositionChangeReview;
  const advice = useAsyncData<AdjustAdviceReviews>(
    useCallback(() => getAdjustAdviceReviews(portfolioId, 30), [portfolioId]),
    initialAdviceReviews
  );
  const aiRate = sourceWinRate(changeReviewData.rows, "ai_advice");
  const personalRate = sourceWinRate(changeReviewData.rows, "personal");
  const kpis = adviceKpis(advice.data);
  const [statsView, setStatsView] = useState<StatsView>("changes");
  // 分段上的数字：调仓来源为调仓笔数，另两段为已评估样本数，切换前就知道有没有数据
  const changeCount = changeReviewData.rows.reduce((sum, row) => sum + row.change_count, 0);
  const signalSamples = advice.data.signal_stats.by_signal.reduce((sum, row) => sum + row.samples, 0);
  const statsViews: { value: StatsView; label: string; count: number }[] = [
    { value: "changes", label: "调仓来源", count: changeCount },
    { value: "signals", label: "信号表现", count: signalSamples },
    { value: "risks", label: "风险警示", count: kpis.risk.samples },
    { value: "market", label: "大盘判断", count: advice.data.market_review.rows.length }
  ];
  const statsHint = statsView === "changes" ? positionChangeHint(changeReviewData.rules) : statsView === "signals" ? signalStatsHint : statsView === "risks" ? riskStatsHint : marketReviewHint;

  return (
    <div className="portfolio-dashboard trade-review">
      <PortfolioScopeBar
        value={portfolioId}
        options={portfolioOptions}
        onChange={onPortfolioChange}
        extra={(
          <Tooltip title="刷新复盘">
            <Button
              size="small"
              type="text"
              aria-label="刷新复盘"
              icon={<ReloadOutlined />}
              loading={changes.loading || advice.loading}
              onClick={() => {
                void changes.refresh();
                void advice.refresh();
              }}
            />
          </Tooltip>
        )}
      />
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
            <Kpi label="执行率" value={kpis.executed.rate} note={kpis.executed.note} />
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
            {statsView === "changes" ? <PositionChangeDateFilter value={dateRange} onChange={setDateRange} /> : null}
            <HintTitle title={null} hint={statsHint} />
          </Space>
        </div>
        {statsView === "changes" && changes.error ? (
          <Alert
            className="position-change-review-error"
            type="error"
            showIcon
            title="调仓记录加载失败，请重试"
            action={<Button size="small" onClick={() => void changes.refresh()} loading={changes.loading}>重试</Button>}
          />
        ) : null}
        {statsView === "changes" ? <PositionChangeTable key={changeReviewKey} data={changeReviewData} loading={changes.loading} /> : null}
        {statsView === "signals" ? <SignalStatsTable data={advice.data} /> : null}
        {statsView === "risks" ? <RiskStatsTable data={advice.data} /> : null}
        {statsView === "market" ? <MarketReviewTable data={advice.data} /> : null}
      </section>
      <AdviceReportList data={advice.data} loading={advice.loading} />
    </div>
  );
}
