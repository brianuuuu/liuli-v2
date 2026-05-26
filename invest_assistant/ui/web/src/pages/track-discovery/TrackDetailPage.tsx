import { Button, Col, Form, Input, InputNumber, Modal, Row, Select, Space, Table, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  changeTrackStatus,
  createTrackEvidence,
  createTrackIndicator,
  createTrackRelatedStock,
  getTrack,
  listTrackEvidence,
  listTrackIndicators,
  listTrackRelatedStocks,
  updateTrack
} from "../../api/trackDiscovery";
import { EmptyAction } from "../../components/common/EmptyAction";
import { PageHeader } from "../../components/common/PageHeader";
import { WorkbenchCard } from "../../components/common/WorkbenchCard";
import { useAsyncData } from "../../hooks/useAsyncData";
import type { TrackEvidence, TrackRelatedStock, TrackValidationIndicator } from "../../types/api";
import { DirectionTag, formatTime, StatusTag, thesisStatusOptions } from "./sections/shared";

type IndicatorFormValues = {
  name: string;
  indicator_type?: string;
  data_source?: string;
  current_value?: string;
  direction?: string;
  validation_meaning?: string;
};

type EvidenceFormValues = {
  source_item_id?: number;
  evidence_direction: string;
  evidence_strength?: number;
  summary?: string;
  affected_segments?: string;
  related_stock_ids?: string;
};

type RelatedStockFormValues = {
  stock_id: number;
  role?: string;
  relevance_score?: number;
  evidence_count?: number;
  heat_score?: number;
  status?: string;
};

type TrackEditFormValues = {
  name: string;
  status: string;
};

