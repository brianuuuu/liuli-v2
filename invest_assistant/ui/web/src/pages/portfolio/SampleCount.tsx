import { Tooltip } from "antd";

// 样本少于这个数时胜率只作参考，与 portfolio_001 profile 的历史校准门槛一致
export const MIN_SAMPLES = 10;

/** 样本数：不足门槛时数字旁加小标记并悬浮说明，不再整行置灰，数据保持可读 */
export function SampleCount({ value }: { value: number }) {
  if (value <= 0 || value >= MIN_SAMPLES) return <>{value}</>;
  return (
    <Tooltip title={`样本不足 ${MIN_SAMPLES} 条，胜率仅供参考`}>
      <span className="sample-count is-thin">{value}</span>
    </Tooltip>
  );
}
