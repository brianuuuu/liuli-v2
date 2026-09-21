import { formatDateTime } from "../utils/format";
import { materialDirectionPresentation } from "../utils/materialDirection";

/** 材料归属哪个模块，决定材料详情走 track-discovery 还是 stock-analysis 的接口。 */
export type MaterialOwner = "track" | "stock";

export type MaterialCardItem = {
  /** 材料关联记录 id，也是材料详情接口的 id，不是 source_item / note 的 id。 */
  id: number;
  owner: MaterialOwner;
  /** 只有信息流传：详情页里材料本来就属于当前赛道或标的，重复写一遍是噪音。 */
  entityName?: string | null;
  entityCode?: string | null;
  direction?: string | null;
  title?: string | null;
  summary?: string | null;
  sourceName?: string | null;
  materialTime?: string | null;
};

/**
 * 看板信息流、赛道详情、标的详情共用的材料卡。三处都是"标题 + 方向标 / 两行摘要 / 来源时间"，
 * 整卡点进材料详情看全文和原文，列表态不再挂"原文"外链。
 */
export function MaterialCard({ item, onOpen }: { item: MaterialCardItem; onOpen: (item: MaterialCardItem) => void }) {
  const direction = materialDirectionPresentation(item.direction);
  const badge = direction ? (
    <em className={`material-direction material-direction--${direction.tone}`}>{direction.label}</em>
  ) : null;
  const metadata = [
    item.sourceName?.trim(),
    item.materialTime ? formatDateTime(item.materialTime) : undefined
  ].filter(Boolean).join(" · ") || "--";
  return (
    <button type="button" className="material-card" onClick={() => onOpen(item)}>
      {/* 方向标始终贴在卡片首行右上角：有实体名时跟实体名一行，没有就跟标题一行。 */}
      {item.entityName ? (
        <span className="material-card__entity">
          <strong>{item.entityName.trim() || "--"}</strong>
          {item.entityCode ? <span>{item.entityCode}</span> : null}
          {badge}
        </span>
      ) : null}
      <h3>
        <span>{item.title?.trim() || "--"}</span>
        {item.entityName ? null : badge}
      </h3>
      {item.summary?.trim() ? <p>{item.summary}</p> : null}
      <footer>{metadata}</footer>
    </button>
  );
}

export function materialDetailPath(item: MaterialCardItem) {
  return `/materials/${item.owner}/${item.id}`;
}
