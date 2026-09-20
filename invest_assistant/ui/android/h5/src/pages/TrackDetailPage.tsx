import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { mobileApi } from "../api/mobileApi";
import { EmptyState, ErrorState, ListRow, LoadingState, SectionCard } from "../components/Ui";
import { DetailFrame } from "./DetailPages";
import {
  activeStockCount,
  buildDetailCycleRows,
  detailCount,
  detailHeat,
  detailMaterials,
  detailSnapshots,
  detailStocks,
  detailTrack,
  parseTrackSegments,
  trackLabel,
  TRACK_CYCLE_LABELS,
  TRACK_DIRECTION_LABELS,
  TRACK_INDUSTRY_PHASE_LABELS,
  TRACK_MARKET_PHASE_LABELS,
  TRACK_PRIORITY_LABELS,
  TRACK_STRENGTH_LABELS
} from "./trackLibraryGroups";
import type { TrackDetail, TrackTrendSnapshot } from "../types/api";
import { formatDateTime, formatNumber } from "../utils/format";
import { materialDirectionPresentation } from "../utils/materialDirection";

type TrackDetailSection = "overview" | "snapshots" | "stocks" | "materials";

const TRACK_DETAIL_SECTIONS: { value: TrackDetailSection; label: string }[] = [
  { value: "overview", label: "概览" },
  { value: "snapshots", label: "趋势快照" },
  { value: "stocks", label: "关联标的" },
  { value: "materials", label: "材料" }
];

/** 强度决定颜色：强红、中橙、弱蓝、证据不足灰。和 Web 端同一套语义。 */
function strengthTone(value?: string | null) {
  if (value === "strong") return "strong";
  if (value === "medium") return "medium";
  if (value === "weak") return "weak";
  return "unknown";
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

/** 档案头：赛道名、强度·周期、研究优先级和三项关键计数。 */
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
        <span className={`track-strength track-strength--${strengthTone(latest?.headline_strength)}`}>
          {latest ? (
            <>
              {trackLabel(TRACK_STRENGTH_LABELS, latest.headline_strength)}
              <i>{trackLabel(TRACK_CYCLE_LABELS, latest.headline_cycle)}</i>
            </>
          ) : "待研究"}
        </span>
      </div>
      <div className="track-profile__phases">
        <span>产业 {trackLabel(TRACK_INDUSTRY_PHASE_LABELS, latest?.industry_phase || track.industry_phase)}</span>
        <span>市场 {trackLabel(TRACK_MARKET_PHASE_LABELS, latest?.market_phase || track.market_phase)}</span>
        <span>{trackLabel(TRACK_PRIORITY_LABELS, latest?.research_priority)}</span>
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
  const cycles = buildDetailCycleRows(latest);
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

      <SectionCard title="三周期判断">
        <div className="track-cycle-list">
          {cycles.map((row) => (
            <div className={`track-cycle-item${row.isHeadline ? " is-headline" : ""}`} key={row.key}>
              <div className="track-cycle-item__head">
                <strong>{row.label}</strong>
                {row.isHeadline ? <i className="track-cycle-item__flag">主导</i> : null}
                <span className={`track-strength-dot track-strength-dot--${strengthTone(row.strength)}`}>
                  {trackLabel(TRACK_STRENGTH_LABELS, row.strength)}
                </span>
                <span className="track-cycle-item__direction">{trackLabel(TRACK_DIRECTION_LABELS, row.direction)}</span>
              </div>
              {row.basis ? <p>{row.basis}</p> : null}
            </div>
          ))}
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

function SnapshotRow({ snapshot }: { snapshot: TrackTrendSnapshot }) {
  const cycles = buildDetailCycleRows(snapshot);
  return (
    <div className="track-snapshot-row">
      <div className="track-snapshot-row__head">
        <strong>{snapshot.research_date}</strong>
        <span className={`track-strength track-strength--${strengthTone(snapshot.headline_strength)}`}>
          {trackLabel(TRACK_STRENGTH_LABELS, snapshot.headline_strength)}
          <i>{trackLabel(TRACK_CYCLE_LABELS, snapshot.headline_cycle)}</i>
        </span>
      </div>
      <div className="track-snapshot-row__cycles">
        {cycles.map((row) => (
          <span key={row.key}>
            {row.label} {trackLabel(TRACK_STRENGTH_LABELS, row.strength)}
          </span>
        ))}
      </div>
      {snapshot.core_judgment ? <p>{snapshot.core_judgment}</p> : null}
      <div className="track-snapshot-row__foot">
        <span>{trackLabel(TRACK_PRIORITY_LABELS, snapshot.research_priority)}</span>
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
  if (!materials.length) {
    return <SectionCard title="赛道材料"><EmptyState title="暂无材料" detail="材料来自信息流和知识笔记" /></SectionCard>;
  }
  return (
    <SectionCard title="赛道材料">
      {materials.map((item) => {
        // 方向可能为空，presentation 这时返回 undefined，不能直接取 label
        const direction = materialDirectionPresentation(item.direction);
        return (
          <ListRow
            key={item.id}
            title={item.material_title?.trim() || "未命名材料"}
            meta={[direction?.label, item.material_source_name, formatDateTime(item.material_time), item.material_summary]
              .filter(Boolean)
              .join(" · ")}
          />
        );
      })}
    </SectionCard>
  );
}
