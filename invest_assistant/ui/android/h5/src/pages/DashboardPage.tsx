import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { mobileApi } from "../api/mobileApi";
import { dashboardTabs } from "../app/navigation";
import { HorizontalTabPager, type HorizontalTabPagerHandle } from "../components/HorizontalTabPager";
import { MobilePageFrame } from "../components/MobilePageFrame";
import { SecondaryNavigation } from "../components/SecondaryNavigation";
import { EmptyState, ErrorState, ListRow, LoadingState, Metric, SectionCard } from "../components/Ui";
import { formatDateTime, formatMoney, formatNumber } from "../utils/format";

type DashboardTab = typeof dashboardTabs[number]["key"];
const MiniChart = lazy(() => import("../components/MiniChart").then((module) => ({ default: module.MiniChart })));
const DonutChart = lazy(() => import("../components/MiniChart").then((module) => ({ default: module.DonutChart })));

export function DashboardPage() {
  const [tab, setTab] = useState<DashboardTab>("today");
  const pager = useRef<HorizontalTabPagerHandle<DashboardTab>>(null);
  return (
    <MobilePageFrame navigation={<SecondaryNavigation items={dashboardTabs} activeKey={tab} onChange={(key) => pager.current?.requestChange(key)} />}>
      <HorizontalTabPager ref={pager} items={dashboardTabs} activeKey={tab} onChange={setTab} renderPage={(key) => {
        if (key === "today") return <TodayDashboard />;
        if (key === "market") return <MarketDashboard />;
        if (key === "track") return <TrackDashboard />;
        if (key === "stock") return <StockDashboard />;
        return <PortfolioDashboard />;
      }} />
    </MobilePageFrame>
  );
}

