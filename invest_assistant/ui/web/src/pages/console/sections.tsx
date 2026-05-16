import { Button, Col, Form, Input, Modal, Popconfirm, Row, Select, Space, Statistic, Table, message } from "antd";
import { useCallback, useState } from "react";
import { getAiLogs, getDashboard, getDataSources, getSystemStatus } from "../../api/console";
import { fetchDisclosures, listDisclosures } from "../../api/disclosures";
import { listJobs, runJob, syncJobDefinitions } from "../../api/jobs";
import {
  approveTagCandidate,
  createMarketTag,
  disableMarketTag,
  listMarketTags,
  listTagCandidates,
  mergeTagCandidate,
  rejectTagCandidate,
  updateMarketTag
} from "../../api/marketRadar";
import { listReports } from "../../api/reports";
import { listStocks } from "../../api/stocks";
import { listSystemConfigs } from "../../api/systemConfig";
import { RecordTable } from "../../components/common/RecordTable";
import { WorkbenchCard } from "../../components/common/WorkbenchCard";
import { useAsyncData } from "../../hooks/useAsyncData";

const genericColumns = [
  { title: "名称", dataIndex: "name" },
  { title: "标题", dataIndex: "title" },
  { title: "类型", dataIndex: "type" },
  { title: "状态", dataIndex: "status" }
];

function StatusSection() {
  const status = useAsyncData(useCallback(getSystemStatus, []), { api: "unknown", database: "unknown" });
  const dashboard = useAsyncData(useCallback(getDashboard, []), {});
  const dataSources = useAsyncData(useCallback(getDataSources, []), []);
  return (
    <Row gutter={[12, 12]}>
      <Col span={6}><WorkbenchCard><Statistic title="API" value={status.data.api} loading={status.loading} /></WorkbenchCard></Col>
      <Col span={6}><WorkbenchCard><Statistic title="数据库" value={status.data.database} loading={status.loading} /></WorkbenchCard></Col>
      <Col span={6}><WorkbenchCard><Statistic title="控制台状态" value={dashboard.data.status || "unknown"} loading={dashboard.loading} /></WorkbenchCard></Col>
      <Col span={6}><WorkbenchCard><Statistic title="数据源" value={dataSources.data.length} loading={dataSources.loading} /></WorkbenchCard></Col>
    </Row>
  );
}

function JobsSection() {
  const jobs = useAsyncData(useCallback(listJobs, []), []);

  async function sync() {
    const result = await syncJobDefinitions();
    message.success(`已同步 ${result.synced} 个任务定义`);
    await jobs.refresh();
  }

  async function run(jobName: string) {
    await runJob(jobName);
    message.success("已提交运行请求");
    await jobs.refresh();
  }

  return (
    <WorkbenchCard
      title="任务中心"
      extra={<Button onClick={sync}>同步任务定义</Button>}
    >
      <Table
        rowKey="job_name"
        size="small"
        loading={jobs.loading}
        dataSource={jobs.data}
        columns={[
          { title: "任务", dataIndex: "job_name" },
          { title: "模块", dataIndex: "module_name" },
          { title: "启用", dataIndex: "enabled", render: (value: boolean) => (value ? "是" : "否") },
          {
            title: "操作",
            render: (_, record) => (
              <Space>
                <Button size="small" onClick={() => run(record.job_name)}>
                  立即运行
                </Button>
              </Space>
            )
          }
        ]}
      />
    </WorkbenchCard>
  );
}

type TagFormValues = {
  name: string;
  type: string;
  category?: string;
  stock_id?: number;
  status: string;
};

