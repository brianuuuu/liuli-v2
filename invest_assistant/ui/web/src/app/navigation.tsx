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
  { key: "dashboard", label: "总览", path: "/", icon: <DashboardOutlined /> },
  { key: "market-radar", label: "市场雷达", path: "/market-radar", icon: <BarChartOutlined /> },
  { key: "track-discovery", label: "赛道发现", path: "/track-discovery", icon: <ApartmentOutlined /> },
  { key: "stock-analysis", label: "标的分析", path: "/stock-analysis", icon: <LineChartOutlined /> },
  { key: "alerts", label: "预警中心", path: "/alerts", icon: <AlertOutlined /> },
  { key: "portfolio", label: "组合管理", path: "/portfolio", icon: <FundProjectionScreenOutlined /> },
  { key: "knowledge", label: "知识库", path: "/knowledge", icon: <BookOutlined /> },
  { key: "console", label: "控制台", path: "/console", icon: <SettingOutlined /> }
];

export const moduleTabs: Record<string, { key: string; label: string }[]> = {
  "market-radar": [
    { key: "overview", label: "总览" },
    { key: "rankings", label: "热度榜" },
    { key: "sources", label: "市场快讯" },
    { key: "tags", label: "标签" },
    { key: "candidates", label: "候选标签" },
    { key: "graph", label: "关系图" }
  ],
  "track-discovery": [
    { key: "overview", label: "总览" },
    { key: "candidates", label: "候选赛道" },
    { key: "theses", label: "赛道列表" },
    { key: "evidence", label: "证据链" }
  ],
  "stock-analysis": [
    { key: "overview", label: "总览" },
    { key: "pool", label: "标的池" },
    { key: "scores", label: "评分" },
    { key: "reports", label: "分析报告" },
    { key: "compare", label: "对比" }
  ],
  alerts: [
    { key: "events", label: "事件" },
    { key: "rules", label: "规则" },
    { key: "handled", label: "处理记录" }
  ],
  portfolio: [
    { key: "portfolios", label: "组合" },
    { key: "positions", label: "持仓" },
    { key: "risk", label: "风险暴露" },
    { key: "review", label: "复盘" }
  ],
  knowledge: [
    { key: "notes", label: "笔记" },
    { key: "skills", label: "Skills" },
    { key: "agents", label: "Agents" },
    { key: "feedback", label: "反馈日志" }
  ],
  console: [
    { key: "status", label: "系统状态" },
    { key: "jobs", label: "任务中心" },
    { key: "tags", label: "标签库" },
    { key: "tag-candidates", label: "候选标签" },
    { key: "reports", label: "报告库" },
    { key: "disclosures", label: "公告财报库" },
    { key: "stocks", label: "股票基础库" },
    { key: "config", label: "系统配置" },
    { key: "ai-logs", label: "AI 日志" }
  ]
};
