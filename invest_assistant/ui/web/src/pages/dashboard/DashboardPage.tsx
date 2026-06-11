import {
  FileTextOutlined,
  PlayCircleOutlined,
  RobotOutlined,
  DatabaseOutlined,
  GlobalOutlined,
  NotificationOutlined,
  MessageOutlined,
  FileSearchOutlined,
  FireOutlined,
  TagOutlined,
  AimOutlined,
  RadarChartOutlined,
  ThunderboltOutlined,
  CarryOutOutlined,
  WarningOutlined,
  HistoryOutlined,
  AuditOutlined,
  FilterOutlined,
  BranchesOutlined
} from "@ant-design/icons";
import { Button, Drawer, Space, Statistic, Table, Tag, Typography, message } from "antd";
import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { moduleTabs } from "../../app/navigation";
import { useLiuliTheme } from "../../app/theme";
import { getWorkbenchToday } from "../../api/console";
import { STOCK_EVENT_REVIEW_JOB_NAME, TRACK_EVENT_REVIEW_JOB_NAME, runJob } from "../../api/jobs";
import { listReports, getReportContent } from "../../api/reports";
import { ChartCard } from "../../components/charts/ChartCard";
import { chartGridColor, chartTextColor } from "../../components/charts/chartTheme";
import { EmptyAction } from "../../components/common/EmptyAction";
import { PageHeader } from "../../components/common/PageHeader";
import { WorkbenchCard } from "../../components/common/WorkbenchCard";
import { ModuleTabs } from "../../components/layout/ModuleTabs";
import { useAsyncData } from "../../hooks/useAsyncData";
import type { Report } from "../../types/api";

const initialWorkbenchToday = {
  source_stats: {
    total: 0,
    news: 0,
    announcement: 0,
    sentiment: 0,
    report: 0
  },
  active: {
    tags: 0,
    hotwords: 0,
    stocks: 0,
    tracks: 0
  },
  new: {
    hotwords: 0
  },
  ai: {
    today: 0,
    today_tokens: 0
  },
  todo: {
    pending_suggestions: 0,
    pending_track_materials: 0,
    pending_stock_materials: 0,
    unread_alerts: 0,
    failed_jobs: 0,
    total: 0
  },
  operation_jobs: [],
  recent_run_requests: []
};

const sourceTypeGroups = {
  news: ["news"],
  announcement: ["announcement", "financial"],
  sentiment: ["sentiment"],
  report: ["research", "research_report", "report", "report_summary"]
};

const reportTypeLabels: Record<string, string> = {
  news: "新闻",
  announcement: "公告",
  sentiment: "舆情",
  report: "研报摘要"
};

function formatTime(value?: string | null) {
  if (!value) return "-";
  return value.replace("T", " ").slice(0, 19);
}

function reportMatches(record: Report, kind: "track" | "stock") {
  const text = `${record.source_module || ""} ${record.report_type || ""} ${record.target_type || ""}`.toLowerCase();
  if (kind === "track") return text.includes("track") || text.includes("赛道");
  return text.includes("stock") || text.includes("标的");
}

type MetricItem = {
  key: string;
  label: string;
  value: number | string;
  loading?: boolean;
  icon?: React.ReactNode;
  color?: string;
};

function MetricTile({ label, value, loading, icon, color }: Omit<MetricItem, "key">) {
  return (
    <div className="workbench-metric-tile-premium">
      {icon && (
        <div className="workbench-metric-icon-wrapper" style={{ backgroundColor: `${color}12`, color: color }}>
          {icon}
        </div>
      )}
      <div className="workbench-metric-content">
        <div className="workbench-metric-label">{label}</div>
        <div className="workbench-metric-value">
          {loading ? <span className="workbench-metric-loading">...</span> : value}
        </div>
      </div>
    </div>
  );
}

function MetricGroup({ title, items, columns = 3 }: { title: string; items: MetricItem[]; columns?: number }) {
  return (
    <WorkbenchCard title={title}>
      <div className={`workbench-metric-grid cols-${columns}`}>
        {items.map((item) => (
          <MetricTile
            key={item.key}
            label={item.label}
            value={item.value}
            loading={item.loading}
            icon={item.icon}
            color={item.color}
          />
        ))}
      </div>
    </WorkbenchCard>
  );
}