function TagsSection() {
  const tags = useAsyncData(useCallback(listMarketTags, []), []);
  const [form] = Form.useForm<TagFormValues>();
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [open, setOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string | undefined>();

  const filteredTags = typeFilter ? tags.data.filter((tag) => tag.type === typeFilter) : tags.data;

  function openCreate() {
    setEditing(null);
    form.setFieldsValue({ type: "hotword", status: "active" });
    setOpen(true);
  }

  function openEdit(record: Record<string, unknown>) {
    setEditing(record);
    form.setFieldsValue({
      name: String(record.name ?? ""),
      type: String(record.type ?? "hotword"),
      category: record.category ? String(record.category) : undefined,
      stock_id: record.stock_id ? Number(record.stock_id) : undefined,
      status: String(record.status ?? "active")
    });
    setOpen(true);
  }

  async function submit() {
    const values = await form.validateFields();
    const payload = {
      ...values,
      category: values.category || null,
      stock_id: values.stock_id || null
    };
    if (editing?.id) {
      await updateMarketTag(Number(editing.id), payload);
      message.success("标签已更新");
    } else {
      await createMarketTag(payload);
      message.success("标签已新增");
    }
    setOpen(false);
    await tags.refresh();
  }

  async function disable(record: Record<string, unknown>) {
    await disableMarketTag(Number(record.id));
    message.success("标签已停用");
    await tags.refresh();
  }

  return (
    <WorkbenchCard
      title="标签库"
      extra={
        <Space>
          <Select
            allowClear
            size="small"
            placeholder="标签类型"
            value={typeFilter}
            style={{ width: 128 }}
            onChange={setTypeFilter}
            options={[
              { value: "stock", label: "标的" },
              { value: "track", label: "赛道" },
              { value: "hotword", label: "热点词" }
            ]}
          />
          <Button size="small" type="primary" onClick={openCreate}>新增标签</Button>
        </Space>
      }
    >
      <Table
        rowKey="id"
        size="small"
        loading={tags.loading}
        dataSource={filteredTags}
        columns={[
          { title: "名称", dataIndex: "name" },
          { title: "类型", dataIndex: "type" },
          { title: "分类", dataIndex: "category", render: (value) => value || "-" },
          { title: "状态", dataIndex: "status" },
          {
            title: "操作",
            width: 170,
            render: (_, record) => (
              <Space>
                <Button size="small" onClick={() => openEdit(record)}>编辑</Button>
                <Popconfirm title="停用这个标签？" onConfirm={() => disable(record)}>
                  <Button size="small" danger>停用</Button>
                </Popconfirm>
              </Space>
            )
          }
        ]}
      />
      <Modal
        title={editing ? "编辑标签" : "新增标签"}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={submit}
        destroyOnClose
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="name" label="标签名称" rules={[{ required: true, message: "请输入标签名称" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="type" label="标签类型" rules={[{ required: true, message: "请选择标签类型" }]}>
            <Select
              options={[
                { value: "stock", label: "标的标签" },
                { value: "track", label: "赛道标签" },
                { value: "hotword", label: "热点词标签" }
              ]}
            />
          </Form.Item>
          <Form.Item name="category" label="分类">
            <Input placeholder="可选，如 AI、汽车、宏观" />
          </Form.Item>
          <Form.Item name="stock_id" label="关联股票 ID">
            <Input type="number" placeholder="仅标的标签需要" />
          </Form.Item>
          <Form.Item name="status" label="状态" rules={[{ required: true, message: "请选择状态" }]}>
            <Select options={[{ value: "active", label: "active" }, { value: "disabled", label: "disabled" }]} />
          </Form.Item>
        </Form>
      </Modal>
    </WorkbenchCard>
  );
}

function TagCandidatesSection() {
  const candidates = useAsyncData(useCallback(listTagCandidates, []), []);

  async function handleAction(action: "approve" | "reject" | "merge", id: number) {
    if (action === "approve") await approveTagCandidate(id);
    if (action === "reject") await rejectTagCandidate(id);
    if (action === "merge") await mergeTagCandidate(id);
    message.success("候选标签已处理");
    await candidates.refresh();
  }

  return (
    <WorkbenchCard title="候选标签">
      <Table
        rowKey="id"
        size="small"
        loading={candidates.loading}
        dataSource={candidates.data}
        columns={[
          { title: "名称", dataIndex: "name" },
          { title: "建议类型", dataIndex: "suggested_type" },
          { title: "分类", dataIndex: "category", render: (value) => value || "-" },
          { title: "置信度", dataIndex: "confidence" },
          { title: "状态", dataIndex: "status" },
          { title: "原因", dataIndex: "reason", ellipsis: true },
          {
            title: "审核",
            width: 220,
            render: (_, record) => {
              const id = Number(record.id);
              const disabled = record.status !== "pending";
              return (
                <Space>
                  <Button size="small" disabled={disabled} onClick={() => handleAction("approve", id)}>通过</Button>
                  <Button size="small" disabled={disabled} onClick={() => handleAction("merge", id)}>合并</Button>
                  <Button size="small" danger disabled={disabled} onClick={() => handleAction("reject", id)}>拒绝</Button>
                </Space>
              );
            }
          }
        ]}
      />
    </WorkbenchCard>
  );
}

export function ConsoleSections({ activeTab }: { activeTab: string }) {
  const reports = useAsyncData(useCallback(listReports, []), []);
  const disclosures = useAsyncData(useCallback(listDisclosures, []), []);
  const stocks = useAsyncData(useCallback(listStocks, []), []);
  const configs = useAsyncData(useCallback(listSystemConfigs, []), []);
  const aiLogs = useAsyncData(useCallback(getAiLogs, []), []);

  if (activeTab === "status") return <StatusSection />;
  if (activeTab === "jobs") return <JobsSection />;
  if (activeTab === "tags") return <TagsSection />;
  if (activeTab === "tag-candidates") return <TagCandidatesSection />;
  if (activeTab === "reports") return <RecordTable loading={reports.loading} data={reports.data as unknown as Record<string, unknown>[]} columns={genericColumns} emptyText="暂无报告" drawerTitle="报告详情" />;
  if (activeTab === "disclosures") {
    return (
      <WorkbenchCard title="公告财报库" extra={<Button onClick={() => fetchDisclosures().then(() => message.success("已提交拉取请求"))}>拉取公告</Button>}>
        <RecordTable loading={disclosures.loading} data={disclosures.data as unknown as Record<string, unknown>[]} columns={genericColumns} emptyText="暂无公告财报" drawerTitle="公告财报详情" />
      </WorkbenchCard>
    );
  }
  if (activeTab === "stocks") return <RecordTable loading={stocks.loading} data={stocks.data as unknown as Record<string, unknown>[]} columns={genericColumns} emptyText="暂无股票基础数据" drawerTitle="股票详情" />;
  if (activeTab === "config") return <RecordTable loading={configs.loading} data={configs.data} columns={genericColumns} emptyText="暂无系统配置" drawerTitle="配置详情" />;
  return <RecordTable loading={aiLogs.loading} data={aiLogs.data} columns={genericColumns} emptyText="暂无 AI 调用日志" drawerTitle="AI 日志详情" />;
}
