import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { mobileApi, type MarketRankingType, type MarketRankingWindow } from "../api/mobileApi";
import { dashboardTabs } from "../app/navigation";
import { DashboardMaterialFeed, type DashboardMaterialItem } from "../components/DashboardMaterialFeed";
import { HorizontalTabPager, type HorizontalTabPagerHandle } from "../components/HorizontalTabPager";
import { MobilePageFrame } from "../components/MobilePageFrame";
import { PORTFOLIO_ALLOCATION_COLORS } from "../components/chartPalette";
import type { PagerMotionSink } from "../components/pagerMotion";
import { PullToRefresh } from "../components/PullToRefresh";
import { SecondaryNavigation } from "../components/SecondaryNavigation";
import { EmptyState, ErrorState, ListRow, LoadingState, Metric, SectionCard } from "../components/Ui";
import {
  DEFAULT_POOL_STATUS,
  DEFAULT_STOCK_TAB_VIEW,
  POOL_STATUS_OPTIONS,
  STOCK_TAB_VIEWS,
  ARCHIVED_POOL_STATUS,
  filterPoolByStatus,
  nextPoolPage,
  poolPageLayout,
  badgeTierClass,
  investmentLevelTier,
  poolCardBadgeSet,
  trendLevelTier,
  valuationSpaceTier,
  poolStatusCounts,
  sortPoolByResearchRank,
  type PoolCardBadgeSet,
  type PoolStatusKey,
  type StockTabView
} from "./stockPoolGroups";
import {
  ARCHIVED_TRACK_STATUS,
  TRACK_CYCLE_LABELS,
  TRACK_INDUSTRY_PHASE_LABELS,
  TRACK_MARKET_PHASE_LABELS,
  TRACK_PRIORITY_LABELS,
  TRACK_STATUS_OPTIONS,
  TRACK_STRENGTH_LABELS,
  TRACK_TAB_VIEWS,
  buildTrackRow,
  filterTracksByStatus,
  sortTracksByPriority,
  trackLabel,
  trackStatusCounts,
  type TrackHeatLookup,
  type TrackStatusKey,
  type TrackTabView
} from "./trackLibraryGroups";
import {
  lastDashboardTab,
  lastPoolStatus,
  lastStockView,
  lastTrackStatus,
  lastTrackView,
  rememberDashboardTab,
  rememberPoolStatus,
  rememberStockView,
  rememberTrackStatus,
  rememberTrackView
} from "./dashboardViewState";
import type { TagHeat } from "../types/api";
import { formatDateTime, formatMoney, formatNumber } from "../utils/format";

type DashboardTab = typeof dashboardTabs[number]["key"];
const DonutChart = lazy(() => import("../components/MiniChart").then((module) => ({ default: module.DonutChart })));
const PortfolioTreemap = lazy(() => import("../components/PortfolioTreemap").then((module) => ({ default: module.PortfolioTreemap })));

function rankMovementDisplay(item: Pick<TagHeat, "rank_change" | "rank_movement">) {
  if (item.rank_movement === "new") return { value: "new", tone: "neutral" } as const;
  const change = Number(item.rank_change);
  if (!Number.isFinite(change) || change === 0) return { value: "--", tone: "neutral" } as const;
  return change > 0
    ? { value: `+${change}`, tone: "up" } as const
    : { value: String(change), tone: "down" } as const;
}