function TodayDashboardSection() {
  const { resolvedMode } = useLiuliTheme();
  const today = useAsyncData(useCallback(getWorkbenchToday, []), initialWorkbenchToday);

  const todaySourceCounts = today.data.source_stats;

  const sourceChartOption = useMemo(() => {
    const labels = Object.keys(sourceTypeGroups) as Array<keyof typeof sourceTypeGroups>;
    return {
      tooltip: { trigger: "axis" },
      grid: { left: 32, right: 18, top: 20, bottom: 32 },
      xAxis: {
        type: "category",
        data: labels.map((key) => reportTypeLabels[key]),
        axisLabel: { color: chartTextColor(resolvedMode) },
        axisLine: { lineStyle: { color: chartGridColor(resolvedMode) } }
      },
      yAxis: {
        type: "value",
        minInterval: 1,
        axisLabel: { color: chartTextColor(resolvedMode) },
        splitLine: { lineStyle: { color: chartGridColor(resolvedMode) } }
      },
      series: [
        {
          type: "bar",
          barWidth: 34,
          data: labels.map((key) => todaySourceCounts[key]),
          itemStyle: { color: "#2563eb", borderRadius: [4, 4, 0, 0] }
        }
      ]
    };
  }, [resolvedMode, todaySourceCounts]);

  return (
    <div className="workbench-dashboard">
      <div className="workbench-metric-sections">
        <MetricGroup
          title="新增"
          columns={3}
          items={[
            { key: "source", label: "信息流", value: todaySourceCounts.total, loading: today.loading, icon: <DatabaseOutlined />, color: "#2563eb" },
            { key: "news", label: "新闻", value: todaySourceCounts.news, loading: today.loading, icon: <GlobalOutlined />, color: "#0891b2" },
            { key: "announcement", label: "公告", value: todaySourceCounts.announcement, loading: today.loading, icon: <NotificationOutlined />, color: "#7c3aed" },
            { key: "sentiment", label: "舆情", value: todaySourceCounts.sentiment, loading: today.loading, icon: <MessageOutlined />, color: "#ea580c" },
            { key: "report", label: "研报摘要", value: todaySourceCounts.report, loading: today.loading, icon: <FileSearchOutlined />, color: "#db2777" },
            { key: "hotword-new", label: "热词", value: today.data.new.hotwords, loading: today.loading, icon: <FireOutlined />, color: "#dc2626" }
          ]}
        />
        <MetricGroup
          title="活跃"
          columns={2}
          items={[
            { key: "tags", label: "标签", value: today.data.active.tags, loading: today.loading, icon: <TagOutlined />, color: "#64748b" },
            { key: "hotwords", label: "热词", value: today.data.active.hotwords, loading: today.loading, icon: <FireOutlined />, color: "#d97706" },
            { key: "stocks", label: "标的", value: today.data.active.stocks, loading: today.loading, icon: <AimOutlined />, color: "#4f46e5" },
            { key: "tracks", label: "赛道", value: today.data.active.tracks, loading: today.loading, icon: <RadarChartOutlined />, color: "#059669" }
          ]}
        />
        <MetricGroup
          title="统计"
          columns={2}
          items={[
            { key: "ai-count", label: "AI 操作", value: today.data.ai.today, loading: today.loading, icon: <RobotOutlined />, color: "#0284c7" },
            { key: "ai-token", label: "Token", value: today.data.ai.today_tokens, loading: today.loading, icon: <ThunderboltOutlined />, color: "#8b5cf6" },
            { key: "todo-alert", label: "未读预警", value: today.data.todo.unread_alerts, loading: today.loading, icon: <WarningOutlined />, color: "#e11d48" },
            { key: "todo-total", label: "待办队列", value: today.data.todo.total, loading: today.loading, icon: <CarryOutOutlined />, color: "#d97706" }
          ]}
        />
      </div>

      <div className="workbench-dashboard-grid">
        <ChartCard title="今日信息流结构" option={sourceChartOption} height={260} />

        <WorkbenchCard title="最近执行记录">
          <Table
            rowKey="id"
            size="small"
            loading={today.loading}
            dataSource={today.data.recent_run_requests}
            pagination={false}
            columns={[
              { title: "任务", dataIndex: "job_name", ellipsis: true },
              { title: "状态", dataIndex: "status", width: 100, render: (value) => <Tag>{value || "-"}</Tag> },
              { title: "提交时间", dataIndex: "requested_at", width: 170, render: formatTime },
              { title: "完成时间", dataIndex: "finished_at", width: 170, render: formatTime }
            ]}
            locale={{ emptyText: <EmptyAction description="暂无执行记录" /> }}
          />
        </WorkbenchCard>
      </div>
    </div>
  );
}