export function TrackDetailPage() {
  const { id } = useParams();
  const trackId = Number(id || 0);
  const track = useAsyncData(useCallback(() => getTrack(trackId), [trackId]), null);
  const indicators = useAsyncData(useCallback(() => (trackId ? listTrackIndicators(trackId) : Promise.resolve([])), [trackId]), []);
  const evidence = useAsyncData(useCallback(() => (trackId ? listTrackEvidence(trackId) : Promise.resolve([])), [trackId]), []);
  const relatedStocks = useAsyncData(useCallback(() => (trackId ? listTrackRelatedStocks(trackId) : Promise.resolve([])), [trackId]), []);
  const [editOpen, setEditOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [editForm] = Form.useForm<TrackEditFormValues>();
  const [statusForm] = Form.useForm<{ new_status: string; reason?: string }>();
  const [indicatorForm] = Form.useForm<IndicatorFormValues>();
  const [evidenceForm] = Form.useForm<EvidenceFormValues>();
  const [stockForm] = Form.useForm<RelatedStockFormValues>();

  useEffect(() => {
    if (!editOpen || !track.data) return;
    editForm.resetFields();
    editForm.setFieldsValue({
      name: track.data.name,
      status: track.data.status
    });
  }, [editForm, editOpen, track.data]);

  function openEdit() {
    if (!track.data) return;
    setEditOpen(true);
  }

  async function submitEdit() {
    const values = await editForm.validateFields();
    await updateTrack(trackId, {
      name: values.name,
      status: values.status
    });
    message.success("赛道已更新");
    setEditOpen(false);
    await track.refresh();
  }

  function openStatus() {
    statusForm.setFieldsValue({ new_status: track.data?.status || "candidate" });
    setStatusOpen(true);
  }

  async function submitStatus() {
    const values = await statusForm.validateFields();
    await changeTrackStatus(trackId, values.new_status, values.reason || null);
    message.success("状态已变更");
    setStatusOpen(false);
    await track.refresh();
  }

  async function submitIndicator() {
    const values = await indicatorForm.validateFields();
    await createTrackIndicator(trackId, {
      name: values.name,
      indicator_type: values.indicator_type || null,
      data_source: values.data_source || null,
      current_value: values.current_value || null,
      direction: values.direction || null,
      validation_meaning: values.validation_meaning || null
    });
    message.success("指标已新增");
    indicatorForm.resetFields();
    await indicators.refresh();
  }

  async function submitEvidence() {
    const values = await evidenceForm.validateFields();
    await createTrackEvidence(trackId, {
      source_item_id: values.source_item_id || null,
      evidence_direction: values.evidence_direction,
      evidence_strength: values.evidence_strength || 0,
      summary: values.summary || null,
      affected_segments: values.affected_segments || null,
      related_stock_ids: values.related_stock_ids || null
    });
    message.success("证据已新增");
    evidenceForm.resetFields();
    await evidence.refresh();
  }

  async function submitRelatedStock() {
    const values = await stockForm.validateFields();
    await createTrackRelatedStock(trackId, {
      stock_id: values.stock_id,
      role: values.role || null,
      relevance_score: values.relevance_score || 0,
      evidence_count: values.evidence_count || 0,
      heat_score: values.heat_score || 0,
      status: values.status || "candidate"
    });
    message.success("关联标的已新增");
    stockForm.resetFields();
    await relatedStocks.refresh();
  }

  const indicatorColumns: ColumnsType<TrackValidationIndicator> = [
    { title: "指标", dataIndex: "name" },
    { title: "类型", dataIndex: "indicator_type", width: 100, render: (value) => value || "-" },
    { title: "当前值", dataIndex: "current_value", width: 140, render: (value) => value || "-" },
    { title: "方向", dataIndex: "direction", width: 90, render: (value) => value || "-" },
    { title: "更新", dataIndex: "updated_at", width: 160, render: formatTime }
  ];

  const evidenceColumns: ColumnsType<TrackEvidence> = [
    { title: "方向", dataIndex: "evidence_direction", width: 100, render: (value) => <DirectionTag direction={value} /> },
    { title: "强度", dataIndex: "evidence_strength", width: 90, render: (value) => Number(value || 0).toFixed(2) },
    { title: "摘要", dataIndex: "summary", ellipsis: true, render: (value) => value || "-" },
    { title: "影响环节", dataIndex: "affected_segments", width: 150, render: (value) => value || "-" },
    { title: "创建", dataIndex: "created_at", width: 160, render: formatTime }
  ];

  const stockColumns: ColumnsType<TrackRelatedStock> = [
    { title: "Stock ID", dataIndex: "stock_id", width: 90 },
    { title: "角色", dataIndex: "role", render: (value) => value || "-" },
    { title: "相关度", dataIndex: "relevance_score", width: 90, render: (value) => Number(value || 0).toFixed(2) },
    { title: "证据数", dataIndex: "evidence_count", width: 80 },
    { title: "热度", dataIndex: "heat_score", width: 90, render: (value) => Number(value || 0).toFixed(1) },
    { title: "状态", dataIndex: "status", width: 100 }
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
      <PageHeader title="赛道详情" description={`赛道 ID：${id || "-"}`} />
      <Space direction="vertical" size={10} style={{ width: "100%" }}>
        <WorkbenchCard
          title={track.data?.name || "基础信息"}
          extra={
            <Space>
              <Link to="/track-discovery">返回列表</Link>
              <Button size="small" onClick={openEdit} disabled={!track.data}>编辑</Button>
              <Button size="small" onClick={openStatus} disabled={!track.data}>状态</Button>
            </Space>
          }
        >
          {track.data ? (
            <Row gutter={[12, 12]}>
              <Col span={16}>
                <Typography.Text type="secondary">赛道说明</Typography.Text>
                <Typography.Paragraph>{track.data.description || "-"}</Typography.Paragraph>
                <Typography.Text type="secondary">标签投影</Typography.Text>
                <Typography.Paragraph>{track.data.tag ? `tag:${track.data.tag.id}` : "-"}</Typography.Paragraph>
              </Col>
              <Col span={8}>
                <div className="detail-list">
                  <div className="detail-row"><span>状态</span><StatusTag status={track.data.status} /></div>
                  <div className="detail-row"><span>Track ID</span><span>{track.data.id}</span></div>
                  <div className="detail-row"><span>Tag ID</span><span>{track.data.tag?.id || "-"}</span></div>
                  <div className="detail-row"><span>更新时间</span><span>{formatTime(track.data.updated_at)}</span></div>
                </div>
              </Col>
            </Row>
          ) : (
            <EmptyAction description={track.loading ? "加载中" : "赛道不存在"} />
          )}
        </WorkbenchCard>

        <WorkbenchCard title="验证指标">
          <Table rowKey="id" size="small" loading={indicators.loading} dataSource={indicators.data} columns={indicatorColumns} pagination={{ pageSize: 10 }} />
          <Form form={indicatorForm} layout="inline" style={{ marginTop: 12 }} onFinish={submitIndicator}>
            <Form.Item name="name" rules={[{ required: true, message: "请输入指标名" }]}><Input placeholder="指标" /></Form.Item>
            <Form.Item name="indicator_type"><Input placeholder="类型" /></Form.Item>
            <Form.Item name="current_value"><Input placeholder="当前值" /></Form.Item>
            <Form.Item name="direction"><Input placeholder="方向" /></Form.Item>
            <Button htmlType="submit" size="small">新增指标</Button>
          </Form>
        </WorkbenchCard>

        <WorkbenchCard title="证据链">
          <Table rowKey="id" size="small" loading={evidence.loading} dataSource={evidence.data} columns={evidenceColumns} pagination={{ pageSize: 10 }} />
          <Form form={evidenceForm} layout="vertical" style={{ marginTop: 12 }} onFinish={submitEvidence}>
            <Space.Compact block>
              <Form.Item name="evidence_direction" label="方向" style={{ width: "34%" }} rules={[{ required: true }]}>
                <Select options={[{ value: "positive", label: "positive" }, { value: "neutral", label: "neutral" }, { value: "negative", label: "negative" }]} />
              </Form.Item>
              <Form.Item name="evidence_strength" label="强度" style={{ width: "33%" }}>
                <InputNumber min={0} max={1} step={0.1} style={{ width: "100%" }} />
              </Form.Item>
              <Form.Item name="source_item_id" label="信息源 ID" style={{ width: "33%" }}>
                <InputNumber min={1} style={{ width: "100%" }} />
              </Form.Item>
            </Space.Compact>
            <Form.Item name="summary" label="摘要" rules={[{ required: true, message: "请输入摘要" }]}><Input.TextArea rows={3} /></Form.Item>
            <Button htmlType="submit" size="small">新增证据</Button>
          </Form>
        </WorkbenchCard>

        <WorkbenchCard title="关联标的">
          <Table rowKey="id" size="small" loading={relatedStocks.loading} dataSource={relatedStocks.data} columns={stockColumns} pagination={{ pageSize: 10 }} />
          <Form form={stockForm} layout="inline" style={{ marginTop: 12 }} onFinish={submitRelatedStock}>
            <Form.Item name="stock_id" rules={[{ required: true, message: "请输入 Stock ID" }]}><InputNumber min={1} placeholder="Stock ID" /></Form.Item>
            <Form.Item name="role"><Input placeholder="角色" /></Form.Item>
            <Form.Item name="relevance_score"><InputNumber min={0} max={1} step={0.1} placeholder="相关度" /></Form.Item>
            <Form.Item name="status"><Input placeholder="状态" /></Form.Item>
            <Button htmlType="submit" size="small">新增标的</Button>
          </Form>
        </WorkbenchCard>
      </Space>

      <Modal title="编辑赛道" open={editOpen} onCancel={() => setEditOpen(false)} onOk={submitEdit} destroyOnHidden forceRender width={480}>
        <Form form={editForm} layout="vertical" preserve={false}>
          <Form.Item name="name" label="赛道名称" rules={[{ required: true, message: "请输入赛道名称" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="status" label="状态" rules={[{ required: true, message: "请选择状态" }]}>
            <Select options={thesisStatusOptions} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="变更状态" open={statusOpen} onCancel={() => setStatusOpen(false)} onOk={submitStatus} destroyOnHidden>
        <Form form={statusForm} layout="vertical" preserve={false}>
          <Form.Item name="new_status" label="新状态" rules={[{ required: true, message: "请选择状态" }]}>
            <Select options={thesisStatusOptions} />
          </Form.Item>
          <Form.Item name="reason" label="原因">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