function TodayDashboard() {
  const navigate = useNavigate();
  const market = useQuery({ queryKey: ["workbench-today"], queryFn: mobileApi.workbenchToday, staleTime: 300_000 });
  const reports = useQuery({ queryKey: ["today-reports"], queryFn: () => mobileApi.reports(0, 4), staleTime: 300_000 });
  if (reports.isLoading) return <LoadingState />;
  const portfolio = market.data?.portfolio_today;
  return (
    <div className="page-stack">
      <section className="welcome-card">
        <span>投研工作台</span>
        <strong>{new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" }).format(new Date())}</strong>
        <p>重要信息、风险事件和研究记录集中在这里。</p>
      </section>
      <SectionCard title="今日大盘">
        {market.isLoading ? <LoadingState /> : market.isError ? <ErrorState message="大盘行情加载失败" onRetry={() => void market.refetch()} /> : market.data?.market_indices.items.length ? (
          <div className="market-index-grid">
            {market.data.market_indices.items.map((item) => {
              const failed = item.status === "failed" || item.price === null || item.price === undefined;
              const tone = failed ? "flat" : (item.pct_chg ?? 0) > 0 ? "up" : (item.pct_chg ?? 0) < 0 ? "down" : "flat";
              return <article className={`market-index-card market-index-card--${tone}`} key={item.code}><header><strong>{item.name}</strong><span>{item.code}</span></header><b>{failed ? "--" : formatNumber(item.price, 2)}</b><footer><span>{failed ? "行情不可用" : formatSigned(item.change)}</span><span>{failed ? "--" : formatSigned(item.pct_chg, "%")}</span></footer><time>{formatDateTime(item.quote_time ?? item.updated_at)}</time></article>;
            })}
          </div>
        ) : <EmptyState title="暂无大盘行情" detail="等待行情任务写入数据" />}
      </SectionCard>
      {portfolio ? (
        <SectionCard title="今日组合">
          <div className="today-portfolio-total">
            <span>总市值</span>
            <strong>{formatMoney(portfolio.total_value)}</strong>
          </div>
          <div className="today-portfolio-stats">
            <span>今日盈亏 <b className={portfolio.day_pnl >= 0 ? "positive" : "negative"}>{formatSignedMoney(portfolio.day_pnl)}</b></span>
            <span>今日涨跌幅 <b className={(portfolio.day_pct ?? 0) >= 0 ? "positive" : "negative"}>{formatSigned(portfolio.day_pct, "%")}</b></span>
            <span>{portfolio.portfolio_count} 个组合 · {portfolio.position_count} 个持仓</span>
            <time>报价 {formatDateTime(portfolio.latest_quote_time)}</time>
          </div>
        </SectionCard>
      ) : null}
      <SectionCard title="最新报告" action={<button className="text-button" onClick={() => navigate("/reports")}>全部</button>}>
        {reports.data?.items.map((item) => <ListRow key={item.id} title={item.title} meta={item.source_module} onClick={() => navigate(`/reports/${item.id}`)} />)}
      </SectionCard>
    </div>
  );
}

function MarketDashboard() {
  const overview = useQuery({ queryKey: ["market-overview"], queryFn: mobileApi.marketOverview, staleTime: 300_000 });
  const rankings = useQuery({ queryKey: ["market-rankings"], queryFn: mobileApi.marketRankings, staleTime: 300_000 });
  if (overview.isLoading || rankings.isLoading) return <LoadingState />;
  if (overview.isError || rankings.isError) return <ErrorState onRetry={() => { void overview.refetch(); void rankings.refetch(); }} />;
  return <div className="page-stack"><div className="metric-grid"><Metric label="信息总量" value={formatNumber(overview.data?.source_items)} /><Metric label="活跃标签" value={formatNumber(overview.data?.active_tags)} /></div><SectionCard title="市场热度排行">{rankings.data?.length ? rankings.data.slice(0, 10).map((item) => <ListRow key={item.tag_id} title={`${item.rank_no}. ${item.tag?.name ?? "未命名标签"}`} meta={`${item.trigger_count} 次触发 · ${item.source_count} 来源`} trailing={<strong className="score">{formatNumber(item.heat_score, 1)}</strong>} />) : <EmptyState title="暂无热度排行" detail="等待热度快照生成" />}</SectionCard></div>;
}

function TrackDashboard() {
  const query = useQuery({ queryKey: ["track-dashboard"], queryFn: mobileApi.trackDashboard, staleTime: 300_000 });
  if (query.isLoading) return <LoadingState />;
  if (query.isError) return <ErrorState onRetry={() => void query.refetch()} />;
  const data = query.data;
  return <div className="page-stack"><div className="metric-grid"><Metric label="升温赛道" value={data?.summary?.warming_tracks_count ?? 0} /><Metric label="重点赛道" value={data?.summary?.focus_tracks_count ?? 0} /></div><SectionCard title="赛道热度">{data?.heat_rankings?.slice(0, 10).map((item) => <ListRow key={item.track_id} title={`${item.rank}. ${item.track_name}`} meta={`今日 ${item.today_material_count} 条材料`} trailing={<strong className="score">{formatNumber(item.current_heat, 1)}</strong>} />)}</SectionCard><SectionCard title="最新材料">{data?.latest_materials?.slice(0, 5).map((item) => <ListRow key={item.id} title={item.material_title || "未命名材料"} meta={`${item.track_name ?? "赛道"} · ${formatDateTime(item.material_time)}`} />)}</SectionCard></div>;
}

function StockDashboard() {
  const query = useQuery({ queryKey: ["stock-dashboard"], queryFn: mobileApi.stockDashboard, staleTime: 300_000 });
  if (query.isLoading) return <LoadingState />;
  if (query.isError) return <ErrorState onRetry={() => void query.refetch()} />;
  return <div className="page-stack"><div className="metric-grid"><Metric label="标的池" value={query.data?.summary?.pool_count ?? 0} /><Metric label="重点标的" value={query.data?.summary?.focused_count ?? 0} /></div><SectionCard title="评分排行">{query.data?.score_rankings?.slice(0, 10).map((item) => <ListRow key={item.stock_id} title={`${item.rank}. ${item.stock_name ?? item.stock_code ?? "未命名标的"}`} meta={[item.stock_code, item.investment_level].filter(Boolean).join(" · ")} trailing={<strong className="score">{formatNumber(item.total_score, 1)}</strong>} />)}</SectionCard></div>;
}

function PortfolioDashboard() {
  const [portfolioId, setPortfolioId] = useState<number | null>(null);
  const overview = useQuery({ queryKey: ["portfolio-overview", portfolioId], queryFn: () => mobileApi.portfolioOverview(portfolioId), staleTime: 300_000 });
  const snapshots = useQuery({ queryKey: ["portfolio-snapshots", portfolioId], queryFn: () => mobileApi.portfolioSnapshots(portfolioId), staleTime: 300_000 });
  if (overview.isLoading || snapshots.isLoading) return <LoadingState />;
  if (overview.isError || snapshots.isError) return <ErrorState onRetry={() => { void overview.refetch(); void snapshots.refetch(); }} />;
  const summary = overview.data?.summary;
  const pieItems = overview.data?.pie_items ?? [];
  return (
    <div className="page-stack portfolio-dashboard-mobile">
      <SectionCard>
        <label className="portfolio-selector">组合范围
          <select value={portfolioId ?? ""} onChange={(event) => setPortfolioId(event.target.value ? Number(event.target.value) : null)}>
            <option value="">所有组合</option>
            {overview.data?.portfolio_options?.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
          </select>
        </label>
      </SectionCard>
      <div className="metric-grid">
        <Metric label="总市值" value={formatMoney(summary?.total_value)} />
        <Metric label="持仓市值" value={formatMoney(summary?.position_market_value)} />
        <Metric label="现金余额" value={formatMoney(summary?.cash_amount)} />
        <Metric label="年度盈亏" value={formatMoney(summary?.year_pnl)} tone={(summary?.year_pnl ?? 0) >= 0 ? "up" : "down"} />
      </div>
      <SectionCard title="今日表现">
        <div className="portfolio-day-row">
          <span className={(summary?.day_pnl ?? 0) >= 0 ? "positive" : "negative"}>{formatSignedMoney(summary?.day_pnl)}</span>
          <span className={(summary?.day_pct ?? 0) >= 0 ? "positive" : "negative"}>{formatSigned(summary?.day_pct, "%")}</span>
        </div>
      </SectionCard>
      {pieItems.length ? (
        <SectionCard title="标的市值占比">
          <Suspense fallback={<LoadingState />}>
            <DonutChart items={pieItems.map((item) => ({ name: item.label, value: item.market_value }))} />
          </Suspense>
        </SectionCard>
      ) : <EmptyState title="暂无持仓标的数据" />}
      {snapshots.data?.length ? (
        <SectionCard title="组合市值曲线">
          <Suspense fallback={<LoadingState />}>
            <MiniChart labels={snapshots.data.map((item) => item.snapshot_date)} values={snapshots.data.map((item) => item.total_value)} />
          </Suspense>
        </SectionCard>
      ) : <EmptyState title="暂无市值快照" detail="每日快照生成后将在这里显示" />}
    </div>
  );
}

function formatSigned(value?: number | null, suffix = "") {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "--";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${formatNumber(value, 2)}${suffix}`;
}

function formatSignedMoney(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "--";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${formatMoney(value)}`;
}
