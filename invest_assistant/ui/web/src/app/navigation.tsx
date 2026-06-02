import {
  AlertOutlined,
  ApartmentOutlined,
  BarChartOutlined,
  BookOutlined,
  DashboardOutlined,
  FundProjectionScreenOutlined,
  LineChartOutlined,
  SettingOutlined
} from "@ant-design/icons";
import type { ReactNode } from "react";

export type NavItem = {
  key: string;
  label: string;
  path: string;
  icon: ReactNode;
};

export const primaryNavItems: NavItem[] = [
  { key: "dashboard", label: "工作台", path: "/", icon: <DashboardOutlined /> },
  { key: "market-radar", label: "市场雷达", path: "/market-radar", icon: <BarChartOutlined /> },
  { key: "track-discovery", label: "赛道发现", path: "/track-discovery", icon: <ApartmentOutlined /> },
  { key: "stock-analysis", label: "标的分析", path: "/stock-analysis", icon: <LineChartOutlined /> },
  { key: "alerts", label: "预警中心", path: "/alerts", icon: <AlertOutlined /> },
  { key: "portfolio", label: "组合管理", path: "/portfolio", icon: <FundProjectionScreenOutlined /> },
  { key: "knowledge", label: "知识库", path: "/knowledge", icon: <BookOutlined /> },
  { key: "console", label: "控制台", path: "/console", icon: <SettingOutlined /> }
];

export const moduleTabs: Record<string, { key: string; label: string }[]> = {
  dashboard: [
    { key: "today", label: "今日看板" },
    { key: "actions", label: "操作面板" },
    { key: "reports", label: "最新报告" }
  ],
  "market-radar": [
    { key: "overview", label: "市场看板" },
    { key: "flashes", label: "信息流" },
    { key: "rankings", label: "市场热度" },
    { key: "graph", label: "关系图谱" },
    { key: "candidates", label: "AI 推荐词" },
    { key: "hotwords", label: "市场热词" }
  ],
  "track-discovery": [
    { key: "overview", label: "赛道看板" },
    { key: "tracks", label: "赛道库" },
    { key: "materials", label: "赛道动态" },
    { key: "compare", label: "赛道对比" }
  ],
  "stock-analysis": [
    { key: "overview", label: "标的看板" },
    { key: "pool", label: "标的池" },
    { key: "scores", label: "标的事件" },
    { key: "compare", label: "标的对比" }
  ],
  alerts: [
    { key: "events", label: "预警事件" },
    { key: "rules", label: "预警规则" },
    { key: "handled", label: "预警复盘" }
  ],
  portfolio: [
    { key: "portfolios", label: "组合看板" },
    { key: "positions", label: "实盘持仓" },
    { key: "risk", label: "调仓记录" },
    { key: "review", label: "组合复盘" }
  ],
  knowledge: [
    { key: "notes", label: "知识笔记" },
    { key: "prompts", label: "Prompt" },
    { key: "skills", label: "Skills" },
    { key: "agents", label: "Agents" },
    { key: "feedback", label: "反哺记录" }
  ],
  console: [
    { key: "status", label: "系统状态" },
    { key: "jobs", label: "任务中心" },
    { key: "data-sources", label: "数据源" },
    { key: "stocks", label: "股票基础库" },
    { key: "tags", label: "标签索引" },
    { key: "disclosures", label: "公告财报库" },
    { key: "config", label: "系统配置" },
    { key: "ai-logs", label: "AI 审计日志" }
  ]
};
