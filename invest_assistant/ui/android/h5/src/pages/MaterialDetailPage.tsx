import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { mobileApi } from "../api/mobileApi";
import { MarkdownBody } from "../components/MarkdownBody";
import { ErrorState, LoadingState } from "../components/Ui";
import { DetailFrame } from "./DetailPages";
import type { MaterialOwner } from "../components/MaterialCard";
import type { StockMaterialDetail, TrackMaterialDetail } from "../types/api";
import { formatDateTime } from "../utils/format";
import { materialDirectionPresentation } from "../utils/materialDirection";

const IMPORTANCE_LABELS: Record<string, string> = { high: "重要度 高", medium: "重要度 中", low: "重要度 低" };
const STATUS_LABELS: Record<string, string> = { pending: "待研判", confirmed: "已确认", ignored: "已忽略" };

/**
 * 材料详情：看板信息流和两个实体详情的材料卡都点到这里。
 * 卡片上只有标题和两行摘要，全文、原文外链和研判信息都收在这一页。
 */
export function MaterialDetailPage() {
  const params = useParams();
  const owner: MaterialOwner = params.owner === "stock" ? "stock" : "track";
  const id = Number(params.id);
  const navigate = useNavigate();
  const query = useQuery<TrackMaterialDetail | StockMaterialDetail>({
    queryKey: ["material-detail", owner, id],
    queryFn: () => (owner === "stock" ? mobileApi.stockMaterialDetail(id) : mobileApi.trackMaterialDetail(id))
  });

  if (query.isLoading) return <DetailFrame title="材料详情"><LoadingState /></DetailFrame>;
  if (query.isError || !query.data) {
    return <DetailFrame title="材料详情"><ErrorState onRetry={() => void query.refetch()} /></DetailFrame>;
  }

  const material = query.data;
  const stock = owner === "stock" ? (material as StockMaterialDetail) : null;
  const track = owner === "track" ? (material as TrackMaterialDetail) : null;
  const direction = materialDirectionPresentation(stock ? stock.impact_direction : track?.direction);
  const entityName = stock ? stock.stock_name : track?.track_name;
  const entityPath = stock ? (stock.stock_id ? `/stocks/${stock.stock_id}` : null) : (track?.track_id ? `/tracks/${track.track_id}` : null);
  const metadata = [
    material.material_source_name?.trim(),
    material.material_time ? formatDateTime(material.material_time) : undefined,
    stock?.disclosure_type?.trim(),
    stock?.report_period?.trim()
  ].filter(Boolean).join(" · ") || "--";
  const tags = [
    material.status ? STATUS_LABELS[material.status] ?? material.status : undefined,
    material.importance_level ? IMPORTANCE_LABELS[material.importance_level] : undefined
  ].filter(Boolean) as string[];

  return (
    <DetailFrame title="材料详情">
      <article className="material-detail">
        <header className="material-detail__entity">
          {entityPath ? (
            <button type="button" onClick={() => navigate(entityPath)}>
              {entityName?.trim() || (owner === "stock" ? "标的" : "赛道")}
              {stock?.stock_code ? <span>{stock.stock_code}</span> : null}
            </button>
          ) : <strong>{entityName?.trim() || "--"}</strong>}
          {direction ? (
            <em className={`material-direction material-direction--${direction.tone}`}>{direction.label}</em>
          ) : null}
        </header>
        <h2>{material.material_title?.trim() || "未命名材料"}</h2>
        <p className="material-detail__meta">{metadata}</p>
        {tags.length ? <div className="material-detail__tags">{tags.map((tag) => <span key={tag}>{tag}</span>)}</div> : null}
        {/* 笔记正文是 Markdown，资讯正文是纯文本，公告正文没入库，这时只能靠原文链接。 */}
        {material.material_content?.trim() ? (
          material.material_type === "knowledge_note"
            ? <MarkdownBody content={material.material_content} />
            : <p className="material-detail__content">{material.material_content}</p>
        ) : (
          <p className="material-detail__content material-detail__content--empty">
            {material.material_type === "company_disclosure" ? "公告正文未入库，点下方链接看原文。" : "这条材料没有正文。"}
          </p>
        )}
        {material.note?.trim() ? (
          <section className="material-detail__note">
            <h3>研判备注</h3>
            <p>{material.note}</p>
          </section>
        ) : null}
        {material.material_url ? (
          <a className="material-detail__source" href={material.material_url} target="_blank" rel="noreferrer">
            查看原文 <ExternalLink size={15} />
          </a>
        ) : null}
      </article>
    </DetailFrame>
  );
}
