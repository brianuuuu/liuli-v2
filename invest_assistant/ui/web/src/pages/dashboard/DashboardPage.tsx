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
import { getAlertEventStats } from "../../api/alerts";
import { getAiLogs } from "../../api/console";
import { STOCK_EVENT_REVIEW_JOB_NAME, TRACK_EVENT_REVIEW_JOB_NAME, listJobs, listRunRequests, runJob } from "../../api/jobs";
import {
  getHotwordStats,
  getSourceItemDailyStats,
  listAiTagSuggestions,
  listMarketTags
} from "../../api/marketRadar";
import { listReports, getReportContent } from "../../api/reports";
import { listAllStockMaterials, listStockPool } from "../../api/stockAnalysis";
import { getTrackDashboard, listTracks } from "../../api/trackDiscovery";
import { ChartCard } from "../../components/charts/ChartCard";
import { chartGridColor, chartTextColor } from "../../components/charts/chartTheme";
import { EmptyAction } from "../../components/common/EmptyAction";
import { PageHeader } from "../../components/common/PageHeader";
import { WorkbenchCard } from "../../components/common/WorkbenchCard";
import { ModuleTabs } from "../../components/layout/ModuleTabs";
import { useAsyncData } from "../../hooks/useAsyncData";
import type { JobConfig, Report } from "../../types/api";

const todayLoaderInitialTrackDashboard = {
  summary: {
    warming_tracks_count: 0,
    focus_tracks_count: 0,
    pending_materials_count: 0,
    top_heat_track: null
  },
  heat_trends: [],
  heat_rankings: [],
  focus_tracks: [],
  latest_materials: [],
  default_track_id: null,
  analysis_summary: null
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

function isToday(value?: string | null) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 10) === new Date().toISOString().slice(0, 10);
  }
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

function isActiveStatus(status?: string | null) {
  return !["disabled", "archived", "ignored", "rejected", "inactive"].includes(String(status || "").toLowerCase());
}

