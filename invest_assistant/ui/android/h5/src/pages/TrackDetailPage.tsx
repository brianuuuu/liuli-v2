import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { mobileApi } from "../api/mobileApi";
import { EmptyState, ErrorState, ListRow, LoadingState, SectionCard } from "../components/Ui";
import { DetailFrame } from "./DetailPages";
import {
  activeStockCount,
  buildDetailScoreRows,
  detailCount,
  detailHeat,
  detailMaterials,
  detailSnapshots,
  detailStocks,
  detailTrack,
  parseTrackSegments,
  trackLabel,
  TRACK_CYCLE_LABELS,
  TRACK_INDUSTRY_PHASE_LABELS,
  TRACK_MARKET_PHASE_LABELS,
  TRACK_SCORE_MAX
} from "./trackLibraryGroups";
import type { TrackDetail, TrackTrendSnapshotBrief } from "../types/api";
import { formatDateTime, formatNumber } from "../utils/format";
import { materialDirectionPresentation } from "../utils/materialDirection";

type TrackDetailSection = "overview" | "snapshots" | "stocks" | "materials";

const TRACK_DETAIL_SECTIONS: { value: TrackDetailSection; label: string }[] = [
  { value: "overview", label: "概览" },
  { value: "snapshots", label: "趋势快照" },
  { value: "stocks", label: "关联标的" },
  { value: "materials", label: "材料" }
];

/**
 * 赛道卡的两个角标，和赛道库列表同一套样式。
 * 评级为空表示这条赛道还没有研究结论，显示"待研究"而不是 D 级——没研究过和研究后
 * 评了低分是两回事。
 */
function TrackBadges({ grade, tier }: { grade?: string | null; tier?: string | null }) {
  if (!grade) {
    return <span className="track-badges"><i className="track-badge track-badge--empty">待研究</i></span>;
  }
  return (
    <span className="track-badges">
      <i className={`track-badge track-badge--grade-${grade}`}>{grade}</i>
      {tier ? <i className={`track-badge track-badge--tier-${tier}`}>{tier}</i> : null}
    </span>
  );
}

