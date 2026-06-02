import {
  FileTextOutlined,
  PlayCircleOutlined,
  RobotOutlined
} from "@ant-design/icons";
import { Button, Drawer, Space, Statistic, Table, Tag, Typography, message } from "antd";
import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { moduleTabs } from "../../app/navigation";
import { useLiuliTheme } from "../../app/theme";
import { listAlertEvents } from "../../api/alerts";
import { getAiLogs } from "../../api/console";
import { listJobs, listRunRequests, runJob } from "../../api/jobs";
import {
  listAiTagSuggestions,
  listHotwords,
  listMarketTags,
  listSourceItems
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

function countSourceTypes(items: Awaited<ReturnType<typeof listSourceItems>>) {
  return Object.fromEntries(
    Object.entries(sourceTypeGroups).map(([key, types]) => [
      key,
      items.filter((item) => types.includes(item.source_type)).length
    ])
  ) as Record<keyof typeof sourceTypeGroups, number>;
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
};

function MetricTile({ label, value, loading }: Omit<MetricItem, "key">) {
  return (
    <div className="workbench-metric-tile">
      <Statistic title={label} value={value} loading={loading} />
    </div>
  );
}

function MetricGroup({ title, items }: { title: string; items: MetricItem[] }) {
  return (
    <WorkbenchCard title={title}>
      <div className="workbench-metric-grid">
        {items.map((item) => (
          <MetricTile key={item.key} label={item.label} value={item.value} loading={item.loading} />
        ))}
      </div>
    </WorkbenchCard>
  );
}

function TodayDashboardSection() {
  const { resolvedMode } = useLiuliTheme();
  const sourceItems = useAsyncData(useCallback(() => listSourceItems({ limit: 200 }), []), []);
  const tags = useAsyncData(useCallback(listMarketTags, []), []);
  const hotwords = useAsyncData(useCallback(() => listHotwords(), []), []);
  const stockPool = useAsyncData(useCallback(listStockPool, []), []);
  const tracks = useAsyncData(useCallback(() => listTracks(), []), []);
  const aiLogs = useAsyncData(useCallback(getAiLogs, []), []);
  const suggestions = useAsyncData(useCallback(listAiTagSuggestions, []), []);
  const trackDashboard = useAsyncData(useCallback(getTrackDashboard, []), todayLoaderInitialTrackDashboard);
  const stockMaterials = useAsyncData(useCallback(listAllStockMaterials, []), []);
  const alertEvents = useAsyncData(useCallback(listAlertEvents, []), []);
  const jobs = useAsyncData(useCallback(listJobs, []), []);

  const todayItems = useMemo(
    () => sourceItems.data.filter((item) => isToday(item.publish_time || item.created_at)),
    [sourceItems.data]
  );
  const todaySourceCounts = useMemo(() => countSourceTypes(todayItems), [todayItems]);
  const todayAiLogs = useMemo(() => aiLogs.data.filter((item) => isToday(item.created_at)), [aiLogs.data]);
  const todayTokenCount = useMemo(
    () => todayAiLogs.reduce((sum, item) => sum + Number(item.total_tokens || 0), 0),
    [todayAiLogs]
  );
  const pendingSuggestionCount = suggestions.data.filter((item) => item.status === "pending").length;
  const stockPendingCount = stockMaterials.data.filter((item) => item.status === "pending").length;
  const unreadAlertCount = alertEvents.data.filter((item) => item.status === "unread").length;

  const todoRows = [
    { key: "ai-suggestion", name: "AI 推荐词待审核", count: pendingSuggestionCount, target: "市场雷达 / AI 推荐词" },
    { key: "track-material", name: "赛道材料 pending", count: trackDashboard.data.summary.pending_materials_count, target: "赛道发现 / 赛道动态" },
    { key: "stock-material", name: "标的材料 pending", count: stockPendingCount, target: "标的分析 / 标的事件" },
    { key: "alert-unread", name: "未读预警事件", count: unreadAlertCount, target: "预警中心 / 预警事件" },
    { key: "failed-task", name: "失败任务", count: failedTaskCount(jobs.data), target: "控制台 / 任务中心" }
  ];
  const todoTotalCount = todoRows.reduce((sum, item) => sum + Number(item.count || 0), 0);

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
          items={[
            { key: "source", label: "信息流", value: todayItems.length, loading: sourceItems.loading },
            { key: "news", label: "新闻", value: todaySourceCounts.news, loading: sourceItems.loading },
            { key: "announcement", label: "公告", value: todaySourceCounts.announcement, loading: sourceItems.loading },
            { key: "sentiment", label: "舆情", value: todaySourceCounts.sentiment, loading: sourceItems.loading },
            { key: "report", label: "研报摘要", value: todaySourceCounts.report, loading: sourceItems.loading },
            { key: "hotword-new", label: "热词", value: hotwords.data.filter((item) => isToday(item.created_at)).length, loading: hotwords.loading }
          ]}
        />
        <MetricGroup
          title="活跃"
          items={[
            { key: "tags", label: "标签", value: tags.data.filter((item) => item.status === "active").length, loading: tags.loading },
            { key: "hotwords", label: "热词", value: hotwords.data.filter((item) => item.status === "active").length, loading: hotwords.loading },
            { key: "stocks", label: "标的", value: stockPool.data.filter((item) => isActiveStatus(item.status)).length, loading: stockPool.loading },
            { key: "tracks", label: "赛道", value: tracks.data.filter((item) => isActiveStatus(item.status)).length, loading: tracks.loading }
          ]}
        />
        <MetricGroup
          title="统计"
          items={[
            { key: "ai-count", label: "AI 操作", value: todayAiLogs.length, loading: aiLogs.loading },
            { key: "ai-token", label: "Token", value: todayTokenCount, loading: aiLogs.loading },
            { key: "todo-total", label: "待办队列", value: todoTotalCount, loading: suggestions.loading || trackDashboard.loading || stockMaterials.loading || alertEvents.loading || jobs.loading }
          ]}
        />
      </div>

      <div className="workbench-dashboard-grid">
        <ChartCard title="今日信息流结构" option={sourceChartOption} height={260} />
        <WorkbenchCard title="待办队列摘要">
          <Table
            rowKey="key"
            size="small"
            dataSource={todoRows}
            pagination={false}
            loading={suggestions.loading || trackDashboard.loading || stockMaterials.loading || alertEvents.loading || jobs.loading}
            columns={[
              { title: "队列", dataIndex: "name" },
              { title: "数量", dataIndex: "count", width: 90 },
              { title: "入口", dataIndex: "target", width: 170 }
            ]}
            locale={{ emptyText: <EmptyAction description="暂无待办队列" /> }}
          />
        </WorkbenchCard>
      </div>
    </div>
  );
}

