import { Tag } from "antd";
import type {
  TrackCandidate,
  TrackCycle,
  TrackIndustryPhase,
  TrackMarketPhase
} from "../../../types/api";

export const trackWindowOptions = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" }
];

/** 归档 = 软删除，等同回收站，不进任何默认列表。 */
export const ARCHIVED_STATUS = "archived";

// 跟踪中排在候选之前：列表最常看的是正在跟的那几条，候选是往里补的池子。
export const thesisStatusOptions = [
  { value: "active", label: "跟踪中" },
  { value: "candidate", label: "候选" },
  { value: ARCHIVED_STATUS, label: "归档" }
];

// 枚举一律英文码入库，中文只出现在这一层：换文案不用动后端，也不用改库里的存量值。
// 产业阶段和市场阶段是两套独立的枚举，不要再合成一个 stage。
export const industryPhaseOptions: { value: TrackIndustryPhase; label: string }[] = [
  { value: "intro", label: "导入期" },
  { value: "expansion", label: "扩张期" },
  { value: "mature", label: "成熟期" },
  { value: "contraction", label: "收缩期" }
];

export const marketPhaseOptions: { value: TrackMarketPhase; label: string }[] = [
  { value: "latent", label: "潜伏" },
  { value: "start", label: "启动" },
  { value: "ferment", label: "发酵" },
  { value: "accelerate", label: "加速" },
  { value: "climax", label: "高潮" },
  { value: "divergence", label: "分歧" },
  { value: "recede", label: "退潮" }
];

export const cycleOptions: { value: TrackCycle; label: string }[] = [
  { value: "short", label: "短期" },
  { value: "mid", label: "中期" },
  { value: "long", label: "长期" }
];

function optionLabel<T extends string>(options: { value: T; label: string }[], value?: string | null) {
  if (!value) return "-";
  return options.find((item) => item.value === value)?.label || value;
}

export const industryPhaseLabel = (value?: string | null) => optionLabel(industryPhaseOptions, value);
export const marketPhaseLabel = (value?: string | null) => optionLabel(marketPhaseOptions, value);
export const cycleLabel = (value?: string | null) => optionLabel(cycleOptions, value);

// 评级越高越暖：S 红、A 橙、B 蓝、C/D 灰。和热度档位共用一套冷暖，两个角标并排时
// 颜色差异表达的是"强弱"，不是"两个不同的维度"。
export function gradeTagColor(grade?: string | null) {
  if (grade === "S") return "red";
  if (grade === "A") return "orange";
  if (grade === "B") return "blue";
  return "default";
}

export function heatTierTagColor(tier?: string | null) {
  if (tier === "T0") return "red";
  if (tier === "T1") return "orange";
  if (tier === "T2") return "blue";
  return "default";
}

/**
 * 赛道卡的两个角标：评级说"值不值得配研究精力"，热度档位说"市场是不是已经在交易它"。
 * 两者经常背离，S 级 T4 是还没被发现，C 级 T0 是正在被炒作，所以必须并排显示，
 * 不能合成一个综合角标。
 */
export function TrackGradeTags({
  grade,
  tier,
  score
}: {
  grade?: string | null;
  tier?: string | null;
  score?: number | null;
}) {
  if (!grade) return <Tag color="default">待研究</Tag>;
  return (
    <span className="track-grade-tags">
      <Tag color={gradeTagColor(grade)}>
        {grade}
        {typeof score === "number" ? ` ${score.toFixed(1)}` : ""}
      </Tag>
      {tier ? <Tag color={heatTierTagColor(tier)}>{tier}</Tag> : null}
    </span>
  );
}

export const confidenceOptions = [
  { value: "low", label: "low" },
  { value: "medium", label: "medium" },
  { value: "high", label: "high" }
];

export function formatTime(value?: string | null) {
  if (!value) return "-";
  return value.replace("T", " ").slice(0, 19);
}

export function StatusTag({ status }: { status?: string | null }) {
  const color = status === "active" ? "green" : status === ARCHIVED_STATUS ? "default" : "blue";
  const label = thesisStatusOptions.find((item) => item.value === status)?.label || status || "未知";
  return <Tag color={color}>{label}</Tag>;
}

export function DirectionTag({ direction }: { direction?: string | null }) {
  const color = directionTagColor(direction);
  const label = directionLabel(direction);
  return <Tag color={color}>{label}</Tag>;
}

export function directionLabel(direction?: string | null) {
  return direction === "support" ? "支持" : direction === "weaken" ? "削弱" : direction === "noise" ? "噪音" : "中性";
}

export function directionTagColor(direction?: string | null) {
  return direction === "support" ? "green" : direction === "weaken" ? "red" : direction === "noise" ? "default" : "blue";
}

export function directionAccentColor(direction?: string | null) {
  if (direction === "support") return "#16a34a";
  if (direction === "weaken") return "#dc2626";
  if (direction === "noise") return "#64748b";
  if (direction === "neutral") return "#2563eb";
  return "var(--ll-accent)";
}

export function candidateTitle(candidate: TrackCandidate) {
  return candidate.tag?.name || "未命名赛道";
}
