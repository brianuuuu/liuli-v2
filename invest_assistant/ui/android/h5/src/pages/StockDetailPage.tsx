import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { useParams } from "react-router-dom";
import { mobileApi } from "../api/mobileApi";
import { EmptyState, ErrorState, ListRow, LoadingState, SectionCard } from "../components/Ui";
import { poolStatusLabel } from "./stockPoolGroups";
import {
  DEFAULT_STOCK_DETAIL_SECTION,
  STOCK_DETAIL_SECTIONS,
  actionableMaterials,
  formatValuationGap,
  scoreDimensions,
  scoreTrendRows,
  stockDetailTitle,
  trackNames,
  valuationGapTone,
  valuationModelLabel,
  type StockDetailSection
} from "./stockDetailPresentation";
import { DetailFrame } from "./DetailPages";
import type { StockDetail } from "../types/api";
import { formatDateTime, formatNumber } from "../utils/format";

const RatingRadar = lazy(() => import("../components/StockDetailCharts").then((m) => ({ default: m.RatingRadar })));
const ScoreTrendBar = lazy(() => import("../components/StockDetailCharts").then((m) => ({ default: m.ScoreTrendBar })));

function ChartFallback({ height }: { height: number }) {
  return <div className="stock-detail-chart is-loading" style={{ height }} />;
}

