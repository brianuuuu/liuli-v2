import { Button, Space } from "antd";
import type { ReactNode } from "react";

type PortfolioScopeBarProps = {
  value: number | null;
  options: { value: number; label: string }[];
  onChange: (portfolioId: number | null) => void;
  /** 工具栏其余控件（周期、刷新、组合管理按钮等），紧跟在组合按钮之后 */
  children?: ReactNode;
  /** 靠右的控件 */
  extra?: ReactNode;
};

/**
 * 组合管理各页签共用的组合切换条：实盘组合最多三四个，平铺成按钮一点即切，
 * 样式沿用标的池的数据面板工具栏按钮，全站一致。
 */
export function PortfolioScopeBar({ value, options, onChange, children, extra }: PortfolioScopeBarProps) {
  const items = [{ value: null as number | null, label: "所有组合" }, ...options];
  return (
    <div className="data-panel-toolbar portfolio-scope-bar">
      <Space size={4} className="toolbar-status-buttons">
        {items.map((item) => (
          <Button
            key={item.value ?? "all"}
            size="small"
            className={value === item.value ? "toolbar-filter-button active" : "toolbar-filter-button"}
            onClick={() => onChange(item.value)}
          >
            {item.label}
          </Button>
        ))}
      </Space>
      {children}
      {extra ? <div className="portfolio-scope-bar-extra">{extra}</div> : null}
    </div>
  );
}