function OperationsPanelSection() {
  const navigate = useNavigate();
  const workbench = useAsyncData(useCallback(getWorkbenchToday, []), initialWorkbenchToday);
  const [runningKey, setRunningKey] = useState<string | null>(null);

  const jobByName = useMemo(() => new Map(workbench.data.operation_jobs.map((job) => [job.job_name, job])), [workbench.data.operation_jobs]);
  const stockPendingCount = workbench.data.todo.pending_stock_materials;
  const trackPendingCount = workbench.data.todo.pending_track_materials;
  const pendingSuggestionCount = workbench.data.todo.pending_suggestions;

  const operations = [
    {
      key: "track-material-review",
      name: "一键 AI 审核赛道材料",
      pending: trackPendingCount,
      jobName: TRACK_EVENT_REVIEW_JOB_NAME,
      lastRunAt: jobByName.get(TRACK_EVENT_REVIEW_JOB_NAME)?.last_run_at,
      icon: <AuditOutlined />,
      color: "#059669"
    },
    {
      key: "stock-material-review",
      name: "一键 AI 审核标的材料",
      pending: stockPendingCount,
      jobName: STOCK_EVENT_REVIEW_JOB_NAME,
      lastRunAt: jobByName.get(STOCK_EVENT_REVIEW_JOB_NAME)?.last_run_at,
      icon: <AuditOutlined />,
      color: "#4f46e5"
    },
    {
      key: "ai-hotword-screen",
      name: "AI 筛选热词",
      pending: pendingSuggestionCount,
      jobName: "market_radar.extract_daily_hotwords_deepseek",
      lastRunAt: jobByName.get("market_radar.extract_daily_hotwords_deepseek")?.last_run_at,
      icon: <FilterOutlined />,
      color: "#d97706"
    },
    {
      key: "ai-hotword-merge",
      name: "AI 热词合并建议",
      pending: pendingSuggestionCount,
      jobName: "market_radar.suggest_hotword_merges_deepseek",
      lastRunAt: jobByName.get("market_radar.suggest_hotword_merges_deepseek")?.last_run_at,
      icon: <BranchesOutlined />,
      color: "#7c3aed"
    }
  ];

  const todoEntries = [
    { key: "suggestions", label: "AI 推荐词审核", count: pendingSuggestionCount, path: "/market-radar", icon: <TagOutlined />, color: "#2563eb" },
    { key: "track-materials", label: "赛道材料处理", count: trackPendingCount, path: "/track-discovery", icon: <RadarChartOutlined />, color: "#059669" },
    { key: "stock-materials", label: "标的材料处理", count: stockPendingCount, path: "/stock-analysis", icon: <AimOutlined />, color: "#4f46e5" },
    { key: "alerts", label: "未读预警处理", count: workbench.data.todo.unread_alerts, path: "/alerts", icon: <WarningOutlined />, color: "#e11d48" },
    { key: "jobs", label: "失败任务排查", count: workbench.data.todo.failed_jobs, path: "/console", icon: <HistoryOutlined />, color: "#dc2626" }
  ];

  async function runOperation(operation: { key: string; jobName: string | null }) {
    if (!operation.jobName) return;
    setRunningKey(operation.key);
    try {
      await runJob(operation.jobName, {});
      message.success("已提交执行请求");
      await workbench.refresh();
    } catch {
      message.error("执行请求提交失败");
    } finally {
      setRunningKey(null);
    }
  }

  return (
    <div className="workbench-dashboard">
      <div className="workbench-action-grid">
        <WorkbenchCard title="待办入口">
          <div className="workbench-entry-column">
            {todoEntries.map((item) => (
              <button className="workbench-entry-card-premium" key={item.key} type="button" onClick={() => navigate(item.path)}>
                <div className="entry-left">
                  {item.icon && (
                    <div className="entry-icon-wrapper" style={{ backgroundColor: `${item.color}12`, color: item.color }}>
                      {item.icon}
                    </div>
                  )}
                  <span>{item.label}</span>
                </div>
                <span className="entry-count">{item.count}</span>
              </button>
            ))}
          </div>
        </WorkbenchCard>

        <WorkbenchCard title="AI 控制面板">
          <div className="workbench-control-grid">
            {operations.map((item) => {
              const jobExists = item.jobName
                ? jobByName.get(item.jobName)?.exists
                : false;
              const disabled = !item.jobName || !jobExists;
              const hasPending = item.pending > 0;
              return (
                <div className="workbench-control-card-premium" key={item.key}>
                  <div className="workbench-control-header">
                    <div className="workbench-control-title-premium">
                      <span style={{ color: item.color }}>{item.icon}</span>
                      <span>{item.name}</span>
                    </div>
                    <div className={`workbench-control-status-badge ${hasPending ? 'pending' : 'clean'}`}>
                      {hasPending ? `待处理 ${item.pending}` : '已清空'}
                    </div>
                  </div>
                  <div className="workbench-control-footer-premium">
                    <div className="workbench-control-metadata-premium">
                      <div className="meta-item">
                        最近运行: <span>{formatTime(item.lastRunAt)}</span>
                      </div>
                    </div>
                    <Button
                      size="small"
                      icon={<PlayCircleOutlined />}
                      loading={runningKey === item.key}
                      disabled={disabled}
                      onClick={() => runOperation(item)}
                    >
                      {!item.jobName ? "待实现" : jobExists ? "执行" : "未接入"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </WorkbenchCard>
      </div>

    </div>
  );
}

function ReportTable({ title, rows, loading, onOpen }: { title: string; rows: Report[]; loading: boolean; onOpen: (record: Report) => void }) {
  return (
    <WorkbenchCard title={title}>
      <Table
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={rows}
        pagination={false}
        columns={[
          { title: "标题", dataIndex: "title", ellipsis: true },
          { title: "类型", dataIndex: "report_type", width: 120 },
          { title: "状态", dataIndex: "status", width: 90, render: (value) => <Tag>{value || "-"}</Tag> },
          { title: "时间", dataIndex: "created_at", width: 160, render: formatTime },
          {
            title: "阅读",
            width: 88,
            render: (_, record) => (
              <Button size="small" icon={<FileTextOutlined />} onClick={() => onOpen(record)}>
                打开
              </Button>
            )
          }
        ]}
        locale={{ emptyText: <EmptyAction description={`暂无${title}`} /> }}
      />
    </WorkbenchCard>
  );
}

function LatestReportsSection() {
  const reports = useAsyncData(useCallback(async () => (await listReports({ limit: 100, offset: 0 })).items, []), []);
  const [activeReport, setActiveReport] = useState<Report | null>(null);
  const [content, setContent] = useState("");
  const [contentLoading, setContentLoading] = useState(false);

  const trackReports = useMemo(() => reports.data.filter((item) => reportMatches(item, "track")).slice(0, 10), [reports.data]);
  const stockReports = useMemo(() => reports.data.filter((item) => reportMatches(item, "stock")).slice(0, 10), [reports.data]);

  async function openReport(record: Report) {
    setActiveReport(record);
    setContent("");
    if (!record.file_path) {
      setContent("暂无可读文件路径。");
      return;
    }
    setContentLoading(true);
    try {
      setContent(await getReportContent(record.id));
    } catch {
      setContent("报告文件不存在或无法读取。");
    } finally {
      setContentLoading(false);
    }
  }

  return (
    <>
      <div className="workbench-dashboard workbench-report-list">
        <ReportTable title="赛道分析报告" rows={trackReports} loading={reports.loading} onOpen={openReport} />
        <ReportTable title="标的分析报告" rows={stockReports} loading={reports.loading} onOpen={openReport} />
      </div>
      <Drawer title={activeReport?.title || "报告阅读"} open={Boolean(activeReport)} onClose={() => setActiveReport(null)} size={760}>
        {activeReport ? (
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            <Typography.Text type="secondary">
              {activeReport.report_type} / {activeReport.source_module} / {formatTime(activeReport.created_at)}
            </Typography.Text>
            <Typography.Paragraph copyable={Boolean(content)} style={{ whiteSpace: "pre-wrap" }}>
              {contentLoading ? "读取中..." : content || "暂无内容"}
            </Typography.Paragraph>
          </Space>
        ) : null}
      </Drawer>
    </>
  );
}

export function DashboardPage() {
  const [activeTab, setActiveTab] = useState("today");

  return (
    <>
      <PageHeader title="工作台" description="看板 · 操作 · 报告" />
      <ModuleTabs activeKey={activeTab} items={moduleTabs.dashboard} onChange={setActiveTab} />
      {activeTab === "actions" ? (
        <OperationsPanelSection />
      ) : activeTab === "reports" ? (
        <LatestReportsSection />
      ) : (
        <TodayDashboardSection />
      )}
    </>
  );
}
