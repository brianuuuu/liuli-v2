import { CheckOutlined, CloseOutlined, EditOutlined, EyeOutlined, PlusOutlined } from "@ant-design/icons";
import { Button, Drawer, Form, Input, InputNumber, Radio, Select, Space, Tag, Typography, message } from "antd";
import ReactECharts from "echarts-for-react";
import { useCallback, useMemo, useState } from "react";
import { createTrackMaterial, listTrackMaterials, listTracks, updateTrackMaterial } from "../../../api/trackDiscovery";
import type { TrackMaterialPayload } from "../../../api/trackDiscovery";
import { EmptyAction } from "../../../components/common/EmptyAction";
import { DataPanel } from "../../../components/common/DataPanel";
import { useAsyncData } from "../../../hooks/useAsyncData";
import { useLiuliTheme } from "../../../app/theme";
import type { TrackMaterial } from "../../../types/api";
import { DirectionTag, formatTime } from "./shared";
import {
  compactMaterialSummary,
  groupMaterialsByDate,
  materialImportanceLabel,
  materialImportanceOptions,
  materialStatusLabel,
  materialTypeLabel,
  materialTypeOptions,
  pendingMaterials,
} from "./materialTimeline";

// Extend TrackMaterial type locally to hold the dynamically bound track name
interface ExtendedTrackMaterial extends TrackMaterial {
  track_name?: string;
}

type MaterialFormValues = TrackMaterialPayload & { track_id?: number };
type DrawerMode = "create" | "edit";

