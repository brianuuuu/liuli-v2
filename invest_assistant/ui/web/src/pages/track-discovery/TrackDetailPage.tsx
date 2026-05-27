import { Button, Col, Form, Input, InputNumber, Modal, Row, Select, Space, Table, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  bindStockFromTrack,
  changeTrackStatus,
  createTrackAnalysisSnapshot,
  createTrackMaterial,
  getTrack,
  listStocksForTrack,
  listTrackAnalysisSnapshots,
  listTrackMaterials,
  updateTrack,
  updateTrackMaterial
} from "../../api/trackDiscovery";
import type { TrackAnalysisSnapshotPayload, TrackMaterialPayload, TrackPayload, TrackTagStockBindingPayload } from "../../api/trackDiscovery";
import { EmptyAction } from "../../components/common/EmptyAction";
import { PageHeader } from "../../components/common/PageHeader";
import { WorkbenchCard } from "../../components/common/WorkbenchCard";
import { useAsyncData } from "../../hooks/useAsyncData";
import type { StockTrackRelation, TrackAnalysisSnapshot, TrackMaterial } from "../../types/api";
import { confidenceOptions, DirectionTag, formatTime, stageOptions, StatusTag, thesisStatusOptions } from "./sections/shared";

export function TrackDetailPage() {
  const { id } = useParams();
  const trackId = Number(id || 0);
  const track = useAsyncData(useCallback(() => getTrack(trackId), [trackId]), null);
  const materials = useAsyncData(useCallback(() => (trackId ? listTrackMaterials(trackId) : Promise.resolve([])), [trackId]), []);
  const stocks = useAsyncData(useCallback(() => (trackId ? listStocksForTrack(trackId) : Promise.resolve([])), [trackId]), []);
  const snapshots = useAsyncData(useCallback(() => (trackId ? listTrackAnalysisSnapshots(trackId) : Promise.resolve([])), [trackId]), []);
  const [editOpen, setEditOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [editForm] = Form.useForm<TrackPayload>();
  const [statusForm] = Form.useForm<{ new_status: string; new_stage?: string; reason?: string }>();
  const [materialForm] = Form.useForm<TrackMaterialPayload>();
  const [stockForm] = Form.useForm<TrackTagStockBindingPayload>();
  const [snapshotForm] = Form.useForm<TrackAnalysisSnapshotPayload>();

  useEffect(() => {
    if (!editOpen || !track.data) return;
    editForm.setFieldsValue({
      name: track.data.name,
      description: track.data.description || null,
      status: track.data.status,
      track_score: track.data.track_score ?? null,
      current_view: track.data.current_view || null,
      stage: track.data.stage || null,
      confidence_level: track.data.confidence_level || null
    });
  }, [editForm, editOpen, track.data]);

  async function submitEdit() {
    const values = await editForm.validateFields();
    await updateTrack(trackId, values);
    message.success("赛道已更新");
    setEditOpen(false);
    await track.refresh();
  }

  async function submitStatus() {
    const values = await statusForm.validateFields();
    await changeTrackStatus(trackId, values.new_status, values.reason || null, values.new_stage || null);
    message.success("状态已变更");
    setStatusOpen(false);
    await track.refresh();
  }

  async function submitMaterial() {
    const values = await materialForm.validateFields();
    await createTrackMaterial(trackId, {
      material_type: values.material_type,
      material_id: values.material_id,
      direction: values.direction || null,
      importance_level: values.importance_level || null,
      status: values.status || "confirmed",
      note: values.note || null
    });
    message.success("材料已引用");
    materialForm.resetFields();
    await materials.refresh();
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
    await stocks.refresh();
  }

  async function submitSnapshot() {
    const values = await snapshotForm.validateFields();
    await createTrackAnalysisSnapshot(trackId, values);
    message.success("分析快照已新增");
    snapshotForm.resetFields();
    await snapshots.refresh();
  }

  async function confirmMaterial(record: TrackMaterial, status: string) {
    await updateTrackMaterial(record.id, { status });
    message.success("材料状态已更新");
    await materials.refresh();
  }

  const materialColumns: ColumnsType<TrackMaterial> = [
    { title: "来源", dataIndex: "material_type", width: 110, render: (value) => value === "source_item" ? "信息流" : "知识笔记" },
    { title: "材料 ID", dataIndex: "material_id", width: 90 },
    { title: "方向", dataIndex: "direction", width: 100, render: (value) => <DirectionTag direction={value} /> },
    { title: "重要性", dataIndex: "importance_level", width: 90, render: (value) => value || "-" },
    { title: "状态", dataIndex: "status", width: 90 },
    { title: "判断", dataIndex: "note", ellipsis: true, render: (value) => value || "-" },
    { title: "更新", dataIndex: "updated_at", width: 160, render: formatTime },
    {
      title: "操作",
      width: 140,
      render: (_, record) => (
        <Space>
          <Button size="small" disabled={record.status === "confirmed"} onClick={() => confirmMaterial(record, "confirmed")}>确认</Button>
          <Button size="small" disabled={record.status === "ignored"} onClick={() => confirmMaterial(record, "ignored")}>忽略</Button>
        </Space>
      )
    }
  ];

  const stockColumns: ColumnsType<StockTrackRelation> = [
    { title: "Stock ID", dataIndex: "stock_id", width: 100 },
    { title: "关系", dataIndex: "relation_type", width: 120, render: (value) => value || "-" },
    { title: "确信度", dataIndex: "conviction", width: 90, render: (value) => Number(value || 0).toFixed(2) },
    { title: "状态", dataIndex: "status", width: 90 },
    { title: "判断理由", dataIndex: "reason", ellipsis: true, render: (value) => value || "-" }
  ];

  const snapshotColumns: ColumnsType<TrackAnalysisSnapshot> = [
    { title: "日期", dataIndex: "analysis_date", width: 110 },
    { title: "市场空间", dataIndex: "market_space", ellipsis: true, render: (value) => value || "-" },
    { title: "当前规模", dataIndex: "market_size", ellipsis: true, render: (value) => value || "-" },
    { title: "增长速度", dataIndex: "growth_rate", width: 120, render: (value) => value || "-" },
    { title: "评分", dataIndex: "score", width: 80, render: (value) => value ?? "-" },
    { title: "置信", dataIndex: "confidence_level", width: 90, render: (value) => value || "-" },
    { title: "AI 分析", dataIndex: "ai_summary", ellipsis: true, render: (value) => value || "-" }
  ];

  if (!trackId) {
    return (
      <>
        <PageHeader title="赛道详情" description="无效 ID" />
        <WorkbenchCard><EmptyAction description="赛道 ID 无效" /></WorkbenchCard>
      </>
    );
  }

  return (
    <>
      <PageHeader title="赛道详情" description={`赛道 ID: ${id || "-"}`} />
      <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
        <WorkbenchCard
          title={track.data?.name || "基础判断"}
          extra={
            <Space>
              <Link to="/track-discovery">返回列表</Link>
              <Button size="small" onClick={() => setEditOpen(true)} disabled={!track.data}>编辑</Button>
              <Button size="small" onClick={() => { statusForm.setFieldsValue({ new_status: track.data?.status || "candidate", new_stage: track.data?.stage || undefined }); setStatusOpen(true); }} disabled={!track.data}>状态</Button>
            </Space>
          }
        >
          {track.data ? (
            <Row gutter={[12, 12]}>
              <Col span={16}>
                <Typography.Text type="secondary">当前判断</Typography.Text>
                <Typography.Paragraph>{track.data.current_view || "-"}</Typography.Paragraph>
                <Typography.Text type="secondary">赛道说明</Typography.Text>
                <Typography.Paragraph>{track.data.description || "-"}</Typography.Paragraph>
              </Col>
              <Col span={8}>
                <div className="detail-list">
                  <div className="detail-row"><span>状态</span><StatusTag status={track.data.status} /></div>
                  <div className="detail-row"><span>阶段</span><span>{stageOptions.find((item) => item.value === track.data?.stage)?.label || track.data.stage || "-"}</span></div>
                  <div className="detail-row"><span>评分</span><span>{track.data.track_score ?? "-"}</span></div>
                  <div className="detail-row"><span>置信度</span><span>{track.data.confidence_level || "-"}</span></div>
                  <div className="detail-row"><span>Tag ID</span><span>{track.data.tag?.id || "-"}</span></div>
                  <div className="detail-row"><span>更新</span><span>{formatTime(track.data.updated_at)}</span></div>
                </div>
              </Col>
            </Row>
          ) : (
            <EmptyAction description={track.loading ? "加载中" : "赛道不存在"} />
          )}
        </WorkbenchCard>

        <WorkbenchCard title="赛道动态">
          <Table rowKey="id" size="small" loading={materials.loading} dataSource={materials.data} columns={materialColumns} pagination={{ pageSize: 8 }} />
          <Form form={materialForm} layout="vertical" preserve={false} style={{ marginTop: 12 }} onFinish={submitMaterial} initialValues={{ material_type: "source_item", status: "confirmed" }}>
            <Space.Compact block>
              <Form.Item name="material_type" label="来源" style={{ width: "25%" }} rules={[{ required: true }]}>
                <Select options={[{ value: "source_item", label: "信息流" }, { value: "knowledge_note", label: "知识笔记" }]} />
              </Form.Item>
              <Form.Item name="material_id" label="材料 ID" style={{ width: "25%" }} rules={[{ required: true, message: "请输入材料 ID" }]}>
                <InputNumber min={1} style={{ width: "100%" }} />
              </Form.Item>
              <Form.Item name="direction" label="方向" style={{ width: "25%" }}>
                <Select allowClear options={[{ value: "support", label: "support" }, { value: "weaken", label: "weaken" }, { value: "neutral", label: "neutral" }, { value: "noise", label: "noise" }]} />
              </Form.Item>
              <Form.Item name="importance_level" label="重要性" style={{ width: "25%" }}>
                <Select allowClear options={[{ value: "high", label: "high" }, { value: "medium", label: "medium" }, { value: "low", label: "low" }]} />
              </Form.Item>
            </Space.Compact>
            <Form.Item name="note" label="赛道视角判断">
              <Input.TextArea rows={2} />
            </Form.Item>
            <Button htmlType="submit" size="small" type="primary">引用材料</Button>
          </Form>
        </WorkbenchCard>

        <WorkbenchCard title="绑定标的">
          <Table rowKey="id" size="small" loading={stocks.loading} dataSource={stocks.data} columns={stockColumns} pagination={{ pageSize: 8 }} />
          <Form form={stockForm} layout="vertical" preserve={false} style={{ marginTop: 12 }} onFinish={submitStock}>
            <Space.Compact block>
              <Form.Item name="stock_id" label="Stock ID" style={{ width: "34%" }} rules={[{ required: true, message: "请输入 Stock ID" }]}>
                <InputNumber min={1} style={{ width: "100%" }} />
              </Form.Item>
              <Form.Item name="relation_type" label="关系类型" style={{ width: "33%" }}>
                <Input placeholder="beneficiary / exposure" />
              </Form.Item>
              <Form.Item name="conviction" label="确信度" style={{ width: "33%" }}>
                <InputNumber min={0} max={1} step={0.1} style={{ width: "100%" }} />
              </Form.Item>
            </Space.Compact>
            <Form.Item name="reason" label="判断理由">
              <Input.TextArea rows={2} />
            </Form.Item>
            <Button htmlType="submit" size="small" type="primary">绑定标的</Button>
          </Form>
        </WorkbenchCard>

        <WorkbenchCard title="分析快照">
          <Table rowKey="id" size="small" loading={snapshots.loading} dataSource={snapshots.data} columns={snapshotColumns} pagination={{ pageSize: 8 }} />
          <Form form={snapshotForm} layout="vertical" preserve={false} style={{ marginTop: 12 }} onFinish={submitSnapshot}>
            <Space.Compact block>
              <Form.Item name="analysis_date" label="日期" style={{ width: "25%" }} rules={[{ required: true, message: "请输入日期" }]}>
                <Input placeholder="2026-05-27" />
              </Form.Item>
              <Form.Item name="score" label="评分" style={{ width: "25%" }}>
                <InputNumber min={0} max={100} style={{ width: "100%" }} />
              </Form.Item>
              <Form.Item name="confidence_level" label="置信度" style={{ width: "25%" }}>
                <Select allowClear options={confidenceOptions} />
              </Form.Item>
              <Form.Item name="growth_rate" label="增长速度" style={{ width: "25%" }}>
                <Input />
              </Form.Item>
            </Space.Compact>
            <Form.Item name="market_space" label="市场空间"><Input /></Form.Item>
            <Form.Item name="market_size" label="当前规模"><Input /></Form.Item>
            <Form.Item name="ai_summary" label="AI / 人工分析"><Input.TextArea rows={2} /></Form.Item>
            <Space.Compact block>
              <Form.Item name="opportunity_points" label="机会" style={{ width: "50%" }}><Input.TextArea rows={2} /></Form.Item>
              <Form.Item name="risk_points" label="风险" style={{ width: "50%" }}><Input.TextArea rows={2} /></Form.Item>
            </Space.Compact>
            <Form.Item name="watch_signals" label="观察信号"><Input.TextArea rows={2} /></Form.Item>
            <Button htmlType="submit" size="small" type="primary">新增快照</Button>
          </Form>
        </WorkbenchCard>
      </div>

      <Modal title="编辑赛道" open={editOpen} onCancel={() => setEditOpen(false)} onOk={submitEdit} destroyOnHidden forceRender width={560}>
        <Form form={editForm} layout="vertical" preserve={false}>
          <Form.Item name="name" label="赛道名称" rules={[{ required: true, message: "请输入赛道名称" }]}><Input /></Form.Item>
          <Form.Item name="description" label="说明"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="status" label="状态" rules={[{ required: true, message: "请选择状态" }]}><Select options={thesisStatusOptions} /></Form.Item>
          <Space.Compact block>
            <Form.Item name="track_score" label="评分" style={{ width: "34%" }}><InputNumber min={0} max={100} style={{ width: "100%" }} /></Form.Item>
            <Form.Item name="stage" label="阶段" style={{ width: "33%" }}><Select allowClear options={stageOptions} /></Form.Item>
            <Form.Item name="confidence_level" label="置信度" style={{ width: "33%" }}><Select allowClear options={confidenceOptions} /></Form.Item>
          </Space.Compact>
          <Form.Item name="current_view" label="当前判断"><Input.TextArea rows={3} /></Form.Item>
        </Form>
      </Modal>

      <Modal title="变更状态" open={statusOpen} onCancel={() => setStatusOpen(false)} onOk={submitStatus} destroyOnHidden>
        <Form form={statusForm} layout="vertical" preserve={false}>
          <Form.Item name="new_status" label="新状态" rules={[{ required: true, message: "请选择状态" }]}><Select options={thesisStatusOptions} /></Form.Item>
          <Form.Item name="new_stage" label="新阶段"><Select allowClear options={stageOptions} /></Form.Item>
          <Form.Item name="reason" label="原因"><Input.TextArea rows={3} /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}