function failedTaskCount(jobs: JobConfig[]) {
  return jobs.filter((job) => ["failed", "error"].includes(String(job.last_status || "").toLowerCase())).length;
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
  const sourceStats = useAsyncData(useCallback(getSourceItemDailyStats, []), {
    total: 0,
    news: 0,
    announcement: 0,
    sentiment: 0,
    report: 0
  });
  const tags = useAsyncData(useCallback(listMarketTags, []), []);
  const hotwordStats = useAsyncData(useCallback(getHotwordStats, []), { total: 0, active: 0, today: 0 });
  const stockPool = useAsyncData(useCallback(listStockPool, []), []);
  const tracks = useAsyncData(useCallback(() => listTracks(), []), []);
  const aiLogs = useAsyncData(useCallback(getAiLogs, []), []);
  const pendingSuggestions = useAsyncData(useCallback(() => listAiTagSuggestions("pending", { limit: 1, offset: 0 }), []), {
    items: [],
    total: 0,
    limit: 1,
    offset: 0,
    has_more: false
  });
  const trackDashboard = useAsyncData(useCallback(getTrackDashboard, []), todayLoaderInitialTrackDashboard);
  const pendingStockMaterials = useAsyncData(useCallback(() => listAllStockMaterials({ status: "pending", limit: 1, offset: 0 }), []), {
    items: [],
    total: 0,
    limit: 1,
    offset: 0,
    has_more: false
  });
  const alertStats = useAsyncData(useCallback(getAlertEventStats, []), { total: 0, unread: 0, read: 0, handled: 0, unhandled: 0 });
  const jobs = useAsyncData(useCallback(listJobs, []), []);
  const requests = useAsyncData(useCallback(async () => (await listRunRequests({ limit: 8, offset: 0 })).items, []), []);

  const todaySourceCounts = sourceStats.data;
  const todayAiLogs = useMemo(() => aiLogs.data.filter((item) => isToday(item.created_at)), [aiLogs.data]);
  const todayTokenCount = useMemo(
    () => todayAiLogs.reduce((sum, item) => sum + Number(item.total_tokens || 0), 0),
    [todayAiLogs]
  );
  const pendingSuggestionCount = pendingSuggestions.data.total;
  const stockPendingCount = pendingStockMaterials.data.total;
  const unreadAlertCount = alertStats.data.unread;

  const todoTotalCount = pendingSuggestionCount
    + Number(trackDashboard.data.summary.pending_materials_count || 0)
    + stockPendingCount
    + unreadAlertCount
    + failedTaskCount(jobs.data);

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
            { key: "source", label: "信息流", value: todaySourceCounts.total, loading: sourceStats.loading, icon: <DatabaseOutlined />, color: "#2563eb" },
            { key: "news", label: "新闻", value: todaySourceCounts.news, loading: sourceStats.loading, icon: <GlobalOutlined />, color: "#0891b2" },
            { key: "announcement", label: "公告", value: todaySourceCounts.announcement, loading: sourceStats.loading, icon: <NotificationOutlined />, color: "#7c3aed" },
            { key: "sentiment", label: "舆情", value: todaySourceCounts.sentiment, loading: sourceStats.loading, icon: <MessageOutlined />, color: "#ea580c" },
            { key: "report", label: "研报摘要", value: todaySourceCounts.report, loading: sourceStats.loading, icon: <FileSearchOutlined />, color: "#db2777" },
            { key: "hotword-new", label: "热词", value: hotwordStats.data.today, loading: hotwordStats.loading, icon: <FireOutlined />, color: "#dc2626" }
          ]}
        />
        <MetricGroup
          title="活跃"
          columns={2}
          items={[
            { key: "tags", label: "标签", value: tags.data.filter((item) => item.status === "active").length, loading: tags.loading, icon: <TagOutlined />, color: "#64748b" },
            { key: "hotwords", label: "热词", value: hotwordStats.data.active, loading: hotwordStats.loading, icon: <FireOutlined />, color: "#d97706" },
            { key: "stocks", label: "标的", value: stockPool.data.filter((item) => isActiveStatus(item.status)).length, loading: stockPool.loading, icon: <AimOutlined />, color: "#4f46e5" },
            { key: "tracks", label: "赛道", value: tracks.data.filter((item) => isActiveStatus(item.status)).length, loading: tracks.loading, icon: <RadarChartOutlined />, color: "#059669" }
          ]}
        />
        <MetricGroup
          title="统计"
          columns={2}
          items={[
            { key: "ai-count", label: "AI 操作", value: todayAiLogs.length, loading: aiLogs.loading, icon: <RobotOutlined />, color: "#0284c7" },
            { key: "ai-token", label: "Token", value: todayTokenCount, loading: aiLogs.loading, icon: <ThunderboltOutlined />, color: "#8b5cf6" },
            { key: "todo-alert", label: "未读预警", value: unreadAlertCount, loading: alertStats.loading, icon: <WarningOutlined />, color: "#e11d48" },
            { key: "todo-total", label: "待办队列", value: todoTotalCount, loading: pendingSuggestions.loading || trackDashboard.loading || pendingStockMaterials.loading || alertStats.loading || jobs.loading, icon: <CarryOutOutlined />, color: "#d97706" }
          ]}
        />
      </div>

      <div className="workbench-dashboard-grid">
        <ChartCard title="今日信息流结构" option={sourceChartOption} height={260} />

        <WorkbenchCard title="最近执行记录">
          <Table
            rowKey="id"
            size="small"
            loading={requests.loading}
            dataSource={requests.data.slice(0, 8)}
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
  const jobs = useAsyncData(useCallback(listJobs, []), []);
  const pendingSuggestions = useAsyncData(useCallback(() => listAiTagSuggestions("pending", { limit: 1, offset: 0 }), []), {
    items: [],
    total: 0,
    limit: 1,
    offset: 0,
    has_more: false
  });
  const trackDashboard = useAsyncData(useCallback(getTrackDashboard, []), todayLoaderInitialTrackDashboard);
  const pendingStockMaterials = useAsyncData(useCallback(() => listAllStockMaterials({ status: "pending", limit: 1, offset: 0 }), []), {
    items: [],
    total: 0,
    limit: 1,
    offset: 0,
    has_more: false
  });
  const alertStats = useAsyncData(useCallback(getAlertEventStats, []), { total: 0, unread: 0, read: 0, handled: 0, unhandled: 0 });
  const [runningKey, setRunningKey] = useState<string | null>(null);

  const jobByName = useMemo(() => new Map(jobs.data.map((job) => [job.job_name, job])), [jobs.data]);
  const stockPendingCount = pendingStockMaterials.data.total;
  const pendingSuggestionCount = pendingSuggestions.data.total;

  const operations = [
    {
      key: "track-material-review",
      name: "一键 AI 审核赛道材料",
      pending: trackDashboard.data.summary.pending_materials_count,
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
    { key: "track-materials", label: "赛道材料处理", count: trackDashboard.data.summary.pending_materials_count, path: "/track-discovery", icon: <RadarChartOutlined />, color: "#059669" },
    { key: "stock-materials", label: "标的材料处理", count: stockPendingCount, path: "/stock-analysis", icon: <AimOutlined />, color: "#4f46e5" },
    { key: "alerts", label: "未读预警处理", count: alertStats.data.unread, path: "/alerts", icon: <WarningOutlined />, color: "#e11d48" },
    { key: "jobs", label: "失败任务排查", count: failedTaskCount(jobs.data), path: "/console", icon: <HistoryOutlined />, color: "#dc2626" }
  ];

  async function runOperation(operation: { key: string; jobName: string | null }) {
    if (!operation.jobName) return;
    setRunningKey(operation.key);
    try {
      await runJob(operation.jobName, {});
      message.success("已提交执行请求");
      await jobs.refresh();
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
                ? jobByName.has(item.jobName) || [STOCK_EVENT_REVIEW_JOB_NAME, TRACK_EVENT_REVIEW_JOB_NAME].includes(item.jobName)
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
