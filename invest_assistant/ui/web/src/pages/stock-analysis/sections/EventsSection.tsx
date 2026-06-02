import {
  CheckOutlined,
  CloseOutlined,
  EditOutlined,
  PlusOutlined,
  AreaChartOutlined,
  SlidersOutlined,
  BulbOutlined,
  NotificationOutlined,
  BookOutlined,
  CalendarOutlined,
  ArrowRightOutlined,
  TagsOutlined,
  FileTextOutlined,
  InfoCircleOutlined,
  RobotOutlined
} from "@ant-design/icons";
import { Button, Drawer, Form, Input, Select, Space, Tag, Typography, message, Radio } from "antd";
import ReactECharts from "echarts-for-react";
import { useCallback, useMemo, useState, useEffect } from "react";
import {
  listStockPool,
  createStockNote,
  listStockNotes,
  listStockMaterials,
  listAllStockMaterials,
  updateStockMaterial,
  createStockMaterial
} from "../../../api/stockAnalysis";
import { STOCK_EVENT_REVIEW_JOB_NAME, runJob } from "../../../api/jobs";
import { listTracks } from "../../../api/trackDiscovery";
import { EmptyAction } from "../../../components/common/EmptyAction";
import { DataPanel } from "../../../components/common/DataPanel";
import { useAsyncData } from "../../../hooks/useAsyncData";
import { useLiuliTheme } from "../../../app/theme";
import type { StockMaterial, Track } from "../../../types/api";
import { formatTime } from "./shared";

// Local interfaces for extending types
interface ExtendedStockMaterial extends StockMaterial {
  stock_name?: string;
  stock_code?: string;
}

type CurationDrawerMode = "curate" | "write_note";

// Collapsible text renderer for timeline items to keep the dashboard clean
function RenderCollapsibleText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 180;

  return (
    <div>
      <div style={{ 
        color: "var(--ll-muted)", 
        fontSize: "13px", 
        lineHeight: "1.6", 
        whiteSpace: "pre-wrap",
        transition: "all 0.2s ease"
      }}>
        {expanded ? text : (isLong ? `${text.slice(0, 180)}...` : text)}
        {isLong && (
          <Button 
            type="link" 
            size="small" 
            onClick={() => setExpanded(!expanded)} 
            style={{ padding: "0 0 0 6px", fontSize: "12px", height: "auto", display: "inline-block", fontWeight: 600, color: "var(--ll-accent)" }}
          >
            {expanded ? "收起全文" : "查看全文"}
          </Button>
        )}
      </div>
    </div>
  );
}

// English impact direction value mapping to Chinese UI tags
export function ImpactDirectionTag({ direction }: { direction?: string | null }) {
  if (direction === "positive") return <Tag color="green">利好</Tag>;
  if (direction === "negative") return <Tag color="volcano">利空</Tag>;
  if (direction === "neutral") return <Tag color="blue">中性</Tag>;
  if (direction === "noise") return <Tag color="default" style={{ borderStyle: "dashed" }}>噪音</Tag>;
  return <Tag color="default">未研判</Tag>;
}

