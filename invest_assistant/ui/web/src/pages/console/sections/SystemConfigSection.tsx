import { Button, Form, Input, Modal, Select, Space, Switch, Table, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useMemo, useState } from "react";
import { createSystemConfig, listSystemConfigs, updateSystemConfig } from "../../../api/systemConfig";
import type { SystemConfig } from "../../../types/api";
import { WorkbenchCard } from "../../../components/common/WorkbenchCard";
import { useAsyncData } from "../../../hooks/useAsyncData";
import { formatTime } from "./shared";

type ConfigFormValues = {
  config_key: string;
  config_value: string;
  config_type: string;
  module_name?: string;
  description?: string;
  enabled: boolean;
};

export function SystemConfigSection() {
  const configs = useAsyncData(useCallback(listSystemConfigs, []), []);
  const [moduleFilter, setModuleFilter] = useState<string | undefined>();
  const [editing, setEditing] = useState<SystemConfig | null>(null);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<ConfigFormValues>();

  const modules = useMemo(
    () => Array.from(new Set(configs.data.map((item) => item.module_name).filter(Boolean))).map((value) => ({ value: String(value), label: String(value) })),
    [configs.data]
  );
  const rows = moduleFilter ? configs.data.filter((item) => item.module_name === moduleFilter) : configs.data;

  function openCreate() {
    setEditing(null);
    form.setFieldsValue({ config_type: "string", enabled: true });
    setOpen(true);
  }

  function openEdit(record: SystemConfig) {
    setEditing(record);
    form.setFieldsValue({
      config_key: record.config_key,
      config_value: record.config_value,
      config_type: record.config_type,
      module_name: record.module_name || undefined,
      description: record.description || undefined,
      enabled: record.enabled
    });
    setOpen(true);
  }

  async function submit() {
    const values = await form.validateFields();
    if (editing) {
      await updateSystemConfig(editing.config_key, {
        config_value: values.config_value,
        config_type: values.config_type,
        module_name: values.module_name || null,
        description: values.description || null,
        enabled: values.enabled
      });
      message.success("配置已更新");
    } else {
      await createSystemConfig({
        ...values,
        module_name: values.module_name || null,
        description: values.description || null
      });
      message.success("配置已新增");
    }
    setOpen(false);
    await configs.refresh();
  }

  const columns: ColumnsType<SystemConfig> = [
    { title: "Key", dataIndex: "config_key" },
    { title: "模块", dataIndex: "module_name", width: 140, render: (value) => value || "-" },
    { title: "类型", dataIndex: "config_type", width: 100 },
    { title: "值", dataIndex: "config_value", ellipsis: true },
    { title: "启用", dataIndex: "enabled", width: 80, render: (value) => <Tag color={value ? "green" : "default"}>{value ? "启用" : "停用"}</Tag> },
    { title: "更新", dataIndex: "updated_at", width: 160, render: formatTime },
    { title: "操作", width: 90, render: (_, record) => <Button size="small" onClick={() => openEdit(record)}>编辑</Button> }
  ];

  return (
    <>
      <WorkbenchCard
        title="系统配置"
        extra={
          <Space>
            <Select allowClear size="small" placeholder="模块" value={moduleFilter} options={modules} style={{ width: 160 }} onChange={setModuleFilter} />
            <Button size="small" type="primary" onClick={openCreate}>新增配置</Button>
          </Space>
        }
      >
        <Table rowKey="id" size="small" loading={configs.loading} dataSource={rows} columns={columns} pagination={{ pageSize: 12, showSizeChanger: true }} />
      </WorkbenchCard>

      <Modal title={editing ? "编辑配置" : "新增配置"} open={open} onCancel={() => setOpen(false)} onOk={submit} destroyOnHidden>
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="config_key" label="配置 Key" rules={[{ required: true, message: "请输入配置 Key" }]}>
            <Input disabled={Boolean(editing)} />
          </Form.Item>
          <Form.Item name="config_value" label="配置值" rules={[{ required: true, message: "请输入配置值" }]}>
            <Input.TextArea rows={4} />
          </Form.Item>
          <Space.Compact block>
            <Form.Item name="config_type" label="类型" style={{ width: "50%" }} rules={[{ required: true }]}>
              <Select options={[{ value: "string", label: "string" }, { value: "number", label: "number" }, { value: "boolean", label: "boolean" }, { value: "json", label: "json" }]} />
            </Form.Item>
            <Form.Item name="enabled" label="启用" valuePropName="checked" style={{ width: "50%" }}>
              <Switch />
            </Form.Item>
          </Space.Compact>
          <Form.Item name="module_name" label="模块">
            <Input />
          </Form.Item>
          <Form.Item name="description" label="说明">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