export function DashboardPage() {
  const [tab, setTab] = useState<DashboardTab>(() => lastDashboardTab() as DashboardTab);
  const pager = useRef<HorizontalTabPagerHandle<DashboardTab>>(null);
  const navigationMotion = useRef<PagerMotionSink | null>(null);
  return (
    <MobilePageFrame navigation={<SecondaryNavigation ref={navigationMotion} items={dashboardTabs} activeKey={tab} onChange={(key) => pager.current?.requestChange(key)} />}>
      <HorizontalTabPager ref={pager} items={dashboardTabs} activeKey={tab} onChange={(key) => { rememberDashboardTab(key); setTab(key); }} motionSink={navigationMotion} renderPage={(key) => {
        if (key === "today") return <TodayDashboard />;
        if (key === "market") return <MarketDashboard active={key === tab} />;
        if (key === "track") return <TrackDashboard active={key === tab} />;
        if (key === "stock") return <StockDashboard active={key === tab} />;
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
    <PullToRefresh
      ariaLabel="今日看板下拉刷新"
      onRefresh={async () => {
        const [marketResult, reportsResult] = await Promise.all([market.refetch(), reports.refetch()]);
        if (marketResult.isError) throw marketResult.error;
        if (reportsResult.isError) throw reportsResult.error;
      }}
    >
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
            <span>今日盈亏 <b className={valueTone(portfolio.day_pnl)}>{formatSignedMoney(portfolio.day_pnl)}</b></span>
            <span>今日涨跌幅 <b className={valueTone(portfolio.day_pct)}>{formatSigned(portfolio.day_pct, "%")}</b></span>
            <span>{portfolio.portfolio_count} 个组合 · {portfolio.position_count} 个持仓</span>
            <time>报价 {formatDateTime(portfolio.latest_quote_time)}</time>
          </div>
        </SectionCard>
      ) : null}
      <SectionCard title="最新报告" action={<button className="text-button" onClick={() => navigate("/reports")}>全部</button>}>
        {reports.data?.items.map((item) => <ListRow key={item.id} title={item.title} meta={item.source_module} onClick={() => navigate(`/reports/${item.id}`)} />)}
      </SectionCard>
      </div>
    </PullToRefresh>
  );
}

/**
 * 热度排行筛选器与标的页的视图切换器同样沉底：排行条数随类型和时间窗口变化，
 * 跟着内容走就会忽上忽下，条数多时还会被挤出首屏。挂到 body 上做 fixed 的理由
 * 与 StockDashboard 一致，只有当前 tab 渲染它，避免预渲染的相邻页把它带出来。
 */
function MarketDashboard({ active }: { active: boolean }) {
  const [rankingType, setRankingType] = useState<MarketRankingType>("all");
  const [rankingWindow, setRankingWindow] = useState<MarketRankingWindow>("7d");
  const rankings = useQuery({
    queryKey: ["market-rankings", rankingType, rankingWindow],
    queryFn: () => mobileApi.marketRankings(rankingType, rankingWindow),
    staleTime: 300_000
  });
  /** 排行只有这一个查询，refetch 天然跟着当前的类型和时间窗口走。 */
  const refresh = async () => {
    const result = await rankings.refetch();
    if (result.isError) throw result.error;
  };
  return (
    <PullToRefresh ariaLabel="市场页下拉刷新" onRefresh={refresh}>
      <div className="page-stack market-filter-stack">
        <SectionCard className="market-ranking-card dashboard-flat-section">
          <div className="market-ranking-content" aria-live="polite">
            {rankings.isLoading ? <LoadingState /> : rankings.isError ? (
              <ErrorState message="热度排行加载失败" onRetry={() => void rankings.refetch()} />
            ) : rankings.data?.length ? (
              rankings.data.slice(0, 10).map((item) => {
                const movement = rankMovementDisplay(item);
                return <ListRow
                  key={item.tag_id}
                  title={`${item.rank_no}. ${item.tag?.name ?? "未命名标签"}`}
                  meta={`${item.trigger_count} 次触发 · ${item.source_count} 来源`}
                  trailing={(
                    <div className="market-ranking-metrics">
                      <strong className="score">{formatNumber(item.heat_score, 1)}</strong>
                      <span className="market-ranking-movement">
                        <span>位次变化</span>
                        <strong className={`market-ranking-movement--${movement.tone}`}>{movement.value}</strong>
                      </span>
                    </div>
                  )}
                />;
              })
            ) : <EmptyState title="暂无热度排行" detail="等待热度快照生成" />}
          </div>
        </SectionCard>
        {active ? createPortal(
          <div className="market-filter-bar" data-swipe-ignore="true">
            <div className="market-ranking-filters">
              <div className="segmented" role="group" aria-label="排行榜类型">
                {([
                  ["all", "市场"],
                  ["track", "赛道"],
                  ["stock", "标的"]
                ] as const).map(([value, label]) => (
                  <button type="button" className={rankingType === value ? "is-active" : ""} aria-pressed={rankingType === value} onClick={() => setRankingType(value)} key={value}>{label}</button>
                ))}
              </div>
              <div className="segmented" role="group" aria-label="时间范围">
                {(["24h", "7d", "30d"] as const).map((value) => (
                  <button type="button" className={rankingWindow === value ? "is-active" : ""} aria-pressed={rankingWindow === value} onClick={() => setRankingWindow(value)} key={value}>{value}</button>
                ))}
              </div>
            </div>
          </div>,
          document.body
        ) : null}
      </div>
    </PullToRefresh>
  );
}