export function EventsSection() {
  const { resolvedMode } = useLiuliTheme();
  
  // 1. Fetch metadata
  const pool = useAsyncData(useCallback(listStockPool, []), []);
  const tracks = useAsyncData(useCallback(listTracks, []), []);

  // 2. Selection states and filters
  const [stockId, setStockId] = useState<number | undefined>();
  const [trackFilter, setTrackFilter] = useState<string>("all");
  const [eventTypeFilter, setEventTypeFilter] = useState<string>("all");
  const [timeFilter, setTimeFilter] = useState<string>("all");
  const [impactFilter, setImpactFilter] = useState<string>("all");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // 2b. Lazy loading limits for timeline events and pending queue (max 100 per load)
  const [visibleLimit, setVisibleLimit] = useState(100);
  const [pendingLimit, setPendingLimit] = useState(100);

  // Reset limits when stock pool or filters change
  useEffect(() => {
    setVisibleLimit(100);
    setPendingLimit(100);
  }, [stockId, trackFilter, eventTypeFilter, timeFilter, impactFilter, selectedDate]);

  // 3. Drawer states
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<CurationDrawerMode>("write_note");
  const [editingMaterial, setEditingMaterial] = useState<ExtendedStockMaterial | null>(null);
  const [aiReviewLoading, setAiReviewLoading] = useState(false);
  const [form] = Form.useForm();

  // 4. Fetch stock-specific materials: if stockId is selected, fetch for it; if undefined (All Stocks), fetch in parallel
  const stockMaterials = useAsyncData(
    useCallback(async () => {
      const poolList = await listStockPool();
      if (stockId) {
        const list = await listStockMaterials(stockId);
        const stock = poolList.find((s) => s.stock_id === stockId);
        return list.map((m) => ({
          ...m,
          stock_name: stock?.stock_name,
          stock_code: stock?.stock_code,
        })) as ExtendedStockMaterial[];
      } else {
        const list = await listAllStockMaterials();
        return list.map((m) => {
          const stock = poolList.find((s) => s.stock_id === m.stock_id);
          return {
            ...m,
            stock_name: stock?.stock_name,
            stock_code: stock?.stock_code,
          };
        }) as ExtendedStockMaterial[];
      }
    }, [stockId]),
    []
  );

  const poolOptions = useMemo(() => 
    pool.data.map((item) => ({ 
      value: item.stock_id, 
      label: item.stock_name ? `${item.stock_name} (${item.stock_code})` : `Stock ${item.stock_id}` 
    })), 
    [pool.data]
  );

  const trackOptions = useMemo(() => 
    tracks.data.map((item) => ({ 
      value: item.id, 
      label: item.name 
    })), 
    [tracks.data]
  );

  const activeStock = useMemo(() => 
    pool.data.find((item) => item.stock_id === stockId), 
    [stockId, pool.data]
  );

  // 5. Curation Curation Split: confirmed timeline events & pending queue rows
  const visibleEvents = useMemo(() => 
    stockMaterials.data.filter((item) => item.status === "confirmed"),
    [stockMaterials.data]
  );

  const pendingEvents = useMemo(() => 
    stockMaterials.data.filter((item) => item.status === "pending"),
    [stockMaterials.data]
  );

  // 6. Apply Toolbar Filters client-side on confirmed timeline events
  const filteredEvents = useMemo(() => {
    return visibleEvents.filter((item) => {
      // Date Picker Node Filter
      if (selectedDate) {
        const itemDate = (item.material_time || item.created_at || "").slice(0, 10);
        if (itemDate !== selectedDate) return false;
      }

      // Event Type Filter
      if (eventTypeFilter !== "all" && item.material_type !== eventTypeFilter) return false;

      // Impact Direction Filter
      if (impactFilter !== "all" && item.impact_direction !== impactFilter) return false;

      // Track Filter (For knowledge notes, matches related_track_id)
      if (trackFilter !== "all") {
        if (item.material_type === "knowledge_note") {
          // Check if notes database model maps related track
          // (Track bindings are fetched in components or notes)
          // As a fallback, we allow notes or materials tagged with tracks
        }
      }

      // Time Range Filter
      if (timeFilter !== "all") {
        const timeStr = item.material_time || item.updated_at || item.created_at;
        if (!timeStr) return false;
        const itemDate = new Date(timeStr);
        const now = new Date();
        const diffDays = (now.getTime() - itemDate.getTime()) / (1000 * 60 * 60 * 24);
        if (timeFilter === "today" && diffDays > 1) return false;
        if (timeFilter === "3d" && diffDays > 3) return false;
        if (timeFilter === "7d" && diffDays > 7) return false;
        if (timeFilter === "30d" && diffDays > 30) return false;
      }

      return true;
    });
  }, [visibleEvents, selectedDate, eventTypeFilter, impactFilter, trackFilter, timeFilter]);

  // 6b. Slice the displayed items to implement lazy-loading (limit to 100 initially)
  const displayedEvents = useMemo(() => 
    filteredEvents.slice(0, visibleLimit),
    [filteredEvents, visibleLimit]
  );

  const displayedPending = useMemo(() => 
    pendingEvents.slice(0, pendingLimit),
    [pendingEvents, pendingLimit]
  );

  // 7. Generate chart distribution data based on confirmed events
  const chartData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of visibleEvents) {
      if (eventTypeFilter !== "all" && item.material_type !== eventTypeFilter) continue;
      if (impactFilter !== "all" && item.impact_direction !== impactFilter) continue;

      const dateStr = (item.material_time || item.created_at || "").slice(0, 10);
      if (dateStr) {
        counts[dateStr] = (counts[dateStr] || 0) + 1;
      }
    }

    return Object.keys(counts).sort().map(date => ({
      date,
      count: counts[date]
    }));
  }, [visibleEvents, eventTypeFilter, impactFilter]);

  // ECharts visual settings
  const accentColor = "#10b981"; // Emerald green for stock events
  const shadowColor = resolvedMode === "dark" ? "rgba(16, 185, 129, 0.4)" : "rgba(16, 185, 129, 0.25)";
  const borderColor = resolvedMode === "dark" ? "#161b22" : "#ffffff";

  const chartOption = useMemo(() => ({
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params: any) => {
        const item = params[0];
        return `${item.name}<br/>事件数/笔记: <b>${item.value}</b>`;
      }
    },
    grid: {
      top: 15,
      left: 30,
      right: 15,
      bottom: 20
    },
    xAxis: {
      type: "category",
      data: chartData.map((d) => d.date),
      axisLine: { lineStyle: { color: resolvedMode === "dark" ? "rgba(255,255,255,0.08)" : "#e2e8f0" } },
      axisLabel: { color: resolvedMode === "dark" ? "#8b949e" : "#64748b", fontSize: 10 },
      axisTick: { show: false }
    },
    yAxis: {
      type: "value",
      minInterval: 1,
      axisLine: { show: false },
      splitLine: { lineStyle: { color: resolvedMode === "dark" ? "rgba(255,255,255,0.03)" : "#f1f5f9" } },
      axisLabel: { color: resolvedMode === "dark" ? "#8b949e" : "#64748b", fontSize: 10 }
    },
    series: [
      {
        data: chartData.map((d) => d.count),
        type: "line",
        smooth: true,
        showSymbol: true,
        symbol: "circle",
        symbolSize: 8,
        itemStyle: {
          color: accentColor,
          shadowBlur: 6,
          shadowColor: shadowColor,
          borderWidth: 2,
          borderColor: borderColor
        },
        lineStyle: {
          color: accentColor,
          width: 2.5,
          shadowBlur: 4,
          shadowColor: shadowColor
        },
        areaStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: resolvedMode === "dark" ? "rgba(16, 185, 129, 0.16)" : "rgba(16, 185, 129, 0.12)" },
              { offset: 1, color: "rgba(16, 185, 129, 0)" }
            ]
          }
        }
      }
    ]
  }), [chartData, accentColor, shadowColor, borderColor, resolvedMode]);

  const onChartClick = useCallback((params: any) => {
    if (params && params.name) {
      setSelectedDate(params.name);
      message.info(`已筛选 ${params.name} 的标的事件`);
    }
  }, []);

  const onEvents = useMemo(() => ({
    click: onChartClick
  }), [onChartClick]);

  // 8. Aggregate statistics
  const stats = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    let todayAdded = 0;
    let confirmedCount = 0;
    let pendingCount = 0;

    for (const item of stockMaterials.data) {
      const itemDate = (item.material_time || item.created_at || "").slice(0, 10);
      if (itemDate === todayStr) {
        todayAdded++;
      }
      if (item.status === "confirmed") {
        confirmedCount++;
      } else if (item.status === "pending") {
        pendingCount++;
      }
    }

    return { todayAdded, confirmedCount, pendingCount };
  }, [stockMaterials.data]);

  // 9. Latest 5 confirmed notes for the sidebar locator
  const latestNotes = useMemo(() => 
    visibleEvents
      .filter((e) => e.material_type === "knowledge_note")
      .slice(0, 5), 
    [visibleEvents]
  );

  // 10. Analyst Actions: Ignore material
  async function handleStatusChange(item: ExtendedStockMaterial, newStatus: string) {
    try {
      await updateStockMaterial(item.id, {
        status: newStatus
      });
      message.success(newStatus === "ignored" ? "材料已忽略" : "材料已确认入流");
      await stockMaterials.refresh();
    } catch (err) {
      message.error("更新材料状态失败");
    }
  }

  // 11. Submitting curation judgment or note
  async function handleDrawerSubmit(statusOverride?: string) {
    if (drawerMode === "curate" && editingMaterial) {
      if (statusOverride === "ignored") {
        try {
          await updateStockMaterial(editingMaterial.id, {
            status: "ignored",
            impact_direction: null,
            importance_level: null,
            note: null
          });
          message.success("材料已忽略");
          setDrawerOpen(false);
          setEditingMaterial(null);
          await stockMaterials.refresh();
        } catch (err) {
          message.error("忽略材料失败");
        }
        return;
      }

      const values = await form.validateFields();
      try {
        await updateStockMaterial(editingMaterial.id, {
          status: statusOverride || editingMaterial.status || "confirmed",
          impact_direction: values.impact_direction || null,
          importance_level: values.importance_level || null,
          note: values.note || null
        });
        message.success(statusOverride === "confirmed" ? "材料已研判确认入流" : "研判已保存");
        setDrawerOpen(false);
        setEditingMaterial(null);
        await stockMaterials.refresh();
      } catch (err) {
        message.error("保存个股研判失败");
      }
    } else {
      // Create research note
      const values = await form.validateFields();
      const targetStockId = stockId || values.stock_id;

      if (!targetStockId) {
        message.warning("请选择关联个股");
        return;
      }

      try {
        await createStockNote(targetStockId, {
          note_type: values.note_type || "其他",
          title: values.title,
          content: values.content,
          related_track_id: values.related_track_id || null
        });
        message.success("知识笔记已成功添加，并自动生成已确认标的事件");
        form.resetFields();
        setDrawerOpen(false);
        await stockMaterials.refresh();
      } catch (err) {
        message.error("添加知识笔记失败");
      }
    }
  }

  function openWriteNoteDrawer() {
    setDrawerMode("write_note");
    setEditingMaterial(null);
    form.resetFields();
    form.setFieldsValue({ 
      note_type: "深度调研", 
      stock_id: stockId 
    });
    setDrawerOpen(true);
  }

  function openCurationDrawer(item: ExtendedStockMaterial) {
    setDrawerMode("curate");
    setEditingMaterial(item);
    form.resetFields();
    form.setFieldsValue({
      status: item.status,
      impact_direction: item.impact_direction || "neutral",
      importance_level: item.importance_level || "medium",
      note: item.note || ""
    });
    setDrawerOpen(true);
  }

  async function submitAiReviewAll() {
    setAiReviewLoading(true);
    try {
      await runJob(STOCK_EVENT_REVIEW_JOB_NAME, {});
      message.success("已提交 AI 审核全部标的事件任务");
    } catch (err) {
      message.error("AI 审核任务提交失败");
    } finally {
      setAiReviewLoading(false);
    }
  }

  return (
    <>
      <DataPanel
        toolbar={[
          <div className="track-material-toolbar" key="stock-curation-toolbar">
            <Select
              showSearch
              size="small"
              placeholder="选择个股"
              value={stockId || "all"}
              options={[
                { value: "all", label: "全部标的" },
                ...poolOptions,
              ]}
              loading={pool.loading}
              style={{ width: 190 }}
              onChange={(val: any) => {
                setStockId(val === "all" ? undefined : val);
                setSelectedDate(null);
              }}
            />
            <div className="data-panel-toolbar-divider" />
            
            <Select
              size="small"
              value={impactFilter}
              options={[
                { value: "all", label: "研判方向：全部" },
                { value: "positive", label: "方向：利好" },
                { value: "negative", label: "方向：利空" },
                { value: "neutral", label: "方向：中性" },
                { value: "noise", label: "方向：噪音" },
              ]}
              style={{ width: 140 }}
              onChange={setImpactFilter}
            />

            <Select
              size="small"
              value={eventTypeFilter}
              options={[
                { value: "all", label: "类型：全部" },
                { value: "source_item", label: "类型：信息流" },
                { value: "knowledge_note", label: "类型：知识笔记" },
              ]}
              style={{ width: 130 }}
              onChange={setEventTypeFilter}
            />

            <Select
              size="small"
              value={timeFilter}
              options={[
                { value: "all", label: "时间：全部" },
                { value: "today", label: "时间：今日" },
                { value: "3d", label: "时间：近3天" },
                { value: "7d", label: "时间：近7天" },
                { value: "30d", label: "时间：近30天" },
              ]}
              style={{ width: 120 }}
              onChange={setTimeFilter}
            />
            
            <div className="data-panel-toolbar-spacer" />
            
            <Button size="small" type="primary" icon={<PlusOutlined />} onClick={openWriteNoteDrawer}>
              撰写笔记
            </Button>
          </div>
        ]}
      >
        <div className="track-material-workbench">
          {/* Left Column: Interactive Chart and Curation timeline feed */}
          <div className="track-material-left-column">
            
            {/* Event Distribution line chart */}
            <div className="track-material-chart-card" style={{ height: "auto", display: "flex", flexDirection: "column", gap: "10px", marginBottom: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", borderBottom: "1px solid var(--ll-border)", paddingBottom: "8px" }}>
                <AreaChartOutlined style={{ color: "var(--ll-accent)", fontSize: "14px" }} />
                <span style={{ fontWeight: 700, fontSize: "14px", color: "var(--ll-text)" }}>标的事件分布</span>
              </div>
              <div>
                {chartData.length > 0 ? (
                  <ReactECharts
                    option={chartOption}
                    onEvents={onEvents}
                    style={{ height: 130, width: "100%" }}
                    notMerge
                  />
                ) : (
                  <div className="chart-empty">暂无时序事件分布数据</div>
                )}
              </div>
            </div>

            {/* Confirmed events timeline */}
            <section className="track-material-timeline-panel" style={{ border: "1px solid var(--ll-border)", borderRadius: "7px", background: "var(--ll-panel)", padding: "14px", display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--ll-border)", paddingBottom: "8px" }}>
                <Space size={8} align="baseline">
                  <BulbOutlined style={{ color: "var(--ll-accent)", fontSize: "14px" }} />
                  <span style={{ fontWeight: 700, fontSize: "14px", color: "var(--ll-text)" }}>
                    {activeStock ? `${activeStock.stock_name} 已研判事件` : "标的事件流"}
                  </span>
                  <span className="section-head-count">({filteredEvents.length})</span>
                  {selectedDate && (
                    <Button size="small" type="link" onClick={() => setSelectedDate(null)} style={{ padding: 0, marginLeft: 8, fontWeight: 600, color: "var(--ll-accent)" }}>
                      清除日期筛选 ({selectedDate})
                    </Button>
                  )}
                </Space>
              </div>

              {displayedEvents.length ? (
                <div className="track-material-timeline">
                  {displayedEvents.map((item) => (
                    <article className="track-material-card" key={item.id}>
                      {/* Header metadata row */}
                      <div className="track-material-card-row-first">
                        <Space size={6}>
                          <ImpactDirectionTag direction={item.impact_direction} />
                          <Tag color={item.material_type === "knowledge_note" ? "green" : "blue"}>
                            {item.material_type === "knowledge_note" ? "知识笔记" : "快讯公告"}
                          </Tag>
                          <span className="track-material-card-track-name">
                            {item.stock_name} {item.stock_code && `(${item.stock_code})`}
                          </span>
                        </Space>
                        <span className="track-material-card-time">
                          {item.material_time ? formatTime(item.material_time) : formatTime(item.updated_at || item.created_at)}
                        </span>
                      </div>

                      {/* Title */}
                      <div className="track-material-card-title">
                        {item.material_title || `${item.material_type === "knowledge_note" ? "研究笔记" : "快讯"} ID ${item.material_id}`}
                      </div>

                      {/* Summary Collapsible content */}
                      <div className="track-material-card-summary" style={{ WebkitLineClamp: "unset" }}>
                        <RenderCollapsibleText text={item.material_summary || "暂无材料内容摘要"} />
                      </div>

                      {/* Subject note perspective */}
                      {item.note && item.note.trim() && (
                        <div 
                          className="track-material-card-note" 
                          style={{ 
                            borderLeftColor: item.impact_direction === "positive" ? "#10b981" : item.impact_direction === "negative" ? "#ef4444" : "var(--ll-accent)"
                          }}
                        >
                          <span className="note-label">个股视点：</span>
                          <span className="note-content">{item.note}</span>
                        </div>
                      )}

                      {/* Footer actions */}
                      <div className="track-material-card-footer">
                        <span className="track-material-card-source">
                          来源：{item.material_source_name || (item.material_type === "knowledge_note" ? "知识库" : "信息流")}
                        </span>
                        <Button
                          size="small"
                          className="track-material-card-edit-btn"
                          icon={<EditOutlined />}
                          onClick={() => openCurationDrawer(item)}
                        >
                          修改研判
                        </Button>
                      </div>
                    </article>
                  ))}

                  {filteredEvents.length > visibleLimit && (
                    <div style={{ display: "flex", justifyContent: "center", padding: "12px 0", borderTop: "1px dashed var(--ll-border-soft)" }}>
                      <Button 
                        type="link" 
                        onClick={() => setVisibleLimit((prev) => prev + 100)}
                        style={{ fontWeight: 600, color: "var(--ll-accent)" }}
                      >
                        加载更多已研判事件 (还有 {filteredEvents.length - visibleLimit} 条)
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <EmptyAction description="当前筛选下没有已确认研判的标的事件" />
              )}
            </section>
          </div>

          {/* Right Sidebar */}
          <aside className="track-material-right-sidebar">
            
            {/* Statistics Board */}
            <div className="track-material-stats-panel" style={{ height: "auto", display: "flex", flexDirection: "column", gap: "10px", marginBottom: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", borderBottom: "1px solid var(--ll-border)", paddingBottom: "8px" }}>
                <SlidersOutlined style={{ color: "#10b981", fontSize: "14px" }} />
                <span style={{ fontWeight: 700, fontSize: "14px", color: "var(--ll-text)" }}>标的数据统计</span>
              </div>
              <div className="stats-grid" style={{ minHeight: "86px" }}>
                <div className="stats-item">
                  <div className="stats-val">{stats.todayAdded}</div>
                  <div className="stats-lbl">今日大事件</div>
                </div>
                <div className="stats-item">
                  <div className="stats-val color-pending">{stats.pendingCount}</div>
                  <div className="stats-lbl">待研判队列</div>
                </div>
                <div className="stats-item">
                  <div className="stats-val color-confirmed">{stats.confirmedCount}</div>
                  <div className="stats-lbl">已研判归档</div>
                </div>
              </div>
            </div>

            {/* Pending curation Queue */}
            <div className="track-material-pending-panel" style={{ border: "1px solid var(--ll-border)", borderRadius: "7px", background: "var(--ll-panel)", padding: "14px", display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", borderBottom: "1px solid var(--ll-border)", paddingBottom: "8px" }}>
                <Space size={8} align="baseline">
                  <NotificationOutlined style={{ color: "#f59e0b", fontSize: "14px" }} />
                  <span style={{ fontWeight: 700, fontSize: "14px", color: "var(--ll-text)" }}>待处理队列</span>
                  <span className="section-head-count">({pendingEvents.length})</span>
                </Space>
                <Button
                  size="small"
                  type="primary"
                  icon={<RobotOutlined />}
                  loading={aiReviewLoading}
                  onClick={submitAiReviewAll}
                >
                  AI审核全部
                </Button>
              </div>

              {displayedPending.length ? (
                <div className="track-material-pending-list" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {displayedPending.map((note) => (
                    <article className="track-material-pending-card" key={note.id}>
                      <div className="pending-card-header">
                        <span className="track-material-card-track-name">
                          {note.stock_name}
                        </span>
                        <span className="pending-card-time">
                          {note.material_time ? formatTime(note.material_time).slice(5, 16) : formatTime(note.created_at).slice(5, 16)}
                        </span>
                      </div>
                      <div className="pending-card-title">
                        {note.material_title || `系统推荐 ID ${note.material_id}`}
                      </div>
                      <div className="pending-card-footer">
                        <span className="pending-card-source">
                          来源：{note.material_source_name || "信息流"}
                        </span>
                        <Space size={4}>
                          <Button
                            size="small"
                            type="text"
                            style={{ fontSize: "12px", height: "22px", padding: "0 4px", color: "var(--ll-muted)" }}
                            onClick={() => handleStatusChange(note, "ignored")}
                          >
                            忽略
                          </Button>
                          <Button
                            size="small"
                            type="text"
                            style={{ fontSize: "12px", height: "22px", padding: "0 4px", color: "var(--ll-accent)", fontWeight: 500 }}
                            onClick={() => openCurationDrawer(note)}
                          >
                            研判
                          </Button>
                        </Space>
                      </div>
                    </article>
                  ))}

                  {pendingEvents.length > pendingLimit && (
                    <div style={{ display: "flex", justifyContent: "center", paddingTop: "8px" }}>
                      <Button 
                        type="link" 
                        size="small"
                        onClick={() => setPendingLimit((prev) => prev + 100)}
                        style={{ fontWeight: 600, color: "var(--ll-accent)", fontSize: "12px" }}
                      >
                        加载更多待处理 (还有 {pendingEvents.length - pendingLimit} 条)
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <EmptyAction description="暂无个股待处理研判事件" />
              )}
            </div>

            {/* Quick reference for latest confirmed notes */}
            {latestNotes.length > 0 && (
              <div className="track-material-stats-panel" style={{ height: "auto", display: "flex", flexDirection: "column", gap: "10px", marginTop: "10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", borderBottom: "1px solid var(--ll-border)", paddingBottom: "8px" }}>
                  <BookOutlined style={{ color: "#f59e0b", fontSize: "14px" }} />
                  <span style={{ fontWeight: 700, fontSize: "14px", color: "var(--ll-text)" }}>最新投研笔记</span>
                </div>
                <div className="track-material-pending-list" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {latestNotes.map((note) => (
                    <div 
                      key={note.id} 
                      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", padding: "4px 6px", borderRadius: "4px", background: "var(--ll-panel-subtle)", fontSize: "12px" }}
                      onClick={() => {
                        const noteDate = (note.material_time || note.created_at || "").slice(0, 10);
                        setSelectedDate(noteDate);
                        message.info(`已定位到 ${noteDate} 的笔记大事件`);
                      }}
                    >
                      <span style={{ fontWeight: 600, color: "var(--ll-accent)" }}>{note.stock_name}</span>
                      <span style={{ color: "var(--ll-muted)" }}>{note.material_title}</span>
                      <ArrowRightOutlined style={{ fontSize: "10px", color: "var(--ll-muted)" }} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>
      </DataPanel>

      {/* Main Drawer: Curate Event or Write Note */}
      <Drawer
        title={drawerMode === "curate" ? "编辑个股研判" : "撰写个股研究笔记"}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        size="large"
        extra={
          <Space>
            {drawerMode === "curate" && editingMaterial?.status === "pending" ? (
              <Space size={6}>
                <Button size="small" icon={<CloseOutlined />} onClick={() => handleDrawerSubmit("ignored")}>忽略</Button>
                <Button type="primary" size="small" icon={<CheckOutlined />} onClick={() => handleDrawerSubmit("confirmed")}>确认</Button>
              </Space>
            ) : (
              <>
                <Button size="small" onClick={() => setDrawerOpen(false)}>取消</Button>
                <Button type="primary" size="small" onClick={() => handleDrawerSubmit()}>{drawerMode === "curate" ? "保存研判" : "发布笔记"}</Button>
              </>
            )}
          </Space>
        }
      >
        {drawerMode === "curate" && editingMaterial && (
          <div className="track-material-reference">
            <div className="track-material-reference-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>{editingMaterial.material_title}</span>
              <Tag color={editingMaterial.material_type === "knowledge_note" ? "green" : "blue"}>
                {editingMaterial.material_type === "knowledge_note" ? "知识笔记" : "快讯公告"}
              </Tag>
            </div>
            <div className="track-material-reference-summary">
              {editingMaterial.material_summary || "暂无快讯公告正文内容"}
            </div>
            <div className="track-material-reference-foot">
              <span>关联个股：{editingMaterial.stock_name} ({editingMaterial.stock_code})</span>
              <span>发布时间：{editingMaterial.material_time ? formatTime(editingMaterial.material_time) : formatTime(editingMaterial.created_at)}</span>
            </div>
          </div>
        )}

        <Form form={form} layout="vertical" preserve={false}>
          {drawerMode === "curate" ? (
            <>
              {/* Row 1: Direction & Importance */}
              <div style={{ display: "flex", gap: "16px", marginBottom: "16px" }}>
                <Form.Item
                  name="impact_direction"
                  label="利好/利空方向"
                  rules={[{ required: true, message: "请选择研判影响方向" }]}
                  style={{ flex: 1, marginBottom: 0 }}
                >
                  <Radio.Group optionType="button" buttonStyle="solid" size="small" className="ll-radio-group">
                    <Radio.Button value="positive" className="ll-radio-btn-support">利好</Radio.Button>
                    <Radio.Button value="negative" className="ll-radio-btn-weaken">利空</Radio.Button>
                    <Radio.Button value="neutral" className="ll-radio-btn-neutral">中性</Radio.Button>
                    <Radio.Button value="noise" className="ll-radio-btn-noise">噪音</Radio.Button>
                  </Radio.Group>
                </Form.Item>

                <Form.Item
                  name="importance_level"
                  label="影响级别"
                  rules={[{ required: true, message: "请选择重要级别" }]}
                  style={{ flex: 1, marginBottom: 0 }}
                >
                  <Radio.Group optionType="button" buttonStyle="solid" size="small" className="ll-radio-group">
                    <Radio.Button value="high" className="ll-radio-btn-high">高</Radio.Button>
                    <Radio.Button value="medium" className="ll-radio-btn-medium">中</Radio.Button>
                    <Radio.Button value="low" className="ll-radio-btn-low">低</Radio.Button>
                  </Radio.Group>
                </Form.Item>
              </div>



              {/* Row 3: Perspective note */}
              <Form.Item
                name="note"
                label="个股视角一句话点评"
                style={{ marginBottom: "20px" }}
              >
                <Input.TextArea 
                  rows={4} 
                  placeholder="用一句话概括这个消息对公司短期或长期的核心商业影响逻辑..." 
                />
              </Form.Item>
            </>
          ) : (
            <>
              {/* Write Note Mode */}
              {!stockId && (
                <Form.Item
                  name="stock_id"
                  label="选择关联个股"
                  rules={[{ required: true, message: "请选择关联个股" }]}
                  style={{ marginBottom: "16px" }}
                >
                  <Select options={poolOptions} placeholder="选择需要记录笔记的股票" />
                </Form.Item>
              )}

              <div style={{ display: "flex", gap: "16px", marginBottom: "16px" }}>
                <Form.Item
                  name="note_type"
                  label="笔记分类"
                  rules={[{ required: true, message: "请选择笔记分类" }]}
                  style={{ flex: 1, marginBottom: 0 }}
                >
                  <Select 
                    options={[
                      { value: "深度调研", label: "深度调研" },
                      { value: "财报分析", label: "财报分析" },
                      { value: "核心逻辑", label: "核心逻辑" },
                      { value: "会议纪要", label: "会议纪要" },
                      { value: "行业点评", label: "行业点评" },
                      { value: "其他", label: "其他" }
                    ]} 
                  />
                </Form.Item>

                <Form.Item
                  name="related_track_id"
                  label="关联主线赛道"
                  style={{ flex: 1, marginBottom: 0 }}
                >
                  <Select 
                    options={trackOptions} 
                    allowClear 
                    placeholder="无关联赛道 (可选)"
                  />
                </Form.Item>
              </div>

              <Form.Item
                name="title"
                label="笔记标题"
                rules={[{ required: true, message: "请输入笔记标题" }]}
                style={{ marginBottom: "16px" }}
              >
                <Input placeholder="输入个股分析的核心议题标题..." />
              </Form.Item>

              <Form.Item
                name="content"
                label="笔记详细内容"
                rules={[{ required: true, message: "请输入笔记详细内容" }]}
                style={{ marginBottom: "20px" }}
              >
                <Input.TextArea 
                  rows={12} 
                  placeholder="在此记录核心经营逻辑、财务指标、调研要点等深度沉淀..." 
                />
              </Form.Item>
            </>
          )}

          <div className="track-material-drawer-hint" style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <InfoCircleOutlined style={{ color: "var(--ll-accent)", fontSize: "16px" }} />
            <Typography.Text type="secondary" style={{ fontSize: "12px" }}>
              所有修改和记录将进入个股投研大事件沉淀库，用于个股的立体时序回溯。
            </Typography.Text>
          </div>
        </Form>
      </Drawer>
    </>
  );
}
