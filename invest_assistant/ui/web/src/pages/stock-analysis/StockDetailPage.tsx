import { Button, Form, Input, InputNumber, Select, Space, Table, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { createStockNote, createStockScore, listStockNotes, listStockScores } from "../../api/stockAnalysis";
import { ChartCard } from "../../components/charts/ChartCard";
import { EmptyAction } from "../../components/common/EmptyAction";
import { PageHeader } from "../../components/common/PageHeader";
import { WorkbenchCard } from "../../components/common/WorkbenchCard";
import { useAsyncData } from "../../hooks/useAsyncData";
import type { StockResearchNote, StockScoreSnapshot } from "../../types/api";
import { formatTime, scoreTrendOption } from "./sections/shared";

type NoteFormValues = {
  note_type: string;
  title: string;
  content: string;
  related_track_id?: number;
};

type ScoreFormValues = {
  score_date: string;
  track_id?: number;
  growth_score?: number;
  valuation_score?: number;
  moat_score?: number;
  risk_score?: number;
  total_score?: number;
};

export function StockDetailPage() {
  const { id } = useParams();
  const stockId = Number(id || 0);
  const notes = useAsyncData(useCallback(() => (stockId ? listStockNotes(stockId) : Promise.resolve([])), [stockId]), []);
  const scores = useAsyncData(useCallback(() => (stockId ? listStockScores(stockId) : Promise.resolve([])), [stockId]), []);
  const [noteForm] = Form.useForm<NoteFormValues>();
  const [scoreForm] = Form.useForm<ScoreFormValues>();

  async function submitNote() {
    const values = await noteForm.validateFields();
    await createStockNote(stockId, {
      note_type: values.note_type,
      title: values.title,
      content: values.content,
      related_track_id: values.related_track_id || null
    });
    message.success("研究笔记已新增");
    noteForm.resetFields();
    await notes.refresh();
  }

  async function submitScore() {
    const values = await scoreForm.validateFields();
    await createStockScore(stockId, {
      score_date: values.score_date,
      track_id: values.track_id || null,
      growth_score: values.growth_score || 0,
      valuation_score: values.valuation_score || 0,
      moat_score: values.moat_score || 0,
      risk_score: values.risk_score || 0,
      total_score: values.total_score || 0
    });
    message.success("评分快照已新增");
    scoreForm.resetFields();
    await scores.refresh();
  }

  const noteColumns: ColumnsType<StockResearchNote> = [
    { title: "类型", dataIndex: "note_type", width: 110 },
    { title: "标题", dataIndex: "title" },
    { title: "Track ID", dataIndex: "related_track_id", width: 100, render: (value) => value || "-" },
    { title: "更新", dataIndex: "updated_at", width: 160, render: formatTime }
  ];

  const scoreColumns: ColumnsType<StockScoreSnapshot> = [
    { title: "日期", dataIndex: "score_date", width: 120 },
    { title: "总分", dataIndex: "total_score", width: 80 },
    { title: "成长", dataIndex: "growth_score", width: 80 },
    { title: "估值", dataIndex: "valuation_score", width: 80 },
    { title: "护城河", dataIndex: "moat_score", width: 90 },
    { title: "风险", dataIndex: "risk_score", width: 80 },
    { title: "创建", dataIndex: "created_at", render: formatTime }
  ];

  if (!stockId) {
    return (
      <>
        <PageHeader title="标的详情" description="无效 ID" />
        <WorkbenchCard><EmptyAction description="标的 ID 无效" /></WorkbenchCard>
      </>
    );
  }

  return (
    <>
      <PageHeader title="标的详情" description={`Stock ID：${id || "-"}`} />
      <Space direction="vertical" size={10} style={{ width: "100%" }}>
        <WorkbenchCard title="基础信息" extra={<Link to="/stock-analysis">返回标的分析</Link>}>
          <div className="detail-list">
            <div className="detail-row"><Typography.Text type="secondary">Stock ID</Typography.Text><Typography.Text>{stockId}</Typography.Text></div>
            <div className="detail-row"><Typography.Text type="secondary">研究笔记</Typography.Text><Typography.Text>{notes.data.length}</Typography.Text></div>
            <div className="detail-row"><Typography.Text type="secondary">评分快照</Typography.Text><Typography.Text>{scores.data.length}</Typography.Text></div>
          </div>
        </WorkbenchCard>

        <WorkbenchCard title="评分快照">
          {scores.data.length ? <ChartCard title="评分趋势" option={scoreTrendOption(scores.data)} height={260} /> : <EmptyAction description="暂无评分快照" />}
          <Table rowKey="id" size="small" loading={scores.loading} dataSource={scores.data} columns={scoreColumns} pagination={{ pageSize: 6 }} />
          <Form form={scoreForm} layout="vertical" style={{ marginTop: 12 }} onFinish={submitScore}>
            <Space.Compact block>
              <Form.Item name="score_date" label="日期" style={{ width: "25%" }} rules={[{ required: true, message: "请输入日期" }]}>
                <input className="ant-input" type="date" />
              </Form.Item>
              <Form.Item name="track_id" label="Track ID" style={{ width: "25%" }}>
                <InputNumber min={1} style={{ width: "100%" }} />
              </Form.Item>
              <Form.Item name="total_score" label="总分" style={{ width: "25%" }}>
                <InputNumber min={0} max={100} style={{ width: "100%" }} />
              </Form.Item>
              <Form.Item name="risk_score" label="风险" style={{ width: "25%" }}>
                <InputNumber min={0} max={100} style={{ width: "100%" }} />
              </Form.Item>
            </Space.Compact>
            <Space.Compact block>
              <Form.Item name="growth_score" label="成长" style={{ width: "33%" }}>
                <InputNumber min={0} max={100} style={{ width: "100%" }} />
              </Form.Item>
              <Form.Item name="valuation_score" label="估值" style={{ width: "34%" }}>
                <InputNumber min={0} max={100} style={{ width: "100%" }} />
              </Form.Item>
              <Form.Item name="moat_score" label="护城河" style={{ width: "33%" }}>
                <InputNumber min={0} max={100} style={{ width: "100%" }} />
              </Form.Item>
            </Space.Compact>
            <Button htmlType="submit" size="small" type="primary">新增评分</Button>
          </Form>
        </WorkbenchCard>

        <WorkbenchCard title="研究笔记">
          <Table rowKey="id" size="small" loading={notes.loading} dataSource={notes.data} columns={noteColumns} pagination={{ pageSize: 6 }} />
          <Form form={noteForm} layout="vertical" style={{ marginTop: 12 }} onFinish={submitNote}>
            <Space.Compact block>
              <Form.Item name="note_type" label="类型" style={{ width: "34%" }} rules={[{ required: true, message: "请输入类型" }]}>
                <Select options={[{ value: "thesis", label: "thesis" }, { value: "risk", label: "risk" }, { value: "memo", label: "memo" }]} />
              </Form.Item>
              <Form.Item name="title" label="标题" style={{ width: "33%" }} rules={[{ required: true, message: "请输入标题" }]}>
                <Input />
              </Form.Item>
              <Form.Item name="related_track_id" label="Track ID" style={{ width: "33%" }}>
                <InputNumber min={1} style={{ width: "100%" }} />
              </Form.Item>
            </Space.Compact>
            <Form.Item name="content" label="内容" rules={[{ required: true, message: "请输入内容" }]}>
              <Input.TextArea rows={4} />
            </Form.Item>
            <Button htmlType="submit" size="small" type="primary">新增笔记</Button>
          </Form>
        </WorkbenchCard>
      </Space>
    </>
  );
}