/**
 * 赛道页和标的页同构：底部分段器切「赛道库 / 赛道材料」，分段器 portal 到 body，
 * 原因见下面 StockDashboard 的注释——横滑容器的 transform 会让页内 fixed 失效。
 */
function TrackDashboard({ active }: { active: boolean }) {
  const [view, setView] = useState<TrackTabView>(lastTrackView);
  const client = useQueryClient();
  const refresh = async () => {
    const queryKey = view === "materials" ? ["track-materials"] : ["track-library"];
    if (view === "materials") {
      client.setQueryData<{ pages: unknown[]; pageParams: unknown[] }>(queryKey, (current) => current ? {
        ...current,
        pages: current.pages.slice(0, 1),
        pageParams: current.pageParams.slice(0, 1)
      } : current);
    }
    await client.refetchQueries({ queryKey, exact: view === "materials" });
    const failed = client.getQueryCache().findAll({ queryKey }).find((entry) => entry.state.status === "error");
    if (failed) throw failed.state.error;
  };
  return (
    <PullToRefresh ariaLabel="赛道页下拉刷新" onRefresh={refresh}>
      <div className="page-stack track-view-stack">
        {view === "materials" ? <TrackMaterialsView /> : <TrackLibraryView />}
        {active ? createPortal(
          <div className="stock-view-bar" data-swipe-ignore="true">
            <div className="pill-segments" role="group" aria-label="赛道视图">
              {TRACK_TAB_VIEWS.map((item) => (
                <button
                  type="button"
                  key={item.value}
                  className={view === item.value ? "is-active" : ""}
                  aria-pressed={view === item.value}
                  onClick={() => { rememberTrackView(item.value); setView(item.value); }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>,
          document.body
        ) : null}
      </div>
    </PullToRefresh>
  );
}

function TrackLibraryView() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<TrackStatusKey>(lastTrackStatus);
  // 赛道总量是十几条量级，一次取回在端上分档排序，不做分页。归档要显式请求。
  const archivedView = status === ARCHIVED_TRACK_STATUS;
  const listQuery = useQuery({
    queryKey: ["track-library", archivedView ? ARCHIVED_TRACK_STATUS : "active"],
    queryFn: () => mobileApi.trackList(50, archivedView ? ARCHIVED_TRACK_STATUS : undefined),
    staleTime: 300_000
  });
  // 热度来自看板聚合，取不到不影响列表主体，所以单独一条查询、失败不阻塞
  const heatQuery = useQuery({
    queryKey: ["track-dashboard-heat"],
    queryFn: () => mobileApi.trackDashboard(),
    staleTime: 300_000
  });
  const heat: TrackHeatLookup = Object.fromEntries(
    (heatQuery.data?.heat_rankings ?? []).map((item) => [item.track_id, item.current_heat])
  );
  const rows = (listQuery.data ?? []).map((track) => buildTrackRow(track, undefined, heat));
  const counts = trackStatusCounts(rows);
  const visible = sortTracksByPriority(filterTracksByStatus(rows, status));
  return (
    <SectionCard className="dashboard-flat-section">
      <div className="pill-segments pill-segments--compact" data-swipe-ignore="true" role="group" aria-label="赛道状态分组">
        {TRACK_STATUS_OPTIONS.map((option) => (
          <button
            type="button"
            key={option.value}
            className={`${status === option.value ? "is-active" : ""}${option.value === ARCHIVED_TRACK_STATUS ? " is-archived" : ""}`.trim()}
            aria-pressed={status === option.value}
            onClick={() => { rememberTrackStatus(option.value); setStatus(option.value); }}
          >
            {option.label}{counts[option.value] === undefined ? null : <i>{counts[option.value]}</i>}
          </button>
        ))}
      </div>
      {listQuery.isLoading ? <LoadingState /> : listQuery.isError ? (
        <ErrorState message="赛道库加载失败" onRetry={() => void listQuery.refetch()} />
      ) : visible.length ? (
        <div className="track-list">
          {visible.map((row) => (
            <button type="button" className="track-list-row" key={row.id} onClick={() => navigate(`/tracks/${row.id}`)}>
              <div className="track-list-row__head">
                <strong>{row.name}</strong>
                <span className={`track-strength track-strength--${row.headlineStrength === "strong" ? "strong" : row.headlineStrength === "medium" ? "medium" : row.headlineStrength === "weak" ? "weak" : "unknown"}`}>
                  {row.researched ? (
                    <>
                      {trackLabel(TRACK_STRENGTH_LABELS, row.headlineStrength)}
                      <i>{trackLabel(TRACK_CYCLE_LABELS, row.headlineCycle)}</i>
                    </>
                  ) : "待研究"}
                </span>
              </div>
              <p className="track-list-row__judgment">{row.coreJudgment}</p>
              <div className="track-list-row__meta">
                <span>{trackLabel(TRACK_INDUSTRY_PHASE_LABELS, row.industryPhase)}</span>
                <span>{trackLabel(TRACK_MARKET_PHASE_LABELS, row.marketPhase)}</span>
                <span>{trackLabel(TRACK_PRIORITY_LABELS, row.researchPriority)}</span>
                <em>{row.heat === null ? "热度 —" : `热度 ${Math.round(row.heat)}`}</em>
              </div>
            </button>
          ))}
        </div>
      ) : <EmptyState title="该分组下暂无赛道" detail="切换上方分组查看其他赛道" />}
    </SectionCard>
  );
}

function TrackMaterialsView() {
  const client = useQueryClient();
  const query = useInfiniteQuery({
    queryKey: ["track-materials"],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => mobileApi.trackMaterials(pageParam, 10),
    getNextPageParam: (lastPage) =>
      lastPage.has_more ? lastPage.offset + lastPage.items.length : undefined,
    staleTime: 300_000
  });
  const items: DashboardMaterialItem[] = query.data?.pages.flatMap((page) => page.items.map((item) => ({
    id: item.id,
    entityName: item.track_name ?? "赛道",
    direction: item.direction,
    title: item.material_title,
    summary: item.material_summary,
    sourceName: item.material_source_name,
    materialTime: item.material_time
  }))) ?? [];
  void client;
  return (
    <SectionCard className="dashboard-flat-section">
      {query.isLoading ? <LoadingState /> : query.isError && !query.data ? (
        <ErrorState message="最新材料加载失败" onRetry={() => void query.refetch()} />
      ) : (
        <DashboardMaterialFeed
          items={items}
          hasNextPage={query.hasNextPage}
          isFetchingNextPage={query.isFetchingNextPage}
          isFetchNextPageError={query.isFetchNextPageError}
          onLoadMore={() => void query.fetchNextPage()}
        />
      )}
    </SectionCard>
  );
}

/**
 * 视图分段器挂到 body 上做 fixed：横滑分页容器带 transform 和 contain，
 * 页内的 fixed 会以分页容器为包含块，sticky 又要靠整列高度撑，都不稳。
 * 只有当前 tab 渲染它，避免相邻预渲染页把分段器带到别的 tab 上。
 */
function StockDashboard({ active }: { active: boolean }) {
  const [view, setView] = useState<StockTabView>(lastStockView);
  const client = useQueryClient();
  /**
   * 两个视图各自持有查询，一次下拉只刷当前视图：材料流顺带把分页收回第一页，
   * 标的池是一次性拉全量，重拉即可，卡片翻页位置由 poolPageLayout 取模兜底。
   * 标的池按常规/回收站分成两个 key，所以按前缀匹配刷新，不能用 exact。
   */
  const refresh = async () => {
    const queryKey = view === "materials" ? ["stock-materials"] : ["stock-pool"];
    if (view === "materials") {
      client.setQueryData<{ pages: unknown[]; pageParams: unknown[] }>(queryKey, (current) => current ? {
        ...current,
        pages: current.pages.slice(0, 1),
        pageParams: current.pageParams.slice(0, 1)
      } : current);
    }
    await client.refetchQueries({ queryKey, exact: view === "materials" });
    const failed = client.getQueryCache().findAll({ queryKey }).find((entry) => entry.state.status === "error");
    if (failed) throw failed.state.error;
  };
  return (
    <PullToRefresh ariaLabel="标的页下拉刷新" onRefresh={refresh}>
      <div className="page-stack stock-view-stack">
        {view === "materials" ? <StockMaterialsView /> : <StockPoolView />}
        {active ? createPortal(
          <div className="stock-view-bar" data-swipe-ignore="true">
            <div className="pill-segments" role="group" aria-label="标的视图">
              {STOCK_TAB_VIEWS.map((item) => (
                <button
                  type="button"
                  key={item.value}
                  className={view === item.value ? "is-active" : ""}
                  aria-pressed={view === item.value}
                  onClick={() => { rememberStockView(item.value); setView(item.value); }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>,
          document.body
        ) : null}
      </div>
    </PullToRefresh>
  );
}

function StockPoolView() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<PoolStatusKey>(lastPoolStatus);
  const [page, setPage] = useState(0);
  // 归档等同软删除：后端默认不返回，只有切到"归档"这个回收站视图才单独去取。
  const archivedView = status === ARCHIVED_POOL_STATUS;
  const query = useQuery({
    queryKey: ["stock-pool", archivedView ? ARCHIVED_POOL_STATUS : "active"],
    queryFn: () => mobileApi.stockPool(50, archivedView ? ARCHIVED_POOL_STATUS : undefined),
    staleTime: 300_000
  });
  const items = query.data ?? [];
  const counts = poolStatusCounts(items, archivedView);
  // 排序在筛选之后、分页之前：分档计数走的是未排序的原始列表，两边互不影响。
  const visible = sortPoolByResearchRank(filterPoolByStatus(items, status));
  const layout = poolPageLayout(visible, page);
  return (
    <SectionCard className="dashboard-flat-section">
      <div className="pill-segments pill-segments--compact" data-swipe-ignore="true" role="group" aria-label="标的池状态">
        {POOL_STATUS_OPTIONS.map((option) => (
          <button
            type="button"
            key={option.value}
            className={`${status === option.value ? "is-active" : ""}${option.value === ARCHIVED_POOL_STATUS ? " is-archived" : ""}`.trim()}
            aria-pressed={status === option.value}
            onClick={() => { rememberPoolStatus(option.value); setStatus(option.value); setPage(0); }}
          >
            {option.label}{counts[option.value] === undefined ? null : <i>{counts[option.value]}</i>}
          </button>
        ))}
      </div>
      {query.isLoading ? <LoadingState /> : query.isError ? (
        <ErrorState message="标的池加载失败" onRetry={() => void query.refetch()} />
      ) : visible.length ? (
        <>
          <div className="pool-card-grid">
            {layout.cards.map((item) => (
              <button type="button" className="pool-card" key={item.id} onClick={() => navigate(`/stocks/${item.stock_id}`)}>
                <strong>{item.stock_name?.trim() || "未命名标的"}</strong>
                <span>{item.stock_code?.trim() || "--"}</span>
                <PoolCardBadges badges={poolCardBadgeSet(item)} />
              </button>
            ))}
            {layout.showPager ? (
              <button
                type="button"
                className="pool-card pool-card--pager"
                aria-label={`${layout.page + 1 === layout.totalPages ? "回到首页" : "下一页"}，当前第 ${layout.page + 1} 页，共 ${layout.totalPages} 页`}
                onClick={() => setPage(nextPoolPage(layout.page, layout.totalPages))}
              >
                <strong>{layout.page + 1 === layout.totalPages ? "回到首页" : "下一页"}</strong>
                <span>{layout.page + 1}/{layout.totalPages}</span>
              </button>
            ) : null}
          </div>
          {items.length >= 50 ? <p className="pool-limit-hint">仅展示前 50 个标的，更多标的请在 Web 端查看。</p> : null}
        </>
      ) : <EmptyState title="该状态下暂无标的" detail="切换上方分组查看其他标的" />}
    </SectionCard>
  );
}

/**
 * 角标独占代码下面一行，横排左对齐：三个维度按趋势、等级、空间固定顺序，
 * 位置即维度。压在名称四角时既要给名称预留宽度又要防叠字，挪下来两边都不用让。
 */
function PoolCardBadges({ badges }: { badges: PoolCardBadgeSet }) {
  const { level, space, trend } = badges;
  // 一个角标都没有时也留着这一行：角标行高度恒定，同一屏卡片的文字才不会各自高低。
  return (
    <span className="pool-card__badges">
      {trend ? (
        <i className={`pool-card__badge ${badgeTierClass(trendLevelTier(trend))}`} aria-label={`趋势等级 ${trend}`}>{trend}</i>
      ) : null}
      {level ? (
        <i className={`pool-card__badge ${badgeTierClass(investmentLevelTier(level))}`.trimEnd()} aria-label={`投资等级 ${level}`}>{level}</i>
      ) : null}
      {space ? (
        <i className={`pool-card__badge ${badgeTierClass(valuationSpaceTier(space))}`} aria-label={`三年空间 ${space}`}>{space}</i>
      ) : null}
    </span>
  );
}

function StockMaterialsView() {
  const navigate = useNavigate();
  const query = useInfiniteQuery({
    queryKey: ["stock-materials"],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => mobileApi.stockMaterials(pageParam, 10),
    getNextPageParam: (lastPage) =>
      lastPage.has_more ? lastPage.offset + lastPage.items.length : undefined,
    staleTime: 300_000
  });
  const items: DashboardMaterialItem[] = query.data?.pages.flatMap((page) => page.items.map((item) => ({
    id: item.id,
    entityId: item.stock_id,
    entityName: item.stock_name ?? "标的",
    entityCode: item.stock_code,
    direction: item.impact_direction,
    title: item.material_title,
    summary: item.material_summary,
    sourceName: item.material_source_name,
    materialTime: item.material_time
  }))) ?? [];
  return (
    <SectionCard className="dashboard-flat-section">
      {query.isLoading ? <LoadingState /> : query.isError && !query.data ? (
        <ErrorState message="最新材料加载失败" onRetry={() => void query.refetch()} />
      ) : (
        <DashboardMaterialFeed
          items={items}
          hasNextPage={query.hasNextPage}
          isFetchingNextPage={query.isFetchingNextPage}
          isFetchNextPageError={query.isFetchNextPageError}
          onLoadMore={() => void query.fetchNextPage()}
          onEntityClick={(item) => { if (item.entityId) navigate(`/stocks/${item.entityId}`); }}
        />
      )}
    </SectionCard>
  );
}

function PortfolioDashboard() {
  const [portfolioId, setPortfolioId] = useState<number | null>(null);
  const overview = useQuery({ queryKey: ["portfolio-overview", portfolioId], queryFn: () => mobileApi.portfolioOverview(portfolioId), staleTime: 300_000 });
  if (overview.isLoading) return <LoadingState />;
  if (overview.isError) return <ErrorState onRetry={() => void overview.refetch()} />;
  const summary = overview.data?.summary;
  const pieItems = overview.data?.pie_items ?? [];
  return (
    <PullToRefresh
      ariaLabel="组合页下拉刷新"
      onRefresh={async () => {
        const result = await overview.refetch();
        if (result.isError) throw result.error;
      }}
    >
      <div className="page-stack portfolio-dashboard-mobile">
        <div className="metric-grid">
          <Metric label="总市值" value={formatMoney(summary?.total_value)} />
          <Metric label="持仓市值" value={formatMoney(summary?.position_market_value)} />
          <Metric label="现金余额" value={formatMoney(summary?.cash_amount)} />
          <Metric label="月度盈亏" value={formatMoney(summary?.month_pnl)} tone={(summary?.month_pnl ?? 0) >= 0 ? "up" : "down"} />
        </div>
        <SectionCard title="今日表现">
          <div className="portfolio-day-row">
            <span className={(summary?.day_pnl ?? 0) >= 0 ? "positive" : "negative"}>{formatSignedMoney(summary?.day_pnl)}</span>
            <span className={(summary?.day_pct ?? 0) >= 0 ? "positive" : "negative"}>{formatSigned(summary?.day_pct, "%")}</span>
          </div>
        </SectionCard>
        {pieItems.length ? (
          <SectionCard title="标的组合">
            <div className="portfolio-allocation"><Suspense fallback={<LoadingState />}>
              <DonutChart items={pieItems.map((item) => ({ name: item.label, value: item.market_value }))} />
            </Suspense><div className="portfolio-allocation__list" data-swipe-ignore="true">
              {pieItems.map((item, index) => (
                <div className="portfolio-allocation__item" key={`${item.label}-${index}`}>
                  <span className="portfolio-allocation__marker" style={{ backgroundColor: PORTFOLIO_ALLOCATION_COLORS[index % PORTFOLIO_ALLOCATION_COLORS.length] }} aria-hidden="true" />
                  <strong title={item.label}>{item.label}</strong>
                  <span className="portfolio-allocation__metrics">
                    <span>{formatPercent(item.weight)}</span>
                    <span className={valueTone(item.day_pct)}>{formatSigned(item.day_pct, "%")}</span>
                  </span>
                </div>
              ))}
            </div></div>
          </SectionCard>
        ) : <EmptyState title="暂无标的组合数据" />}
        <SectionCard title="标的热力图">
          {pieItems.length ? (
            <Suspense fallback={<LoadingState />}>
              <PortfolioTreemap items={pieItems.map((item) => ({
                name: item.label,
                marketValue: item.market_value,
                weight: item.weight,
                currentPrice: item.current_price,
                dayPct: item.day_pct
              }))} />
            </Suspense>
          ) : <EmptyState title="暂无标的热力图数据" />}
        </SectionCard>
        <SectionCard>
          <div className="portfolio-selector"><span>组合选择</span><div className="portfolio-segments" role="group" aria-label="组合选择">
            <button type="button" className={portfolioId === null ? "is-active" : ""} onClick={() => setPortfolioId(null)}>全部</button>
            {overview.data?.portfolio_options?.map((item) => <button type="button" className={portfolioId === item.id ? "is-active" : ""} onClick={() => setPortfolioId(item.id)} key={item.id}>{item.name}</button>)}
          </div></div>
        </SectionCard>
      </div>
    </PullToRefresh>
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

function formatPercent(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "--";
  return `${new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Number(value))}%`;
}

function valueTone(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "";
  return value >= 0 ? "positive" : "negative";
}