export function StockDetailPage() {
  const id = Number(useParams().id);
  const [section, setSection] = useState<StockDetailSection>(DEFAULT_STOCK_DETAIL_SECTION);
  const query = useQuery({ queryKey: ["stock-detail", id], queryFn: () => mobileApi.stockDetail(id), staleTime: 300_000 });
  const title = stockDetailTitle(query.data);
  if (query.isLoading) return <DetailFrame title="标的详情"><LoadingState /></DetailFrame>;
  if (query.isError || !query.data) {
    return <DetailFrame title="标的详情"><ErrorState message="标的详情加载失败" onRetry={() => void query.refetch()} /></DetailFrame>;
  }
  const detail = query.data;
  return (
    <DetailFrame title={title}>
      <div className="page-stack">
        <StockIdentity detail={detail} />
        <div className="pill-segments pill-segments--compact" role="group" aria-label="标的详情分区">
          {STOCK_DETAIL_SECTIONS.map((item) => (
            <button
              type="button"
              key={item.value}
              className={section === item.value ? "is-active" : ""}
              aria-pressed={section === item.value}
              onClick={() => setSection(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
        {section === "overview" ? <OverviewSection detail={detail} /> : null}
        {section === "rating" ? <RatingSection detail={detail} /> : null}
        {section === "materials" ? <MaterialsSection detail={detail} /> : null}
        {section === "notes" ? <NotesSection detail={detail} /> : null}
      </div>
    </DetailFrame>
  );
}

function StockIdentity({ detail }: { detail: StockDetail }) {
  // 公司名已经在顶部标题栏，这里只补充代码、状态和赛道，避免重复也避免代码紧贴名称。
  const status = detail.pool?.status ?? detail.stock.status;
  const tracks = trackNames(detail);
  const facts = [detail.stock.stock_code?.trim(), status ? poolStatusLabel(status) : null, tracks.length ? tracks.join(" · ") : null]
    .filter((item): item is string => Boolean(item));
  if (!facts.length) return null;
  return (
    <section className="stock-identity">
      {facts.map((fact, index) => (
        <span key={fact}>{index > 0 ? <i aria-hidden="true">·</i> : null}{fact}</span>
      ))}
    </section>
  );
}

function OverviewSection({ detail }: { detail: StockDetail }) {
  const score = detail.latest_score;
  const valuation = detail.latest_valuation;
  return (
    <>
      <SectionCard title="最新评级">
        {score ? (
          <>
            <div className="stock-detail-score-head">
              <div><span>综合评分</span><strong>{formatNumber(score.total_score, 2)}</strong></div>
              <div><span>投资等级</span><strong>{score.investment_level || "-"}</strong></div>
            </div>
            <Suspense fallback={<ChartFallback height={220} />}>
              <RatingRadar dimensions={scoreDimensions(score)} />
            </Suspense>
            {score.core_logic ? <div className="stock-detail-copy"><span>核心逻辑</span><p>{score.core_logic}</p></div> : null}
            {score.primary_risk ? <div className="stock-detail-copy is-risk"><span>主要风险</span><p>{score.primary_risk}</p></div> : null}
            <footer className="stock-detail-meta">{score.researcher_code || "未标注研究员"} · {score.report_time}</footer>
          </>
        ) : <EmptyState title="暂无评级" detail="等待研究员写入评分" />}
      </SectionCard>
      <SectionCard title="最新估值">
        {valuation ? (
          <div className="detail-facts">
            <div><span>最新市值</span><b>{formatNumber(valuation.current_market_value, 2)}</b></div>
            <div><span>三年合理市值</span><b>{formatNumber(valuation.expected_market_value_3y, 2)}</b></div>
            <div><span>三年估值空间</span><b className={valuationGapTone(valuation.expectation_gap_rate)}>{formatValuationGap(valuation.expectation_gap_rate)}</b></div>
            <div><span>估值报告时间</span><b>{valuation.analysis_date || "-"}</b></div>
            <div><span>估值期</span><b>{valuation.report_period || "-"}</b></div>
            <div><span>估值依据</span><b>{valuationModelLabel(valuation.primary_model)}</b></div>
          </div>
        ) : <EmptyState title="暂无估值" detail="等待研究员写入估值快照" />}
      </SectionCard>
    </>
  );
}

function RatingSection({ detail }: { detail: StockDetail }) {
  const rows = scoreTrendRows(detail.score_history);
  return (
    <>
      <SectionCard title="评分趋势">
        {rows.length ? (
          <Suspense fallback={<ChartFallback height={180} />}>
            <ScoreTrendBar
              labels={rows.map((item) => String(item.report_time).slice(5))}
              values={rows.map((item) => Number(item.total_score ?? 0))}
            />
          </Suspense>
        ) : <EmptyState title="暂无评分趋势" />}
      </SectionCard>
      <SectionCard title="历史评分">
        {detail.score_history.length ? detail.score_history.map((item) => (
          <ListRow
            key={item.id}
            title={`${item.report_time} · ${item.investment_level || "-"}`}
            meta={`壁垒 ${formatNumber(item.business_moat_score, 1)} · 管理 ${formatNumber(item.management_score, 1)} · 成长 ${formatNumber(item.growth_score, 1)}`}
            trailing={<strong className="stock-detail-score-value">{formatNumber(item.total_score, 2)}</strong>}
          />
        )) : <EmptyState title="暂无历史评分" />}
      </SectionCard>
    </>
  );
}

function MaterialsSection({ detail }: { detail: StockDetail }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? detail.materials : actionableMaterials(detail.materials);
  return (
    <>
      <SectionCard
        title="材料"
        action={<button type="button" className="text-button" onClick={() => setShowAll((value) => !value)}>{showAll ? "只看有效" : "看全部"}</button>}
      >
        {visible.length ? visible.map((item) => (
          <article className="stock-detail-material" key={item.id}>
            <h3>{item.material_title?.trim() || "--"}</h3>
            {item.material_summary?.trim() ? <p>{item.material_summary}</p> : null}
            <footer>
              {[item.material_source_name?.trim(), item.material_time ? formatDateTime(item.material_time) : null].filter(Boolean).join(" · ") || "--"}
              {item.material_url ? <a href={item.material_url} target="_blank" rel="noreferrer">原文 <ExternalLink size={13} /></a> : null}
            </footer>
          </article>
        )) : <EmptyState title="暂无材料" detail={showAll ? undefined : "已隐藏噪音和已忽略材料"} />}
      </SectionCard>
      <SectionCard title="公告财报">
        {detail.disclosures.length ? detail.disclosures.slice(0, 20).map((item) => (
          <ListRow key={item.id} title={item.title} meta={`${item.disclosure_type} · ${formatDateTime(item.publish_time)}`} />
        )) : <EmptyState title="暂无公告财报" />}
      </SectionCard>
    </>
  );
}

function NotesSection({ detail }: { detail: StockDetail }) {
  if (!detail.notes.length) return <SectionCard title="研究笔记"><EmptyState title="暂无研究笔记" /></SectionCard>;
  return (
    <SectionCard title="研究笔记">
      {detail.notes.map((item) => (
        <article className="stock-detail-note" key={item.id}>
          <h3>{item.title}</h3>
          <p>{item.content}</p>
          <footer>{item.note_type} · {formatDateTime(item.updated_at)}</footer>
        </article>
      ))}
    </SectionCard>
  );
}
