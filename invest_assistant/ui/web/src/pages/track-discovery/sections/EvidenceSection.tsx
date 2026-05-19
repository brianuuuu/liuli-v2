import { Button, Form, Input, InputNumber, Select, Space, Statistic, Table, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useMemo, useState } from "react";
import {
  bindStockFromTrack,
  createTrackEvidence,
  listStocksForTrack,
  listTrackEvidence,
  listTrackIndicators,
  listTrackRelatedStocks,
  listTracks
} from "../../../api/trackDiscovery";
import { EmptyAction } from "../../../components/common/EmptyAction";
import { DataPanel } from "../../../components/common/DataPanel";
import { WorkbenchCard } from "../../../components/common/WorkbenchCard";
import { useAsyncData } from "../../../hooks/useAsyncData";
import type { StockTrackTagBinding, TrackEvidence } from "../../../types/api";
import { DirectionTag, formatTime } from "./shared";

type EvidenceFormValues = {
  source_item_id?: number;
  evidence_direction: string;
  evidence_strength?: number;
  summary?: string;
  affected_segments?: string;
  related_stock_ids?: string;
};

type ReverseBindingFormValues = {
  stock_id: number;
  relation_type?: string;
  conviction?: number;
  reason?: string;
};

export function EvidenceSection() {
  const tracks = useAsyncData(useCallback(() => listTracks(), []), []);
  const [trackId, setTrackId] = useState<number | undefined>();
  const evidence = useAsyncData(useCallback(() => (trackId ? listTrackEvidence(trackId) : Promise.resolve([])), [trackId]), []);
  const indicators = useAsyncData(useCallback(() => (trackId ? listTrackIndicators(trackId) : Promise.resolve([])), [trackId]), []);
  const relatedStocks = useAsyncData(useCallback(() => (trackId ? listTrackRelatedStocks(trackId) : Promise.resolve([])), [trackId]), []);
  const reverseBindings = useAsyncData(useCallback(() => (trackId ? listStocksForTrack(trackId) : Promise.resolve([])), [trackId]), []);
  const [form] = Form.useForm<EvidenceFormValues>();
  const [reverseForm] = Form.useForm<ReverseBindingFormValues>();

  const trackOptions = useMemo(() => tracks.data.map((item) => ({ value: item.id, label: item.name })), [tracks.data]);

  async function submitEvidence() {
    if (!trackId) {
      message.warning("请先选择赛道");
      return;
    }
    const values = await form.validateFields();
    await createTrackEvidence(trackId, {
      source_item_id: values.source_item_id || null,
      evidence_direction: values.evidence_direction,
      evidence_strength: values.evidence_strength || 0,
      summary: values.summary || null,
      affected_segments: values.affected_segments || null,
      related_stock_ids: values.related_stock_ids || null
    });
    message.success("证据已新增");
    form.resetFields();
    await evidence.refresh();
  }

  async function submitReverseBinding() {
    if (!trackId) {
      message.warning("请先选择赛道");
      return;
    }
    const values = await reverseForm.validateFields();
    await bindStockFromTrack(trackId, {
      stock_id: values.stock_id,
      relation_type: values.relation_type || null,
      conviction: values.conviction || 0,
      reason: values.reason || null,
      status: "active"
    });
    message.success("关联标的已更新");
    reverseForm.resetFields();
    await reverseBindings.refresh();
  }

  const columns: ColumnsType<TrackEvidence> = [
    { title: "方向", dataIndex: "evidence_direction", width: 100, render: (value) => <DirectionTag direction={value} /> },
    { title: "强度", dataIndex: "evidence_strength", width: 90, render: (value) => Number(value || 0).toFixed(2) },
    { title: "摘要", dataIndex: "summary", ellipsis: true, render: (value) => value || "-" },
    { title: "影响环节", dataIndex: "affected_segments", width: 160, render: (value) => value || "-" },
    { title: "创建", dataIndex: "created_at", width: 160, render: formatTime }
  ];

  const reverseColumns: ColumnsType<StockTrackTagBinding> = [
    { title: "Stock ID", dataIndex: "stock_id", width: 100 },
    { title: "关系", dataIndex: "relation_type", width: 120, render: (value) => value || "-" },
    { title: "确信度", dataIndex: "conviction", width: 90, render: (value) => Number(value || 0).toFixed(2) },
    { title: "状态", dataIndex: "status", width: 90 },
    { title: "判断理由", dataIndex: "reason", ellipsis: true, render: (value) => value || "-" }
  ];

  return (
    <Space direction="vertical" size={10} style={{ width: "100%" }}>
      <DataPanel
        toolbar={
          <>
            <Select showSearch size="small" placeholder="选择赛道" value={trackId} options={trackOptions} loading={tracks.loading} style={{ width: 260 }} onChange={setTrackId} />
            <div className="data-panel-toolbar-spacer" />
          </>
        }
      >
        {trackId ? (
          <Space direction="vertical" size={10} style={{ width: "100%", padding: 16 }}>
            <Space size={10}>
              <Statistic title="证据" value={evidence.data.length} loading={evidence.loading} />
              <Statistic title="指标" value={indicators.data.length} loading={indicators.loading} />
              <Statistic title="关联标的" value={relatedStocks.data.length} loading={relatedStocks.loading} />
            </Space>
            <Table
              rowKey="id"
              size="small"
              loading={evidence.loading}
              dataSource={evidence.data}
              columns={columns}
              pagination={{ pageSize: 8 }}
              locale={{ emptyText: <EmptyAction description="暂无证据" /> }}
            />
          </Space>
        ) : (
          <EmptyAction description="请选择赛道后查看证据链" />
        )}
      </DataPanel>

      <WorkbenchCard title="新增证据">
        <Form form={form} layout="vertical" preserve={false} onFinish={submitEvidence}>
          <Space.Compact block>
            <Form.Item name="evidence_direction" label="方向" style={{ width: "34%" }} rules={[{ required: true, message: "请选择方向" }]}>
              <Select options={[{ value: "positive", label: "positive" }, { value: "neutral", label: "neutral" }, { value: "negative", label: "negative" }]} />
            </Form.Item>
            <Form.Item name="evidence_strength" label="强度" style={{ width: "33%" }}>
              <InputNumber min={0} max={1} step={0.1} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item name="source_item_id" label="信息源 ID" style={{ width: "33%" }}>
              <InputNumber min={1} style={{ width: "100%" }} />
            </Form.Item>
          </Space.Compact>
          <Form.Item name="summary" label="摘要" rules={[{ required: true, message: "请输入摘要" }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
          <Space.Compact block>
            <Form.Item name="affected_segments" label="影响环节" style={{ width: "50%" }}>
              <Input />
            </Form.Item>
            <Form.Item name="related_stock_ids" label="相关标的 ID" style={{ width: "50%" }}>
              <Input placeholder="逗号分隔" />
            </Form.Item>
          </Space.Compact>
          <Button htmlType="submit" size="small" type="primary" disabled={!trackId}>新增证据</Button>
        </Form>
      </WorkbenchCard>

      <DataPanel
        toolbar={
          <>
            <Select showSearch size="small" placeholder="选择赛道" value={trackId} options={trackOptions} loading={tracks.loading} style={{ width: 260 }} onChange={setTrackId} />
            <div className="data-panel-toolbar-spacer" />
          </>
        }
      >
        <Table rowKey="id" size="small" loading={reverseBindings.loading} dataSource={reverseBindings.data} columns={reverseColumns} pagination={{ pageSize: 8 }} />
        <WorkbenchCard title="新增关联">
          <Form form={reverseForm} layout="vertical" preserve={false} onFinish={submitReverseBinding}>
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
              <Input.TextArea rows={3} />
            </Form.Item>
            <Button htmlType="submit" size="small" type="primary" disabled={!trackId}>关联标的</Button>
          </Form>
        </WorkbenchCard>
      </DataPanel>
    </Space>
  );
}
