import { Button, Form, Input, InputNumber, Select, Space, Statistic, Table, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useMemo, useState } from "react";
import { createTrackEvidence, listTrackEvidence, listTrackIndicators, listTrackRelatedStocks, listTrackTheses } from "../../../api/trackDiscovery";
import { EmptyAction } from "../../../components/common/EmptyAction";
import { WorkbenchCard } from "../../../components/common/WorkbenchCard";
import { useAsyncData } from "../../../hooks/useAsyncData";
import type { TrackEvidence } from "../../../types/api";
import { DirectionTag, formatTime } from "./shared";

type EvidenceFormValues = {
  source_item_id?: number;
  evidence_direction: string;
  evidence_strength?: number;
  summary?: string;
  affected_segments?: string;
  related_stock_ids?: string;
};

export function EvidenceSection() {
  const theses = useAsyncData(useCallback(listTrackTheses, []), []);
  const [thesisId, setThesisId] = useState<number | undefined>();
  const evidence = useAsyncData(useCallback(() => (thesisId ? listTrackEvidence(thesisId) : Promise.resolve([])), [thesisId]), []);
  const indicators = useAsyncData(useCallback(() => (thesisId ? listTrackIndicators(thesisId) : Promise.resolve([])), [thesisId]), []);
  const relatedStocks = useAsyncData(useCallback(() => (thesisId ? listTrackRelatedStocks(thesisId) : Promise.resolve([])), [thesisId]), []);
  const [form] = Form.useForm<EvidenceFormValues>();

  const thesisOptions = useMemo(() => theses.data.map((item) => ({ value: item.id, label: item.title })), [theses.data]);

  async function submitEvidence() {
    if (!thesisId) {
      message.warning("请先选择赛道");
      return;
    }
    const values = await form.validateFields();
    await createTrackEvidence(thesisId, {
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

  const columns: ColumnsType<TrackEvidence> = [
    { title: "方向", dataIndex: "evidence_direction", width: 100, render: (value) => <DirectionTag direction={value} /> },
    { title: "强度", dataIndex: "evidence_strength", width: 90, render: (value) => Number(value || 0).toFixed(2) },
    { title: "摘要", dataIndex: "summary", ellipsis: true, render: (value) => value || "-" },
    { title: "影响环节", dataIndex: "affected_segments", width: 160, render: (value) => value || "-" },
    { title: "创建", dataIndex: "created_at", width: 160, render: formatTime }
  ];

  return (
    <Space direction="vertical" size={10} style={{ width: "100%" }}>
      <WorkbenchCard
        title="证据链"
        extra={<Select showSearch size="small" placeholder="选择赛道" value={thesisId} options={thesisOptions} style={{ width: 260 }} onChange={setThesisId} />}
      >
        {thesisId ? (
          <Space direction="vertical" size={10} style={{ width: "100%" }}>
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
      </WorkbenchCard>

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
          <Button htmlType="submit" size="small" type="primary" disabled={!thesisId}>新增证据</Button>
        </Form>
      </WorkbenchCard>
    </Space>
  );
}
