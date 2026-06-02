import { Button, Form, Input, InputNumber, Modal, Select, Space, Table, Tabs, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { EChartsOption } from "echarts";
import ReactECharts from "echarts-for-react";
import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useLiuliTheme } from "../../app/theme";
import {
  bindStockFromTrack,
  changeTrackStatus,
  createTrackAnalysisSnapshot,
  createTrackMaterial,
  getTrackDetail,
  listTracks,
  updateTrack,
  updateTrackMaterial
} from "../../api/trackDiscovery";
import type { TrackAnalysisSnapshotPayload, TrackMaterialPayload, TrackPayload, TrackTagStockBindingPayload } from "../../api/trackDiscovery";
import { chartBackgroundColor, chartGridColor, chartTextColor } from "../../components/charts/chartTheme";
import { EmptyAction } from "../../components/common/EmptyAction";
import { PageHeader } from "../../components/common/PageHeader";
import { WorkbenchCard } from "../../components/common/WorkbenchCard";
import { useAsyncData } from "../../hooks/useAsyncData";
import type {
  TagBinding,
  Track,
  TrackAnalysisSnapshot,
  TrackDetail,
  TrackDetailHeatTrend,
  TrackDetailStockRelation,
  TrackMaterial
} from "../../types/api";
import { confidenceOptions, DirectionTag, formatTime, stageOptions, StatusTag, thesisStatusOptions } from "./sections/shared";

const materialTypeLabels: Record<string, string> = {
  source_item: "信息流",
  knowledge_note: "知识笔记"
};

const materialStatusLabels: Record<string, string> = {
  pending: "待研判",
  confirmed: "已确认",
  ignored: "已忽略"
};

function numberText(value?: number | null, suffix = "") {
  return value === null || value === undefined ? "-" : `${Number(value).toFixed(2).replace(/\.00$/, "")}${suffix}`;
}

function stageText(value?: string | null) {
  return stageOptions.find((item) => item.value === value)?.label || value || "-";
}

function confidenceText(value?: string | null) {
  return confidenceOptions.find((item) => item.value === value)?.label || value || "-";
}

function stockLabel(record: TrackDetailStockRelation) {
  return record.stock_name || record.stock_code || `Stock ${record.stock_id}`;
}

function materialTime(record: TrackMaterial) {
  return record.material_time || record.updated_at || record.created_at || null;
}

function latestHeatTime(data: TrackDetail) {
  const points = data.heat_trends.flatMap((trend) => trend.points);
  return points.sort((a, b) => String(b.stat_time).localeCompare(String(a.stat_time)))[0]?.stat_time || null;
}

function heatTrendOption(trends: TrackDetailHeatTrend[], mode: "light" | "dark"): EChartsOption {
  const textColor = chartTextColor(mode);
  const gridColor = chartGridColor(mode);
  const dates = Array.from(new Set(trends.flatMap((trend) => trend.points.map((point) => point.stat_time)))).sort();
  return {
    tooltip: { trigger: "axis" },
    legend: { top: 0, textStyle: { color: textColor } },
    grid: { left: 46, right: 18, top: 38, bottom: 34 },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: dates.map((item) => formatTime(item).slice(5, 16)),
      axisLabel: { color: textColor },
      axisLine: { lineStyle: { color: gridColor } }
    },
    yAxis: {
      type: "value",
      axisLabel: { color: textColor },
      splitLine: { lineStyle: { color: gridColor } }
    },
    series: trends.map((trend) => {
      const pointByTime = new Map(trend.points.map((point) => [point.stat_time, point.heat_score]));
      return {
        name: trend.window_type,
        type: "line",
        smooth: true,
        showSymbol: false,
        data: dates.map((date) => pointByTime.get(date) ?? null)
      };
    })
  };
}