export function TrackDetailPage() {
  const id = Number(useParams().id);
  const [section, setSection] = useState<TrackDetailSection>("overview");
  const query = useQuery({ queryKey: ["track-detail", id], queryFn: () => mobileApi.trackDetail(id), staleTime: 300_000 });
  if (query.isLoading) return <DetailFrame title="赛道详情"><LoadingState /></DetailFrame>;
  if (query.isError || !query.data) {
    return <DetailFrame title="赛道详情"><ErrorState message="赛道详情加载失败" onRetry={() => void query.refetch()} /></DetailFrame>;
  }
  const detail = query.data;
  return (
    <DetailFrame title="赛道详情">
      <div className="page-stack">
        <TrackProfile detail={detail} />
        <div className="pill-segments pill-segments--compact" role="group" aria-label="赛道详情分区">
          {TRACK_DETAIL_SECTIONS.map((item) => (
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
        {section === "snapshots" ? <SnapshotsSection detail={detail} /> : null}
        {section === "stocks" ? <StocksSection detail={detail} /> : null}
        {section === "materials" ? <MaterialsSection detail={detail} /> : null}
      </div>
    </DetailFrame>
  );
}

/** 档案头：赛道名、评级与热度档位两个角标、阶段和三项关键计数。 */
function TrackProfile({ detail }: { detail: TrackDetail }) {
  const latest = detail.latest_snapshot;
  const track = detailTrack(detail);
  return (
    <section className="track-profile">
      <div className="track-profile__head">
        <div>
          <h2>{track.name || "未命名赛道"}</h2>
          {latest ? <p>{latest.research_date}{latest.researcher_code ? ` · ${latest.researcher_code}` : ""}</p> : <p>尚无研究结论</p>}
        </div>
        <TrackBadges grade={latest?.track_grade} tier={latest?.heat_tier} />
      </div>
      <div className="track-profile__phases">
        <span>产业 {trackLabel(TRACK_INDUSTRY_PHASE_LABELS, latest?.industry_phase || track.industry_phase)}</span>
        <span>市场 {trackLabel(TRACK_MARKET_PHASE_LABELS, latest?.market_phase || track.market_phase)}</span>
        <span>主导 {trackLabel(TRACK_CYCLE_LABELS, latest?.headline_cycle)}</span>
        <span>综合 {latest ? latest.overall_score.toFixed(1) : "—"}</span>
      </div>
      <div className="track-profile__metrics">
        <div><span>关联标的</span><strong>{activeStockCount(detail)}</strong></div>
        <div><span>待研判材料</span><strong>{detailCount(detail, "pending_material_count")}</strong></div>
        <div><span>当前热度</span><strong>{detailHeat(detail) === null ? "-" : formatNumber(detailHeat(detail), 0)}</strong></div>
      </div>
    </section>
  );
}

function OverviewSection({ detail }: { detail: TrackDetail }) {
  const latest = detail.latest_snapshot;
  const track = detailTrack(detail);
  const scores = buildDetailScoreRows(latest);
  const segments = parseTrackSegments(latest?.segments_json);
  const benefiting = segments.filter((item) => item.stance === "benefiting");
  return (
    <>
      <SectionCard title="核心判断">
        <p className="track-paragraph">{latest?.core_judgment || track.current_view || "尚无核心判断"}</p>
        {latest?.key_contradiction ? (
          <>
            <h4 className="track-subhead">主要矛盾</h4>
            <p className="track-paragraph">{latest.key_contradiction}</p>
          </>
        ) : null}
      </SectionCard>

      {/* 六维评分用条形而不是雷达：手机上雷达要画到能读，得占掉大半屏。 */}
      <SectionCard title="六维评分">
        <div className="track-score-list">
          {scores.map((row) => (
            <div className="track-score-row" key={row.key}>
              <span className="track-score-label">{row.label}</span>
              <span className="track-score-bar">
                <i style={{ width: `${((row.value ?? 0) / TRACK_SCORE_MAX) * 100}%` }} />
              </span>
              <strong>{row.value === null ? "—" : row.value.toFixed(1)}</strong>
            </div>
          ))}
          {latest ? (
            <div className="track-score-row track-score-row--total">
              <span className="track-score-label">综合分</span>
              <span className="track-score-bar">
                <i style={{ width: `${(latest.overall_score / TRACK_SCORE_MAX) * 100}%` }} />
              </span>
              <strong>{latest.overall_score.toFixed(2)}</strong>
            </div>
          ) : null}
        </div>
      </SectionCard>

      {benefiting.length ? (
        <SectionCard title="受益环节">
          {benefiting.map((item, index) => (
            <div className="track-segment-row" key={`${item.segment}-${index}`}>
              <strong>{item.segment}</strong>
              {item.reason ? <p>{item.reason}</p> : null}
              {item.representative_stocks?.length ? (
                <div className="track-segment-row__stocks">
                  {item.representative_stocks.map((name) => <span key={name}>{name}</span>)}
                </div>
              ) : null}
            </div>
          ))}
        </SectionCard>
      ) : null}

      {latest?.next_verification || latest?.risk_falsification ? (
        <SectionCard title="验证与风险">
          {latest?.next_verification ? (
            <>
              <h4 className="track-subhead">下一验证节点</h4>
              <p className="track-paragraph">{latest.next_verification}</p>
            </>
          ) : null}
          {latest?.risk_falsification ? (
            <>
              <h4 className="track-subhead">证伪条件</h4>
              <p className="track-paragraph">{latest.risk_falsification}</p>
            </>
          ) : null}
        </SectionCard>
      ) : null}
    </>
  );
}

function SnapshotsSection({ detail }: { detail: TrackDetail }) {
  const snapshots = detailSnapshots(detail);
  if (!snapshots.length) {
    return <SectionCard title="趋势快照"><EmptyState title="暂无趋势快照" detail="导入赛道趋势研究报告后显示" /></SectionCard>;
  }
  return (
    <SectionCard title="趋势快照">
      {snapshots.map((snapshot) => <SnapshotRow key={snapshot.id} snapshot={snapshot} />)}
    </SectionCard>
  );
}

function SnapshotRow({ snapshot }: { snapshot: TrackTrendSnapshotBrief }) {
  const scores = buildDetailScoreRows(snapshot);
  return (
    <div className="track-snapshot-row">
      <div className="track-snapshot-row__head">
        <strong>{snapshot.research_date}</strong>
        <TrackBadges grade={snapshot.track_grade} tier={snapshot.heat_tier} />
      </div>
      <div className="track-snapshot-row__cycles">
        {scores.map((row) => (
          <span key={row.key}>
            {row.label} {row.value === null ? "—" : row.value.toFixed(1)}
          </span>
        ))}
      </div>
      {snapshot.core_judgment ? <p>{snapshot.core_judgment}</p> : null}
      <div className="track-snapshot-row__foot">
        <span>综合 {snapshot.overall_score.toFixed(2)}</span>
        <span>主导 {trackLabel(TRACK_CYCLE_LABELS, snapshot.headline_cycle)}</span>
        {snapshot.researcher_code ? <span>{snapshot.researcher_code}</span> : null}
      </div>
    </div>
  );
}

function StocksSection({ detail }: { detail: TrackDetail }) {
  const navigate = useNavigate();
  const rows = detailStocks(detail).filter((item) => item.status === "active");
  if (!rows.length) {
    return <SectionCard title="关联标的"><EmptyState title="暂无关联标的" detail="在 Web 端确认赛道与标的的绑定关系" /></SectionCard>;
  }
  return (
    <SectionCard title="关联标的">
      {rows.map((item) => (
        <ListRow
          key={item.id}
          title={item.stock_name?.trim() || item.stock_code?.trim() || `Stock ${item.stock_id}`}
          meta={[item.stock_code, item.relation_type, item.reason].filter(Boolean).join(" · ")}
          onClick={() => navigate(`/stocks/${item.stock_id}`)}
        />
      ))}
    </SectionCard>
  );
}

function MaterialsSection({ detail }: { detail: TrackDetail }) {
  const materials = detailMaterials(detail);
  // 详情接口只回最近若干条材料，总数走 summary，截断时要说清楚，否则会被当成材料丢了。
  const total = detail?.summary?.material_count;
  const truncated = typeof total === "number" && total > materials.length;
  if (!materials.length) {
    return <SectionCard title="赛道材料"><EmptyState title="暂无材料" detail="材料来自信息流和知识笔记" /></SectionCard>;
  }
  return (
    <SectionCard
      title="赛道材料"
      action={truncated ? <span className="section-card__hint">近 {materials.length} 条 · 共 {total} 条</span> : undefined}
    >
      {materials.map((item) => {
        // 方向可能为空，presentation 这时返回 undefined，不能直接取 label
        const direction = materialDirectionPresentation(item.direction);
        return (
          <article className="detail-material" key={item.id}>
            <h3>
              <span>{item.material_title?.trim() || "未命名材料"}</span>
              {direction ? <em className={`material-direction material-direction--${direction.tone}`}>{direction.label}</em> : null}
            </h3>
            {item.material_summary?.trim() ? <p>{item.material_summary}</p> : null}
            <footer>
              {[item.material_source_name?.trim(), item.material_time ? formatDateTime(item.material_time) : null].filter(Boolean).join(" · ") || "--"}
              {item.material_url ? <a href={item.material_url} target="_blank" rel="noreferrer">原文 <ExternalLink size={13} /></a> : null}
            </footer>
          </article>
        );
      })}
    </SectionCard>
  );
}
