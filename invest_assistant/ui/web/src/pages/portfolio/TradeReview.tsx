import { Button, Select, Space, Switch, Typography } from "antd";
import { useCallback, useState } from "react";
import { getAdjustAdviceReviews, getPositionChangeReview } from "../../api/portfolio";
import { DataPanel } from "../../components/common/DataPanel";
import { useAsyncData } from "../../hooks/useAsyncData";
import type { AdjustAdviceReviews, PositionChangeReview as PositionChangeReviewData } from "../../types/api";
import {
  AdviceReportList,
  RiskStatsTable,
  SignalStatsTable,
  adviceKpis,
  initialAdviceReviews,
  riskStatsHint,
  signalStatsHint
} from "./AdjustAdviceReview";
import { HintTitle } from "./HintTitle";
import { PositionChangeTable, initialPositionChangeReview, positionChangeHint, sourceWinRate } from "./PositionChangeReview";

type StatsView = "changes" | "signals" | "risks";

type TradeReviewProps = {
  portfolioId: number | null;
  portfolioOptions: { value: number; label: string }[];
  portfoliosLoading: boolean;
  onPortfolioChange: (portfolioId: number | null) => void;
};

/** 没有样本时写 NA，不用一排横线让人误以为出错；下方小字只放数字（样本数或比值） */
function Kpi({ label, value, note }: { label: string; value: string | number | null; note: string | number }) {
  return (
    <div className="review-kpi">
      <div className="review-kpi-label">{label}</div>
      {value === null ? <div className="review-kpi-value is-pending">NA</div> : <div className="review-kpi-value">{value}</div>}
      <div className="review-kpi-note">{note}</div>
    </div>
  );
}

/**
 * 调仓复盘：看每次调仓和 AI 建议的事后效果，与收益周期无关，只按组合筛选。
 * 指标（实际调仓 / AI 建议两组）→ 统计表（分段切换）→ 微操报告明细，由浅到深。
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
  const [statsView, setStatsView] = useState<StatsView>("changes");
  const [showQuiet, setShowQuiet] = useState(false);
  // 分段上的数字：调仓来源为调仓笔数，另两段为已评估样本数，切换前就知道有没有数据
  const changeCount = changes.data.rows.reduce((sum, row) => sum + row.change_count, 0);
  const signalSamples = advice.data.signal_stats.by_signal.reduce((sum, row) => sum + row.samples, 0);
  const statsViews: { value: StatsView; label: string; count: number }[] = [
    { value: "changes", label: "调仓来源", count: changeCount },
    { value: "signals", label: "信号表现", count: signalSamples },
    { value: "risks", label: "风险警示", count: kpis.risk.samples }
  ];
  const statsHint = statsView === "changes" ? positionChangeHint(changes.data.rules) : statsView === "signals" ? signalStatsHint : riskStatsHint;

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
        {/* 只作用于微操报告的展开明细；报告卡去掉标题栏后开关放在页首 */}
        <Space size={6} className="review-toolbar-end">
          <Typography.Text type="secondary">微操明细显示维持和等待</Typography.Text>
          <Switch size="small" checked={showQuiet} onChange={setShowQuiet} />
        </Space>
      </div>
      <div className="review-kpi-strip">
        <section className="review-kpi-group review-kpi-group--changes">
          {/* 组名放左侧竖列，每个指标只剩名称、数值、样本三行 */}
          <header>实际调仓<br />20 日胜率</header>
          <div className="review-kpi-row">
            <Kpi label="AI 建议" value={aiRate.rate} note={aiRate.samples} />
            <Kpi label="个人判断" value={personalRate.rate} note={personalRate.samples} />
          </div>
        </section>
        <section className="review-kpi-group review-kpi-group--advice">
          <header>AI 建议</header>
          <div className="review-kpi-row">
            <Kpi label="增持胜率" value={kpis.addRate.rate} note={kpis.addRate.samples} />
            <Kpi label="减持胜率" value={kpis.reduceRate.rate} note={kpis.reduceRate.samples} />
            <Kpi label="执行率" value={kpis.executed.rate} note={kpis.executed.note} />
            <Kpi label="警示命中率" value={kpis.risk.rate} note={kpis.risk.samples} />
            <Kpi label="待评估" value={kpis.pending.count} note={`${kpis.pending.count} / ${kpis.pending.total}`} />
          </div>
        </section>
      </div>
      {/* 三张统计表维度不同（来源 / 主信号 / 风险代码），不需要并排对照：合成一个面板，工具栏按钮切换，样式与标的池一致 */}
      <DataPanel
        toolbar={
          <>
            <Space size={4} className="toolbar-status-buttons">
              {statsViews.map((item) => (
                <Button
                  key={item.value}
                  size="small"
                  className={statsView === item.value ? "toolbar-filter-button active" : "toolbar-filter-button"}
                  onClick={() => setStatsView(item.value)}
                >
                  {item.label} ({item.count})
                </Button>
              ))}
            </Space>
            <HintTitle title={null} hint={statsHint} />
          </>
        }
      >
        {statsView === "changes" ? <PositionChangeTable data={changes.data} loading={changes.loading} /> : null}
        {statsView === "signals" ? <SignalStatsTable data={advice.data} /> : null}
        {statsView === "risks" ? <RiskStatsTable data={advice.data} /> : null}
      </DataPanel>
      <AdviceReportList data={advice.data} loading={advice.loading} showQuiet={showQuiet} />
    </div>
  );
}