export function MaterialsSection() {
  const tracks = useAsyncData(useCallback(() => listTracks(), []), []);
  const { resolvedMode } = useLiuliTheme();
  const [trackId, setTrackId] = useState<number | undefined>();
  const [directionFilter, setDirectionFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [timeFilter, setTimeFilter] = useState<string>("all");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const [drawerMode, setDrawerMode] = useState<DrawerMode>("create");
  const [editingMaterial, setEditingMaterial] = useState<ExtendedTrackMaterial | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);
  const [form] = Form.useForm<MaterialFormValues>();

  // Fetch materials dynamically based on selected trackId (or fetch all in parallel if undefined)
  const materials = useAsyncData(
    useCallback(async () => {
      const tracksList = await listTracks();
      if (trackId) {
        const data = await listTrackMaterials(trackId);
        const currentTrack = tracksList.find((t) => t.id === trackId);
        return data.map((item) => ({ ...item, track_name: currentTrack?.name })) as ExtendedTrackMaterial[];
      } else {
        // Fetch all tracks in parallel
        const promises = tracksList.map(async (track) => {
          try {
            const list = await listTrackMaterials(track.id);
            return list.map((item) => ({ ...item, track_name: track.name }));
          } catch (e) {
            return [];
          }
        });
        const results = await Promise.all(promises);
        return results.flat() as ExtendedTrackMaterial[];
      }
    }, [trackId]),
    []
  );

  const trackOptions = useMemo(() => tracks.data.map((item) => ({ value: item.id, label: item.name })), [tracks.data]);
  const activeTrack = useMemo(() => tracks.data.find((item) => item.id === trackId), [trackId, tracks.data]);

  // Main Event Timeline only displays confirmed materials
  const visibleMaterials = useMemo(() => materials.data.filter((item) => item.status === "confirmed"), [materials.data]);
  const pendingRows = useMemo(() => pendingMaterials(materials.data), [materials.data]);

  // Local Filter Logic
  const filterItem = useCallback((item: ExtendedTrackMaterial) => {
    // 0. Selected date filter
    if (selectedDate) {
      const itemDate = (item.material_time || item.created_at || "").slice(0, 10);
      if (itemDate !== selectedDate) return false;
    }
    // 1. direction filter
    if (directionFilter !== "all" && item.direction !== directionFilter) return false;
    // 2. type filter
    if (typeFilter !== "all" && item.material_type !== typeFilter) return false;
    // 3. time filter
    if (timeFilter !== "all") {
      const timeStr = item.material_time || item.updated_at || item.created_at;
      if (!timeStr) return false;
      const itemDate = new Date(timeStr);
      const now = new Date();
      const diffTime = now.getTime() - itemDate.getTime();
      const diffDays = diffTime / (1000 * 60 * 60 * 24);
      if (timeFilter === "today" && diffDays > 1) return false;
      if (timeFilter === "3d" && diffDays > 3) return false;
      if (timeFilter === "7d" && diffDays > 7) return false;
      if (timeFilter === "30d" && diffDays > 30) return false;
    }
    return true;
  }, [selectedDate, directionFilter, typeFilter, timeFilter]);

  const filteredVisible = useMemo(() => visibleMaterials.filter(filterItem), [visibleMaterials, filterItem]);
  const filteredPending = useMemo(() => pendingRows.filter(filterItem), [pendingRows, filterItem]);

  // Statistics
  const stats = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    return materials.data.reduce(
      (acc, item) => {
        const itemDate = (item.material_time || item.created_at || "").slice(0, 10);
        if (itemDate === todayStr) {
          acc.todayAdded += 1;
        }
        if (item.status === "pending") acc.pending += 1;
        if (item.status === "confirmed") acc.confirmed += 1;
        if (item.status === "ignored") acc.ignored += 1;
        return acc;
      },
      { todayAdded: 0, pending: 0, confirmed: 0, ignored: 0 }
    );
  }, [materials.data]);

  // ECharts Timeline Event Distribution data
  const chartData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of materials.data) {
      if (item.status !== "confirmed") continue; // Only count confirmed events on the chart
      if (directionFilter !== "all" && item.direction !== directionFilter) continue;
      if (typeFilter !== "all" && item.material_type !== typeFilter) continue;

      const dateStr = (item.material_time || item.created_at || "").slice(0, 10);
      if (dateStr) {
        counts[dateStr] = (counts[dateStr] || 0) + 1;
      }
    }
    const sortedDates = Object.keys(counts).sort();
    return sortedDates.map((date) => ({
      date,
      count: counts[date]
    }));
  }, [materials.data, directionFilter, typeFilter]);

  // ECharts config options for Circular Glow display
  const accentColor = resolvedMode === "dark" ? "#58a6ff" : "#2563eb";
  const shadowColor = resolvedMode === "dark" ? "rgba(88, 166, 255, 0.6)" : "rgba(37, 99, 235, 0.6)";
  const borderColor = resolvedMode === "dark" ? "#161b22" : "#ffffff";

  const chartOption = useMemo(() => ({
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params: any) => {
        const item = params[0];
        return `${item.name}<br/>事件数: <b>${item.value}</b>`;
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
        symbolSize: 10,
        itemStyle: {
          color: accentColor,
          shadowBlur: 8,
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
              { offset: 0, color: resolvedMode === "dark" ? "rgba(88, 166, 255, 0.15)" : "rgba(37, 99, 235, 0.12)" },
              { offset: 1, color: "rgba(37, 99, 235, 0)" }
            ]
          }
        }
      }
    ]
  }), [chartData, accentColor, shadowColor, borderColor, resolvedMode]);

  const onChartClick = useCallback((params: any) => {
    if (params && params.name) {
      setSelectedDate(params.name);
      message.info(`已筛选 ${params.name} 的赛道事件`);
    }
  }, []);

  const onEvents = useMemo(() => ({
    click: onChartClick
  }), [onChartClick]);

  function openCreateDrawer() {
    setDrawerMode("create");
    setEditingMaterial(null);
    setIsSummaryExpanded(false);
    form.resetFields();
    form.setFieldsValue({ material_type: "source_item", status: "confirmed" });
    setDrawerOpen(true);
  }

  function openEditDrawer(record: ExtendedTrackMaterial) {
    setDrawerMode("edit");
    setEditingMaterial(record);
    setIsSummaryExpanded(false);
    form.resetFields();
    form.setFieldsValue({
      material_type: record.material_type === "knowledge_note" ? "knowledge_note" : "source_item",
      material_id: record.material_id,
      direction: record.direction || null,
      importance_level: record.importance_level || null,
      status: record.status,
      note: record.note || null,
    });
    setDrawerOpen(true);
  }

  async function handleStatusChange(item: ExtendedTrackMaterial, newStatus: string) {
    try {
      await updateTrackMaterial(item.id, {
        direction: item.direction || null,
        importance_level: item.importance_level || null,
        status: newStatus,
        note: item.note || null,
      });
      message.success(newStatus === "confirmed" ? "材料已确认" : "材料已忽略");
      await materials.refresh();
    } catch (err) {
      message.error("更新状态失败");
    }
  }

  async function submitDrawer(statusOverride?: string) {
    const values = await form.validateFields();
    const targetTrackId = drawerMode === "create" ? (trackId || values.track_id) : editingMaterial?.track_id;
    if (!targetTrackId) {
      message.warning("请选择关联赛道");
      return;
    }

    if (drawerMode === "edit" && editingMaterial) {
      await updateTrackMaterial(editingMaterial.id, {
        direction: values.direction || null,
        importance_level: values.importance_level || null,
        status: statusOverride || values.status || "pending",
        note: values.note || null,
      });
      message.success(statusOverride === "confirmed" ? "材料已确认" : statusOverride === "ignored" ? "材料已忽略" : "材料判断已更新");
    } else {
      await createTrackMaterial(Number(targetTrackId), {
        material_type: values.material_type,
        material_id: values.material_id,
        direction: values.direction || null,
        importance_level: values.importance_level || null,
        status: values.status || "confirmed",
        note: values.note || null,
      });
      message.success("材料已引用");
    }
    setDrawerOpen(false);
    setEditingMaterial(null);
    await materials.refresh();
  }

  function renderMaterialReference(item: ExtendedTrackMaterial) {
    const fullText = String(item.material_summary || item.material_title || item.note || "暂无材料摘要").trim();
    const isLongText = fullText.length > 96;

    return (
      <div className="track-material-reference">
        <div className="track-material-reference-title">{item.material_title || `${materialTypeLabel(item.material_type)} ID ${item.material_id}`}</div>
        {isLongText ? (
          <div
            className="track-material-reference-summary"
            style={{ cursor: "pointer", transition: "all 0.2s ease" }}
            onClick={() => setIsSummaryExpanded(!isSummaryExpanded)}
          >
            {isSummaryExpanded ? fullText : `${fullText.slice(0, 96)}...`}
            <span style={{ color: "var(--ll-accent)", marginLeft: "6px", fontSize: "12px", fontWeight: 600 }}>
              {isSummaryExpanded ? "收起" : "查看全文"}
            </span>
          </div>
        ) : (
          <div className="track-material-reference-summary">{fullText}</div>
        )}
        <div className="track-material-reference-foot">
          <span>{item.material_source_name || materialTypeLabel(item.material_type)}</span>
          <span>{item.material_time ? formatTime(item.material_time) : formatTime(item.updated_at || item.created_at)}</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <DataPanel
        toolbar={[
          <div className="track-material-toolbar" key="track-material-toolbar">
            <Select
              showSearch
              size="small"
              placeholder="选择赛道"
              value={trackId || "all"}
              options={[
                { value: "all", label: "全部赛道" },
                ...trackOptions,
              ]}
              loading={tracks.loading}
              style={{ width: 180 }}
              onChange={(val) => {
                setTrackId(val === "all" ? undefined : val);
                setSelectedDate(null); // Clear selected date filter on track change
              }}
            />
            <div className="data-panel-toolbar-divider" />
            <Select
              size="small"
              value={directionFilter}
              options={[
                { value: "all", label: "方向：全部" },
                { value: "support", label: "方向：支持" },
                { value: "weaken", label: "方向：削弱" },
                { value: "neutral", label: "方向：中性" },
                { value: "noise", label: "方向：噪音" },
              ]}
              style={{ width: 120 }}
              onChange={setDirectionFilter}
            />
            <Select
              size="small"
              value={typeFilter}
              options={[
                { value: "all", label: "类型：全部" },
                { value: "source_item", label: "类型：信息流" },
                { value: "knowledge_note", label: "类型：知识笔记" },
              ]}
              style={{ width: 130 }}
              onChange={setTypeFilter}
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
            <Button size="small" type="primary" icon={<PlusOutlined />} onClick={openCreateDrawer}>
              引用材料
            </Button>
          </div>,
        ]}
      >
        <div className="track-material-workbench">
          <div className="track-material-left-column">
            {/* 1. Track Event Distribution Timeline Chart */}
            <div className="track-material-chart-section">
              <div className="track-material-section-head">
                <Typography.Title level={5} style={{ margin: 0 }}>事件分布</Typography.Title>
              </div>
              <div className="track-material-chart-card">
                {chartData.length > 0 ? (
                  <ReactECharts
                    option={chartOption}
                    onEvents={onEvents}
                    style={{ height: 130, width: "100%" }}
                    notMerge
                  />
                ) : (
                  <div className="chart-empty">暂无事件时序分布数据</div>
                )}
              </div>
            </div>

            {/* 2. Event Timeline List */}
            <section className="track-material-timeline-panel">
              <div className="track-material-section-head">
                <Space size={8} align="baseline">
                  <Typography.Title level={5} style={{ margin: 0 }}>赛道事件</Typography.Title>
                  <span className="section-head-count">({filteredVisible.length})</span>
                  {selectedDate && (
                    <Button size="small" type="link" onClick={() => setSelectedDate(null)} style={{ padding: 0, marginLeft: 8 }}>
                      清除日期筛选 ({selectedDate})
                    </Button>
                  )}
                </Space>
              </div>

              {filteredVisible.length ? (
                <div className="track-material-timeline">
                  {filteredVisible.map((item) => (
                    <article className="track-material-card" key={item.id}>
                      {/* Row 1: Tags & Time */}
                      <div className="track-material-card-row-first">
                        <Space size={6}>
                          <DirectionTag direction={item.direction} />
                          <span className="track-material-card-track-name">{item.track_name || activeTrack?.name}</span>
                        </Space>
                        <span className="track-material-card-time">
                          {item.material_time ? formatTime(item.material_time) : formatTime(item.updated_at || item.created_at)}
                        </span>
                      </div>

                      {/* Row 2: Title */}
                      <div className="track-material-card-title">
                        {item.material_title || `${materialTypeLabel(item.material_type)} ID ${item.material_id}`}
                      </div>

                      {/* Row 3: Summary */}
                      <div className="track-material-card-summary">
                        {item.material_summary || "暂无材料摘要"}
                      </div>

                      {/* Row 4: Note */}
                      {item.note && item.note.trim() && (
                        <div className="track-material-card-note">
                          <span className="note-label">赛道判断：</span>
                          <span className="note-content">{item.note}</span>
                        </div>
                      )}

                      {/* Row 5: Footer & Actions */}
                      <div className="track-material-card-footer">
                        <span className="track-material-card-source">
                          来源：{item.material_source_name || materialTypeLabel(item.material_type)}
                        </span>
                        <Button
                          size="small"
                          className="track-material-card-edit-btn"
                          icon={<EditOutlined />}
                          onClick={() => openEditDrawer(item)}
                        >
                          编辑
                        </Button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <EmptyAction description="当前筛选下没有已处理的赛道材料" />
              )}
            </section>
          </div>

          <aside className="track-material-right-sidebar">
            {/* Today Statistics */}
            <div className="track-material-stats-section">
              <div className="track-material-section-head compact">
                <Typography.Title level={5} style={{ margin: 0 }}>今日数据统计</Typography.Title>
              </div>
              <div className="track-material-stats-panel">
                <div className="stats-grid">
                  <div className="stats-item">
                    <div className="stats-val">{stats.todayAdded}</div>
                    <div className="stats-lbl">今日新增</div>
                  </div>
                  <div className="stats-item">
                    <div className="stats-val color-pending">{stats.pending}</div>
                    <div className="stats-lbl">待处理</div>
                  </div>
                  <div className="stats-item">
                    <div className="stats-val color-confirmed">{stats.confirmed + stats.ignored}</div>
                    <div className="stats-lbl">已处理</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Pending Queue */}
            <div className="track-material-pending-panel">
              <div className="track-material-section-head compact">
                <Space size={8} align="baseline">
                  <Typography.Title level={5} style={{ margin: 0 }}>待处理队列</Typography.Title>
                  <span className="section-head-count">({filteredPending.length})</span>
                </Space>
              </div>
              {filteredPending.length ? (
                <div className="track-material-pending-list">
                  {filteredPending.map((item) => (
                    <article className="track-material-pending-card" key={item.id}>
                      <div className="pending-card-header">
                        <span className="track-material-card-track-name">{item.track_name || activeTrack?.name}</span>
                        <span className="pending-card-time">
                          {item.material_time ? formatTime(item.material_time).slice(5, 16) : formatTime(item.updated_at || item.created_at).slice(5, 16)}
                        </span>
                      </div>
                      <div className="pending-card-title">
                        {item.material_title || `${materialTypeLabel(item.material_type)} ID ${item.material_id}`}
                      </div>
                      <div className="pending-card-footer">
                        <span className="pending-card-source">
                          {item.material_source_name || materialTypeLabel(item.material_type)}
                        </span>
                        <Space size={4}>
                          <Button
                            size="small"
                            type="text"
                            style={{ fontSize: "12px", height: "22px", padding: "0 4px", color: "var(--ll-muted)" }}
                            onClick={() => handleStatusChange(item, "ignored")}
                          >
                            忽略
                          </Button>
                          <Button
                            size="small"
                            type="text"
                            style={{ fontSize: "12px", height: "22px", padding: "0 4px", color: "var(--ll-accent)", fontWeight: 500 }}
                            onClick={() => openEditDrawer(item)}
                          >
                            处理
                          </Button>
                        </Space>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <EmptyAction description="当前筛选下无待处理材料" />
              )}
            </div>
          </aside>
        </div>
      </DataPanel>

      <Drawer
        title={drawerMode === "edit" ? "编辑材料判断" : "引用材料"}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        size="large"
        extra={
          drawerMode === "edit" && editingMaterial?.status === "pending" ? (
            <Space size={6}>
              <Button size="small" icon={<CloseOutlined />} onClick={() => submitDrawer("ignored")}>忽略</Button>
              <Button type="primary" size="small" icon={<CheckOutlined />} onClick={() => submitDrawer("confirmed")}>确认</Button>
            </Space>
          ) : (
            <Button type="primary" size="small" onClick={() => submitDrawer()}>{drawerMode === "edit" ? "保存" : "引用"}</Button>
          )
        }
      >
        {editingMaterial ? renderMaterialReference(editingMaterial) : null}
        <Form form={form} layout="vertical" preserve={false}>
          {drawerMode === "create" && (
            <Form.Item
              name="track_id"
              label="关联赛道"
              rules={[{ required: true, message: "请选择关联赛道" }]}
              style={{ marginBottom: "16px" }}
            >
              <Select options={trackOptions} size="small" />
            </Form.Item>
          )}

          <div className="ll-parameter-grid">
            {/* Row 1 Col 1: Basic Info (来源 & 材料 ID) */}
            <div style={{ display: "flex", gap: "12px" }}>
              <Form.Item
                name="material_type"
                label="来源"
                rules={[{ required: true, message: "请选择来源" }]}
                style={{ flex: 1 }}
              >
                <Select disabled={drawerMode === "edit"} options={materialTypeOptions} size="small" />
              </Form.Item>
              <Form.Item
                name="material_id"
                label="材料 ID"
                rules={[{ required: true, message: "请输入材料 ID" }]}
                style={{ flex: 1 }}
              >
                <InputNumber disabled={drawerMode === "edit"} min={1} style={{ width: "100%" }} size="small" />
              </Form.Item>
            </div>

            {/* Row 1 Col 2: 状态 */}
            <Form.Item name="status" label="状态" rules={[{ required: true, message: "请选择状态" }]}>
              <Radio.Group optionType="button" buttonStyle="solid" size="small" className="ll-radio-group">
                <Radio.Button value="pending" className="ll-radio-btn-pending">待处理</Radio.Button>
                <Radio.Button value="confirmed" className="ll-radio-btn-confirmed">已确认</Radio.Button>
                <Radio.Button value="ignored" className="ll-radio-btn-ignored">已忽略</Radio.Button>
              </Radio.Group>
            </Form.Item>

            {/* Row 2 Col 1: 方向 */}
            <Form.Item name="direction" label="方向">
              <Radio.Group optionType="button" buttonStyle="solid" size="small" className="ll-radio-group">
                <Radio.Button value={null} className="ll-radio-btn-none">无</Radio.Button>
                <Radio.Button value="support" className="ll-radio-btn-support">支持</Radio.Button>
                <Radio.Button value="weaken" className="ll-radio-btn-weaken">削弱</Radio.Button>
                <Radio.Button value="neutral" className="ll-radio-btn-neutral">中性</Radio.Button>
                <Radio.Button value="noise" className="ll-radio-btn-noise">噪音</Radio.Button>
              </Radio.Group>
            </Form.Item>

            {/* Row 2 Col 2: 重要性 */}
            <Form.Item name="importance_level" label="重要性">
              <Radio.Group optionType="button" buttonStyle="solid" size="small" className="ll-radio-group">
                <Radio.Button value={null} className="ll-radio-btn-none">无</Radio.Button>
                <Radio.Button value="high" className="ll-radio-btn-high">高</Radio.Button>
                <Radio.Button value="medium" className="ll-radio-btn-medium">中</Radio.Button>
                <Radio.Button value="low" className="ll-radio-btn-low">低</Radio.Button>
              </Radio.Group>
            </Form.Item>
          </div>

          <Form.Item name="note" label="赛道视角判断">
            <Input.TextArea rows={4} placeholder="用一句话说明这条材料对赛道判断的影响" />
          </Form.Item>
          
          <div className="track-material-drawer-hint">
            <Typography.Text type="secondary">材料原文仍归属信息流或知识库，这里只保存赛道视角下的引用和判断。</Typography.Text>
          </div>
        </Form>
      </Drawer>
    </>
  );
}