function snapshotScoreOption(rows: TrackAnalysisSnapshot[], mode: "light" | "dark"): EChartsOption {
  const textColor = chartTextColor(mode);
  const gridColor = chartGridColor(mode);
  const ordered = [...rows].sort((a, b) => a.analysis_date.localeCompare(b.analysis_date));
  return {
    tooltip: { trigger: "axis" },
    grid: { left: 42, right: 18, top: 24, bottom: 28 },
    xAxis: {
      type: "category",
      data: ordered.map((item) => item.analysis_date),
      axisLabel: { color: textColor },
      axisLine: { lineStyle: { color: gridColor } }
    },
    yAxis: {
      type: "value",
      min: 0,
      max: 100,
      axisLabel: { color: textColor },
      splitLine: { lineStyle: { color: gridColor } }
    },
    series: [{ name: "评分", type: "line", smooth: true, data: ordered.map((item) => item.score ?? null) }]
  };
}

export function TrackDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const trackId = Number(id || 0);
  const detail = useAsyncData(useCallback(() => (trackId ? getTrackDetail(trackId) : Promise.resolve(null)), [trackId]), null);
  const tracks = useAsyncData(useCallback(() => listTracks(), []), []);
  const [editOpen, setEditOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [materialOpen, setMaterialOpen] = useState(false);
  const [stockOpen, setStockOpen] = useState(false);
  const [snapshotOpen, setSnapshotOpen] = useState(false);
  const [editForm] = Form.useForm<TrackPayload>();
  const [statusForm] = Form.useForm<{ new_status: string; new_stage?: string; reason?: string }>();
  const [materialForm] = Form.useForm<TrackMaterialPayload>();
  const [stockForm] = Form.useForm<TrackTagStockBindingPayload>();
  const [snapshotForm] = Form.useForm<TrackAnalysisSnapshotPayload>();

  const trackSwitchOptions = useMemo(
    () =>
      tracks.data.map((track) => ({
        value: track.id,
        label: track.name,
        searchText: track.name,
        disabled: track.id === trackId
      })),
    [trackId, tracks.data]
  );

  function switchTrack(targetTrackId: number) {
    if (!targetTrackId || targetTrackId === trackId) return;
    navigate(`/track-discovery/tracks/${targetTrackId}`);
  }

  function openEdit(track: Track) {
    editForm.setFieldsValue({
      name: track.name,
      description: track.description || null,
      status: track.status,
      track_score: track.track_score ?? null,
      current_view: track.current_view || null,
      stage: track.stage || null,
      confidence_level: track.confidence_level || null
    });
    setEditOpen(true);
  }

  function openStatus(track: Track) {
    statusForm.setFieldsValue({ new_status: track.status || "candidate", new_stage: track.stage || undefined });
    setStatusOpen(true);
  }

  async function submitEdit() {
    const values = await editForm.validateFields();
    await updateTrack(trackId, values);
    message.success("赛道已更新");
    setEditOpen(false);
    await detail.refresh();
    await tracks.refresh();
  }

  async function submitStatus() {
    const values = await statusForm.validateFields();
    await changeTrackStatus(trackId, values.new_status, values.reason || null, values.new_stage || null);
    message.success("状态已变更");
    setStatusOpen(false);
    await detail.refresh();
    await tracks.refresh();
  }

  async function submitMaterial() {
    const values = await materialForm.validateFields();
    await createTrackMaterial(trackId, {
      material_type: values.material_type,
      material_id: values.material_id,
      direction: values.direction || null,
      importance_level: values.importance_level || null,
      status: values.status || "pending",
      note: values.note || null
    });
    message.success("材料已引用");
    materialForm.resetFields();
    setMaterialOpen(false);
    await detail.refresh();
  }

  async function submitStock() {
    const values = await stockForm.validateFields();
    await bindStockFromTrack(trackId, {
      stock_id: values.stock_id,
      relation_type: values.relation_type || null,
      conviction: values.conviction || 0,
      reason: values.reason || null,
      status: values.status || "active"
    });
    message.success("绑定标的已更新");
    stockForm.resetFields();
    setStockOpen(false);
    await detail.refresh();
  }

  async function submitSnapshot() {
    const values = await snapshotForm.validateFields();
    await createTrackAnalysisSnapshot(trackId, values);
    message.success("分析快照已新增");
    snapshotForm.resetFields();
    setSnapshotOpen(false);
    await detail.refresh();
  }

  async function updateMaterialStatus(record: TrackMaterial, status: string) {
    await updateTrackMaterial(record.id, { status });
    message.success("材料状态已更新");
    await detail.refresh();
  }

  if (!trackId) {
    return (
      <>
        <PageHeader title="赛道详情" description="无效 ID" actions={<TrackDetailActions trackId={trackId} options={trackSwitchOptions} loading={tracks.loading} onSwitch={switchTrack} />} />
        <WorkbenchCard><EmptyAction description="赛道 ID 无效" /></WorkbenchCard>
      </>
    );
  }

  const data = detail.data;

  return (
    <>
      {!data ? (
        <>
          <PageHeader title="赛道详情" actions={<TrackDetailActions trackId={trackId} options={trackSwitchOptions} loading={tracks.loading} onSwitch={switchTrack} />} />
          <WorkbenchCard><EmptyAction description={detail.loading ? "加载中" : "赛道不存在或暂无详情数据"} /></WorkbenchCard>
        </>
      ) : (
        <>
          <PageHeader title="赛道详情" actions={<TrackDetailActions trackId={trackId} options={trackSwitchOptions} loading={tracks.loading} onSwitch={switchTrack} />} />
          <div className="track-detail">
            <TrackIdentityPanel data={data} />
            <Tabs
              className="track-detail-tabs"
              items={[
                { key: "overview", label: "概览", children: <OverviewTab data={data} onEdit={() => openEdit(data.track)} onStatus={() => openStatus(data.track)} /> },
                { key: "heat", label: "热度", children: <HeatTab data={data} /> },
                {
                  key: "materials",
                  label: "材料动态",
                  children: (
                    <MaterialsTab
                      data={data}
                      onAdd={() => {
                        materialForm.setFieldsValue({ material_type: "source_item", status: "pending" });
                        setMaterialOpen(true);
                      }}
                      onConfirm={(record) => updateMaterialStatus(record, "confirmed")}
                      onIgnore={(record) => updateMaterialStatus(record, "ignored")}
                    />
                  )
                },
                { key: "stocks", label: "关联标的", children: <StocksTab data={data} onAdd={() => setStockOpen(true)} /> },
                { key: "tags", label: "标签关系", children: <TagsTab data={data} /> },
                { key: "snapshots", label: "分析快照", children: <SnapshotsTab data={data} onAdd={() => setSnapshotOpen(true)} /> }
              ]}
            />
          </div>
        </>
      )}

      <Modal title="编辑赛道" open={editOpen} onCancel={() => setEditOpen(false)} onOk={submitEdit} destroyOnHidden forceRender width={680}>
        <Form form={editForm} layout="vertical" preserve={false}>
          <div className="track-detail-form-grid compact">
            <Form.Item name="name" label="赛道名称" rules={[{ required: true, message: "请输入赛道名称" }]}><Input /></Form.Item>
            <Form.Item name="status" label="状态" rules={[{ required: true, message: "请选择状态" }]}><Select options={thesisStatusOptions} /></Form.Item>
            <Form.Item name="track_score" label="评分"><InputNumber min={0} max={100} style={{ width: "100%" }} /></Form.Item>
            <Form.Item name="stage" label="阶段"><Select allowClear options={stageOptions} /></Form.Item>
            <Form.Item name="confidence_level" label="置信度"><Select allowClear options={confidenceOptions} /></Form.Item>
          </div>
          <Form.Item name="description" label="赛道说明"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="current_view" label="当前判断"><Input.TextArea rows={4} /></Form.Item>
        </Form>
      </Modal>

      <Modal title="变更状态" open={statusOpen} onCancel={() => setStatusOpen(false)} onOk={submitStatus} destroyOnHidden forceRender width={520}>
        <Form form={statusForm} layout="vertical" preserve={false}>
          <div className="track-detail-form-grid compact">
            <Form.Item name="new_status" label="新状态" rules={[{ required: true, message: "请选择状态" }]}><Select options={thesisStatusOptions} /></Form.Item>
            <Form.Item name="new_stage" label="新阶段"><Select allowClear options={stageOptions} /></Form.Item>
          </div>
          <Form.Item name="reason" label="原因"><Input.TextArea rows={3} /></Form.Item>
        </Form>
      </Modal>

      <Modal title="引用材料" open={materialOpen} onCancel={() => setMaterialOpen(false)} onOk={submitMaterial} destroyOnHidden forceRender width={680}>
        <Form form={materialForm} layout="vertical" preserve={false}>
          <div className="track-detail-form-grid">
            <Form.Item name="material_type" label="来源" rules={[{ required: true }]}><Select options={[{ value: "source_item", label: "信息流" }, { value: "knowledge_note", label: "知识笔记" }]} /></Form.Item>
            <Form.Item name="material_id" label="材料 ID" rules={[{ required: true, message: "请输入材料 ID" }]}><InputNumber min={1} style={{ width: "100%" }} /></Form.Item>
            <Form.Item name="direction" label="方向"><Select allowClear options={[{ value: "support", label: "支持" }, { value: "weaken", label: "削弱" }, { value: "neutral", label: "中性" }, { value: "noise", label: "噪音" }]} /></Form.Item>
            <Form.Item name="importance_level" label="重要性"><Select allowClear options={[{ value: "high", label: "high" }, { value: "medium", label: "medium" }, { value: "low", label: "low" }]} /></Form.Item>
            <Form.Item name="status" label="状态"><Select options={[{ value: "pending", label: "待研判" }, { value: "confirmed", label: "已确认" }, { value: "ignored", label: "已忽略" }]} /></Form.Item>
          </div>
          <Form.Item name="note" label="赛道视角判断"><Input.TextArea rows={3} /></Form.Item>
        </Form>
      </Modal>

      <Modal title="绑定标的" open={stockOpen} onCancel={() => setStockOpen(false)} onOk={submitStock} destroyOnHidden forceRender width={620}>
        <Form form={stockForm} layout="vertical" preserve={false}>
          <div className="track-detail-form-grid compact">
            <Form.Item name="stock_id" label="Stock ID" rules={[{ required: true, message: "请输入 Stock ID" }]}><InputNumber min={1} style={{ width: "100%" }} /></Form.Item>
            <Form.Item name="relation_type" label="关系类型"><Input placeholder="core / exposure / watch" /></Form.Item>
            <Form.Item name="conviction" label="确信度"><InputNumber min={0} max={1} step={0.1} style={{ width: "100%" }} /></Form.Item>
            <Form.Item name="status" label="状态"><Select options={[{ value: "active", label: "active" }, { value: "disabled", label: "disabled" }]} /></Form.Item>
          </div>
          <Form.Item name="reason" label="判断理由"><Input.TextArea rows={3} /></Form.Item>
        </Form>
      </Modal>

      <Modal title="新增分析快照" open={snapshotOpen} onCancel={() => setSnapshotOpen(false)} onOk={submitSnapshot} destroyOnHidden forceRender width={760}>
        <Form form={snapshotForm} layout="vertical" preserve={false}>
          <div className="track-detail-form-grid">
            <Form.Item name="analysis_date" label="日期" rules={[{ required: true, message: "请选择日期" }]}><input className="ant-input" type="date" /></Form.Item>
            <Form.Item name="score" label="评分"><InputNumber min={0} max={100} style={{ width: "100%" }} /></Form.Item>
            <Form.Item name="confidence_level" label="置信度"><Select allowClear options={confidenceOptions} /></Form.Item>
            <Form.Item name="growth_rate" label="增长速度"><Input /></Form.Item>
          </div>
          <Form.Item name="market_space" label="市场空间"><Input /></Form.Item>
          <Form.Item name="market_size" label="当前规模"><Input /></Form.Item>
          <Form.Item name="heat_summary" label="热度判断"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="ai_summary" label="AI / 人工分析"><Input.TextArea rows={2} /></Form.Item>
          <div className="track-detail-form-grid compact">
            <Form.Item name="opportunity_points" label="机会"><Input.TextArea rows={2} /></Form.Item>
            <Form.Item name="risk_points" label="风险"><Input.TextArea rows={2} /></Form.Item>
            <Form.Item name="watch_signals" label="观察信号"><Input.TextArea rows={2} /></Form.Item>
          </div>
        </Form>
      </Modal>
    </>
  );
}

