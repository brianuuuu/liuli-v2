import { useQuery, useQueries } from "@tanstack/react-query";
import { lazy, Suspense, useState } from "react";
import { useNavigate } from "react-router-dom";
import { mobileApi } from "../api/mobileApi";
import { dashboardTabs } from "../app/navigation";
import { useSwipeTabs } from "../app/swipe";
import { MobilePageFrame } from "../components/MobilePageFrame";
import { SecondaryNavigation } from "../components/SecondaryNavigation";
import { EmptyState, ErrorState, ListRow, LoadingState, Metric, SectionCard } from "../components/Ui";
import { formatDateTime, formatMoney, formatNumber } from "../utils/format";

type DashboardTab = typeof dashboardTabs[number]["key"];
const MiniChart = lazy(() => import("../components/MiniChart").then((module) => ({ default: module.MiniChart })));

export function DashboardPage() {
  const [tab, setTab] = useState<DashboardTab>("today");
  const swipe = useSwipeTabs(dashboardTabs, tab, setTab);
  return (
    <MobilePageFrame navigation={<SecondaryNavigation items={dashboardTabs} activeKey={tab} onChange={setTab} />}>
      <div {...swipe}>
        {tab === "today" ? <TodayDashboard /> : null}
        {tab === "market" ? <MarketDashboard /> : null}
        {tab === "track" ? <TrackDashboard /> : null}
        {tab === "stock" ? <StockDashboard /> : null}
        {tab === "portfolio" ? <PortfolioDashboard /> : null}
      </div>
    </MobilePageFrame>
  );
}

function TodayDashboard() {
  const navigate = useNavigate();
  const results = useQueries({
    queries: [
      { queryKey: ["today-news"], queryFn: () => mobileApi.news({ limit: 4, offset: 0, important_only: true }), staleTime: 300_000 },
      { queryKey: ["today-alerts"], queryFn: () => mobileApi.alerts(0, 4), staleTime: 300_000 },
      { queryKey: ["today-reports"], queryFn: () => mobileApi.reports(0, 4), staleTime: 300_000 },
      { queryKey: ["today-notes"], queryFn: () => mobileApi.notes({ limit: 3, offset: 0, status: "active" }), staleTime: 300_000 }
    ]
  });
  if (results.some((result) => result.isLoading)) return <LoadingState />;
  const [news, alerts, reports, notes] = results.map((result) => result.data);
  return (
    <div className="page-stack">
      <section className="welcome-card">
        <span>今日投资工作台</span>
        <strong>{new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" }).format(new Date())}</strong>
        <p>重要信息、风险事件和研究记录集中在这里。</p>
      </section>
      <div className="metric-grid">
        <Metric label="重要新闻" value={(news as Awaited<ReturnType<typeof mobileApi.news>> | undefined)?.total ?? 0} />
        <Metric label="未读预警" value={(alerts as Awaited<ReturnType<typeof mobileApi.alerts>> | undefined)?.items.filter((item) => item.status === "unread").length ?? 0} />
      </div>
      <SectionCard title="重要新闻">
        {(news as Awaited<ReturnType<typeof mobileApi.news>> | undefined)?.items.map((item) => <ListRow key={item.id} title={item.title} meta={`${item.source_name} · ${formatDateTime(item.publish_time)}`} onClick={() => navigate(`/news/${item.id}`)} />)}
      </SectionCard>
      <SectionCard title="最新报告" action={<button className="text-button" onClick={() => navigate("/reports")}>全部</button>}>
        {(reports as Awaited<ReturnType<typeof mobileApi.reports>> | undefined)?.items.map((item) => <ListRow key={item.id} title={item.title} meta={item.source_module} onClick={() => navigate(`/reports/${item.id}`)} />)}
      </SectionCard>
      <SectionCard title="最近笔记">
        {(notes as Awaited<ReturnType<typeof mobileApi.notes>> | undefined)?.items.map((item) => <ListRow key={item.id} title={item.content} meta={formatDateTime(item.updated_at ?? item.created_at)} onClick={() => navigate(`/notes/${item.id}`)} />)}
      </SectionCard>
    </div>
  );
}

function MarketDashboard() {
  const overview = useQuery({ queryKey: ["market-overview"], queryFn: mobileApi.marketOverview, staleTime: 300_000 });
  const rankings = useQuery({ queryKey: ["market-rankings"], queryFn: mobileApi.marketRankings, staleTime: 300_000 });
  if (overview.isLoading || rankings.isLoading) return <LoadingState />;
  if (overview.isError || rankings.isError) return <ErrorState onRetry={() => { void overview.refetch(); void rankings.refetch(); }} />;
  return <div className="page-stack"><div className="metric-grid"><Metric label="信息总量" value={formatNumber(overview.data?.source_items)} /><Metric label="活跃标签" value={formatNumber(overview.data?.active_tags)} /></div><SectionCard title="市场热度排行">{rankings.data?.slice(0, 10).map((item) => <ListRow key={item.tag_id} title={`${item.rank_no}. ${item.tag?.name ?? "未命名标签"}`} meta={`${item.trigger_count} 次触发 · ${item.source_count} 来源`} trailing={<strong className="score">{formatNumber(item.heat_score, 1)}</strong>} />)}</SectionCard></div>;
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
  const overview = useQuery({ queryKey: ["portfolio-overview"], queryFn: mobileApi.portfolioOverview, staleTime: 300_000 });
  const snapshots = useQuery({ queryKey: ["portfolio-snapshots"], queryFn: mobileApi.portfolioSnapshots, staleTime: 300_000 });
  if (overview.isLoading || snapshots.isLoading) return <LoadingState />;
  if (overview.isError || snapshots.isError) return <ErrorState onRetry={() => { void overview.refetch(); void snapshots.refetch(); }} />;
  const summary = overview.data?.summary;
  return <div className="page-stack"><SectionCard className="portfolio-total"><span className="eyebrow">组合总资产</span><strong className="hero-number">{formatMoney(summary?.total_value)}</strong><span className={(summary?.day_pnl ?? 0) >= 0 ? "positive" : "negative"}>今日 {formatMoney(summary?.day_pnl)} · {formatNumber((summary?.day_pct ?? 0) * 100, 2)}%</span></SectionCard><div className="metric-grid"><Metric label="持仓市值" value={formatMoney(summary?.position_market_value)} /><Metric label="现金" value={formatMoney(summary?.cash_amount)} /></div>{snapshots.data?.length ? <SectionCard title="资产趋势"><Suspense fallback={<LoadingState />}><MiniChart labels={snapshots.data.map((item) => item.snapshot_date)} values={snapshots.data.map((item) => item.total_value)} /></Suspense></SectionCard> : <EmptyState title="暂无资产快照" />}</div>;
}
