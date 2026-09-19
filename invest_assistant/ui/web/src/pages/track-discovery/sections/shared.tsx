import { Tag } from "antd";
import type {
  TrackCandidate,
  TrackCycle,
  TrackDirection,
  TrackIndustryPhase,
  TrackMarketPhase,
  TrackResearchPriority,
  TrackStrength
} from "../../../types/api";

export const trackWindowOptions = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" }
];

/** 归档 = 软删除，等同回收站，不进任何默认列表。 */
export const ARCHIVED_STATUS = "archived";

export const thesisStatusOptions = [
  { value: "candidate", label: "候选" },
  { value: "active", label: "跟踪中" },
  { value: "paused", label: "暂停观察" },
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

export const strengthOptions: { value: TrackStrength; label: string }[] = [
  { value: "strong", label: "强" },
  { value: "medium", label: "中" },
  { value: "weak", label: "弱" },
  { value: "insufficient", label: "证据不足" }
];

export const cycleOptions: { value: TrackCycle; label: string }[] = [
  { value: "short", label: "短期" },
  { value: "mid", label: "中期" },
  { value: "long", label: "长期" }
];

export const trendDirectionOptions: { value: TrackDirection; label: string }[] = [
  { value: "strengthening", label: "强化" },
  { value: "stable", label: "平稳" },
  { value: "weakening", label: "弱化" }
];

export const researchPriorityOptions: { value: TrackResearchPriority; label: string }[] = [
  { value: "priority", label: "优先研究" },
  { value: "tracking", label: "持续跟踪" },
  { value: "deprioritized", label: "降低关注" }
];

function optionLabel<T extends string>(options: { value: T; label: string }[], value?: string | null) {
  if (!value) return "-";
  return options.find((item) => item.value === value)?.label || value;
}

export const industryPhaseLabel = (value?: string | null) => optionLabel(industryPhaseOptions, value);
export const marketPhaseLabel = (value?: string | null) => optionLabel(marketPhaseOptions, value);
export const strengthLabel = (value?: string | null) => optionLabel(strengthOptions, value);
export const cycleLabel = (value?: string | null) => optionLabel(cycleOptions, value);
export const trendDirectionLabel = (value?: string | null) => optionLabel(trendDirectionOptions, value);
export const researchPriorityLabel = (value?: string | null) => optionLabel(researchPriorityOptions, value);

export function strengthTagColor(strength?: string | null) {
  if (strength === "strong") return "red";
  if (strength === "medium") return "orange";
  if (strength === "weak") return "blue";
  return "default";
}

/** 赛道卡上的"强 · 长期"：强度对应的是 headline 周期，不代表另外两个周期也是这个强度。 */
export function StrengthCycleTag({ strength, cycle }: { strength?: string | null; cycle?: string | null }) {
  if (!strength) return <Tag color="default">待研究</Tag>;
  return (
    <Tag color={strengthTagColor(strength)}>
      {strengthLabel(strength)}
      {cycle ? ` · ${cycleLabel(cycle)}` : ""}
    </Tag>
  );
}

export function TrendDirectionTag({ direction }: { direction?: string | null }) {
  if (!direction) return <span>-</span>;
  const color = direction === "strengthening" ? "green" : direction === "weakening" ? "red" : "default";
  return <Tag color={color}>{trendDirectionLabel(direction)}</Tag>;
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
  const color = status === "active" ? "green" : status === "paused" ? "gold" : status === ARCHIVED_STATUS ? "default" : "blue";
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