function TrackDetailActions({
  trackId,
  options,
  loading,
  onSwitch
}: {
  trackId: number;
  options: { value: number; label: string; searchText: string; disabled?: boolean }[];
  loading: boolean;
  onSwitch: (trackId: number) => void;
}) {
  return (
    <div className="track-detail-actions">
      <span className="track-detail-action-label">切换赛道</span>
      <Select
        className="track-detail-switcher"
        size="small"
        value={trackId || undefined}
        placeholder="切换赛道"
        loading={loading}
        showSearch
        optionFilterProp="searchText"
        options={options}
        onChange={onSwitch}
        popupMatchSelectWidth={220}
      />
      <Link to="/track-discovery" className="track-detail-back-link">返回赛道发现</Link>
    </div>
  );
}

function TrackIdentityPanel({ data }: { data: TrackDetail }) {
  return (
    <WorkbenchCard>
      <div className="track-detail-identity">
        <div className="track-detail-title-row">
          <span className="track-detail-title">{data.track.name || "-"}</span>
        </div>
        <div className="track-detail-metrics">
          <Metric label="状态" value={<StatusTag status={data.track.status} />} />
          <Metric label="阶段" value={stageText(data.track.stage)} />
          <Metric label="评分" value={numberText(data.track.track_score)} />
          <Metric label="置信度" value={confidenceText(data.track.confidence_level)} />
          <div className="track-detail-metric tags">
            <span>关联标签</span>
            <div className="track-detail-tags">
              {data.tags.length ? data.tags.map((item) => <Tag key={item.id}>{item.tag?.name || "-"}</Tag>) : <strong>-</strong>}
            </div>
          </div>
          <Metric label="绑定标的" value={String(data.summary.bound_stock_count)} />
          <Metric label="材料" value={String(data.summary.material_count)} />
          <Metric label="更新" value={formatTime(data.summary.last_updated_at).slice(5, 16)} />
        </div>
      </div>
    </WorkbenchCard>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="track-detail-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function InlineChart({ option, height = 260 }: { option: EChartsOption; height?: number }) {
  const { resolvedMode } = useLiuliTheme();
  return (
    <ReactECharts
      option={{ backgroundColor: chartBackgroundColor(resolvedMode), ...option }}
      style={{ height, width: "100%" }}
      notMerge
    />
  );
}

function OverviewTab({ data, onEdit, onStatus }: { data: TrackDetail; onEdit: () => void; onStatus: () => void }) {
  const importantMaterials = data.materials.filter((item) => item.importance_level === "high").slice(0, 5);
  const latest = data.latest_snapshot;
  return (
    <WorkbenchCard>
      <div className="track-detail-panel">
        <div className="track-detail-panel-toolbar">
          <span>研究判断</span>
          <Space>
            <Button size="small" onClick={onEdit}>编辑赛道</Button>
            <Button size="small" onClick={onStatus}>变更状态</Button>
          </Space>
        </div>
        <div className="track-detail-overview-main">
          <div>
            <div className="track-detail-subtitle">当前判断</div>
            <Typography.Paragraph>{data.track.current_view || "暂无当前判断"}</Typography.Paragraph>
            <div className="track-detail-subtitle">赛道说明</div>
            <Typography.Paragraph>{data.track.description || "暂无赛道说明"}</Typography.Paragraph>
          </div>
          <div className="detail-list track-detail-keyfacts">
            <div className="detail-row"><span>最新快照</span><span>{latest?.analysis_date || "-"}</span></div>
            <div className="detail-row"><span>快照评分</span><span>{numberText(latest?.score)}</span></div>
            <div className="detail-row"><span>市场空间</span><span>{latest?.market_space || "-"}</span></div>
            <div className="detail-row"><span>当前规模</span><span>{latest?.market_size || "-"}</span></div>
            <div className="detail-row"><span>增长速度</span><span>{latest?.growth_rate || "-"}</span></div>
            <div className="detail-row"><span>待研判材料</span><span>{data.summary.pending_material_count}</span></div>
          </div>
        </div>
        <div className="track-detail-panel-section">
          <div className="track-detail-subtitle">最近重要材料</div>
          {importantMaterials.length ? <MaterialList rows={importantMaterials} /> : <EmptyAction description="暂无高重要材料" />}
        </div>
      </div>
    </WorkbenchCard>
  );
}

function HeatTab({ data }: { data: TrackDetail }) {
  const { resolvedMode } = useLiuliTheme();
  return (
    <WorkbenchCard>
      <div className="track-detail-panel">
        <div className="track-detail-panel-toolbar">
          <span>热度趋势</span>
          <Typography.Text type="secondary">最近统计 {formatTime(latestHeatTime(data)).slice(5, 16)}</Typography.Text>
        </div>
        {data.heat_trends.length ? <InlineChart option={heatTrendOption(data.heat_trends, resolvedMode)} /> : <EmptyAction description="暂无热度趋势" />}
        <div className="track-detail-panel-section">
          <div className="detail-list track-detail-keyfacts">
            <div className="detail-row"><span>当前热度</span><span>{numberText(data.summary.latest_heat_score)}</span></div>
            <div className="detail-row"><span>关联标签</span><span>{data.summary.tag_count}</span></div>
            <div className="detail-row"><span>热度窗口</span><span>{data.heat_trends.map((item) => item.window_type).join(" / ") || "-"}</span></div>
            <div className="detail-row"><span>热度判断</span><span>{data.latest_snapshot?.heat_summary || "-"}</span></div>
          </div>
        </div>
      </div>
    </WorkbenchCard>
  );
}

function MaterialsTab({
  data,
  onAdd,
  onConfirm,
  onIgnore
}: {
  data: TrackDetail;
  onAdd: () => void;
  onConfirm: (record: TrackMaterial) => void;
  onIgnore: (record: TrackMaterial) => void;
}) {
  const columns: ColumnsType<TrackMaterial> = [
    { title: "来源", dataIndex: "material_type", width: 100, render: (value) => materialTypeLabels[value] || value },
    {
      title: "标题",
      dataIndex: "material_title",
      ellipsis: true,
      render: (value, record) => record.material_url ? <a href={record.material_url} target="_blank" rel="noreferrer">{value || "-"}</a> : value || "-"
    },
    { title: "时间", width: 150, render: (_, record) => formatTime(materialTime(record)) },
    { title: "重要性", dataIndex: "importance_level", width: 90, render: (value) => value ? <Tag color={value === "high" ? "red" : value === "medium" ? "gold" : "default"}>{value}</Tag> : "-" },
    { title: "方向", dataIndex: "direction", width: 90, render: (value) => <DirectionTag direction={value} /> },
    { title: "状态", dataIndex: "status", width: 90, render: (value) => materialStatusLabels[value] || value || "-" },
    { title: "备注", dataIndex: "note", ellipsis: true, render: (value) => value || "-" },
    {
      title: "操作",
      width: 130,
      render: (_, record) => (
        <Space>
          <Button size="small" disabled={record.status === "confirmed"} onClick={() => onConfirm(record)}>确认</Button>
          <Button size="small" disabled={record.status === "ignored"} onClick={() => onIgnore(record)}>忽略</Button>
        </Space>
      )
    }
  ];
  return (
    <WorkbenchCard>
      <div className="track-detail-panel">
        <div className="track-detail-panel-toolbar">
          <span>材料动态</span>
          <Button size="small" type="primary" onClick={onAdd}>引用材料</Button>
        </div>
        <Table rowKey="id" size="small" dataSource={data.materials} columns={columns} pagination={{ pageSize: 10 }} scroll={{ x: 980 }} />
      </div>
    </WorkbenchCard>
  );
}

function StocksTab({ data, onAdd }: { data: TrackDetail; onAdd: () => void }) {
  const columns: ColumnsType<TrackDetailStockRelation> = [
    {
      title: "标的",
      ellipsis: true,
      render: (_, record) => <Link to={`/stock-analysis/stocks/${record.stock_id}`}>{stockLabel(record)}</Link>
    },
    { title: "代码", dataIndex: "stock_code", width: 100, render: (value) => value || "-" },
    { title: "关系", dataIndex: "relation_type", width: 120, render: (value) => value || "-" },
    { title: "确信度", dataIndex: "conviction", width: 90, render: (value) => numberText(value) },
    { title: "状态", dataIndex: "status", width: 90 },
    { title: "判断理由", dataIndex: "reason", ellipsis: true, render: (value) => value || "-" },
    { title: "更新", dataIndex: "updated_at", width: 150, render: formatTime }
  ];
  return (
    <WorkbenchCard>
      <div className="track-detail-panel">
        <div className="track-detail-panel-toolbar">
          <span>关联标的</span>
          <Button size="small" type="primary" onClick={onAdd}>绑定标的</Button>
        </div>
        <Table rowKey="id" size="small" dataSource={data.stocks} columns={columns} pagination={{ pageSize: 10 }} scroll={{ x: 850 }} />
      </div>
    </WorkbenchCard>
  );
}

function TagsTab({ data }: { data: TrackDetail }) {
  const columns: ColumnsType<TagBinding> = [
    { title: "标签", render: (_, record) => record.tag?.name || "-" },
    { title: "类型", render: (_, record) => record.tag?.type || "-" },
    { title: "来源", dataIndex: "source", width: 110, render: (value) => value || "-" },
    { title: "状态", dataIndex: "status", width: 110 },
    { title: "更新", dataIndex: "updated_at", width: 150, render: formatTime }
  ];
  return (
    <WorkbenchCard>
      <div className="track-detail-panel">
        <div className="track-detail-panel-toolbar">
          <span>标签关系</span>
        </div>
        <Table rowKey="id" size="small" dataSource={data.tags} columns={columns} pagination={false} />
      </div>
    </WorkbenchCard>
  );
}

function SnapshotsTab({ data, onAdd }: { data: TrackDetail; onAdd: () => void }) {
  const { resolvedMode } = useLiuliTheme();
  const columns: ColumnsType<TrackAnalysisSnapshot> = [
    { title: "日期", dataIndex: "analysis_date", width: 110 },
    { title: "评分", dataIndex: "score", width: 80, render: (value) => numberText(value) },
    { title: "置信度", dataIndex: "confidence_level", width: 90, render: confidenceText },
    { title: "市场空间", dataIndex: "market_space", ellipsis: true, render: (value) => value || "-" },
    { title: "当前规模", dataIndex: "market_size", ellipsis: true, render: (value) => value || "-" },
    { title: "增长速度", dataIndex: "growth_rate", width: 120, render: (value) => value || "-" },
    { title: "热度判断", dataIndex: "heat_summary", ellipsis: true, render: (value) => value || "-" },
    { title: "观察信号", dataIndex: "watch_signals", ellipsis: true, render: (value) => value || "-" }
  ];
  return (
    <WorkbenchCard>
      <div className="track-detail-panel">
        <div className="track-detail-panel-toolbar">
          <span>分析快照</span>
          <Button size="small" type="primary" onClick={onAdd}>新增快照</Button>
        </div>
        {data.analysis_snapshots.length ? <InlineChart option={snapshotScoreOption(data.analysis_snapshots, resolvedMode)} height={220} /> : <EmptyAction description="暂无分析快照趋势" />}
        <Table rowKey="id" size="small" dataSource={data.analysis_snapshots} columns={columns} pagination={{ pageSize: 8 }} scroll={{ x: 980 }} />
      </div>
    </WorkbenchCard>
  );
}

function MaterialList({ rows }: { rows: TrackMaterial[] }) {
  return (
    <div className="track-detail-list">
      {rows.map((item) => (
        <div className="track-detail-list-item" key={item.id}>
          <span>{materialTypeLabels[item.material_type] || item.material_type}</span>
          <strong>{item.material_title || "-"}</strong>
          <em>{formatTime(materialTime(item))}</em>
        </div>
      ))}
    </div>
  );
}