function OperationsPanelSection() {
  const navigate = useNavigate();
  const jobs = useAsyncData(useCallback(listJobs, []), []);
  const requests = useAsyncData(useCallback(listRunRequests, []), []);
  const suggestions = useAsyncData(useCallback(listAiTagSuggestions, []), []);
  const trackDashboard = useAsyncData(useCallback(getTrackDashboard, []), todayLoaderInitialTrackDashboard);
  const stockMaterials = useAsyncData(useCallback(listAllStockMaterials, []), []);
  const alertEvents = useAsyncData(useCallback(listAlertEvents, []), []);
  const [runningKey, setRunningKey] = useState<string | null>(null);

  const jobByName = useMemo(() => new Map(jobs.data.map((job) => [job.job_name, job])), [jobs.data]);
  const stockPendingCount = stockMaterials.data.filter((item) => item.status === "pending").length;
  const pendingSuggestionCount = suggestions.data.filter((item) => item.status === "pending").length;

  const operations = [
    {
      key: "track-material-review",
      name: "一键 AI 审核赛道材料",
      pending: trackDashboard.data.summary.pending_materials_count,
      jobName: null,
      lastRunAt: null
    },
    {
      key: "stock-material-review",
      name: "一键 AI 审核标的材料",
      pending: stockPendingCount,
      jobName: null,
      lastRunAt: null
    },
    {
      key: "ai-hotword-screen",
      name: "AI 筛选热词",
      pending: pendingSuggestionCount,
      jobName: "market_radar.extract_daily_hotwords_deepseek",
      lastRunAt: jobByName.get("market_radar.extract_daily_hotwords_deepseek")?.last_run_at
    },
    {
      key: "ai-hotword-merge",
      name: "AI 热词合并建议",
      pending: pendingSuggestionCount,
      jobName: "market_radar.suggest_hotword_merges_deepseek",
      lastRunAt: jobByName.get("market_radar.suggest_hotword_merges_deepseek")?.last_run_at
    }
  ];

  const todoEntries = [
    { key: "suggestions", label: "AI 推荐词审核", count: pendingSuggestionCount, path: "/market-radar" },
    { key: "track-materials", label: "赛道材料处理", count: trackDashboard.data.summary.pending_materials_count, path: "/track-discovery" },
    { key: "stock-materials", label: "标的材料处理", count: stockPendingCount, path: "/stock-analysis" },
    { key: "alerts", label: "未读预警处理", count: alertEvents.data.filter((item) => item.status === "unread").length, path: "/alerts" },
    { key: "jobs", label: "失败任务排查", count: failedTaskCount(jobs.data), path: "/console" }
  ];

  async function runOperation(operation: { key: string; jobName: string | null }) {
    if (!operation.jobName) return;
    setRunningKey(operation.key);
    try {
      await runJob(operation.jobName, {});
      message.success("已提交执行请求");
      await Promise.all([jobs.refresh(), requests.refresh()]);
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
          <div className="workbench-entry-grid">
            {todoEntries.map((item) => (
              <button className="workbench-entry-card" key={item.key} type="button" onClick={() => navigate(item.path)}>
                <span>{item.label}</span>
                <strong>{item.count}</strong>
              </button>
            ))}
          </div>
        </WorkbenchCard>

        <WorkbenchCard title="AI 控制面板">
          <div className="workbench-control-grid">
            {operations.map((item) => {
              const jobExists = item.jobName ? jobByName.has(item.jobName) : false;
              const disabled = !item.jobName || !jobExists;
              return (
                <div className="workbench-control-card" key={item.key}>
                  <div className="workbench-control-title">
                    <RobotOutlined />
                    <span>{item.name}</span>
                  </div>
                  <div className="workbench-control-foot">
                    <div className="workbench-control-meta">
                      <span>待处理 {item.pending}</span>
                      <span>最近 {formatTime(item.lastRunAt)}</span>
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
  const reports = useAsyncData(useCallback(listReports, []), []);
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
  const activeLabel = moduleTabs.dashboard.find((item) => item.key === activeTab)?.label || "今日看板";

  return (
    <>
      <PageHeader title="工作台" description={activeLabel} />
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
