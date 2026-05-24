import { Button, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Switch, Table, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useMemo, useState } from "react";
import { createSystemConfig, deleteSystemConfig, listSystemConfigs, updateSystemConfig } from "../../../api/systemConfig";
import type { SystemConfig } from "../../../types/api";
import { DataPanel } from "../../../components/common/DataPanel";
import { useAsyncData } from "../../../hooks/useAsyncData";
import { formatTime } from "./shared";

type ConfigFormValues = {
  config_key: string;
  config_value: boolean | number | string;
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
  const valueType = Form.useWatch("config_type", form) || "string";

  const modules = useMemo(
    () => Array.from(new Set(configs.data.map((item) => item.module_name).filter(Boolean))).map((value) => ({ value: String(value), label: String(value) })),
    [configs.data]
  );
  const rows = moduleFilter ? configs.data.filter((item) => item.module_name === moduleFilter) : configs.data;

  function openCreate() {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ config_type: "string", enabled: true });
    setOpen(true);
  }

  function openEdit(record: SystemConfig) {
    setEditing(record);
    form.setFieldsValue({
      config_key: record.config_key,
      config_value: record.config_type === "boolean" ? record.config_value === "true" : record.config_value,
      config_type: record.config_type,
      module_name: record.module_name || undefined,
      description: record.description || undefined,
      enabled: record.enabled
    });
    setOpen(true);
  }

  async function submit() {
    const values = await form.validateFields();
    const configValue = values.config_type === "boolean" ? String(Boolean(values.config_value)) : String(values.config_value ?? "");
    if (editing) {
      await updateSystemConfig(editing.config_key, {
        config_value: configValue,
        config_type: values.config_type,
        module_name: values.module_name || null,
        description: values.description || null,
        enabled: values.enabled
      });
      message.success("配置已更新");
    } else {
      await createSystemConfig({
        ...values,
        config_value: configValue,
        module_name: values.module_name || null,
        description: values.description || null
      });
      message.success("配置已新增");
    }
    setOpen(false);
    await configs.refresh();
  }

  async function handleDelete(record: SystemConfig) {
    await deleteSystemConfig(record.config_key);
    message.success("配置已删除");
    await configs.refresh();
  }

  function handleTypeChange(nextType: string) {
    const currentValue = form.getFieldValue("config_value");
    if (nextType === "boolean") {
      form.setFieldValue("config_value", currentValue === true || currentValue === "true");
      return;
    }
    if (typeof currentValue === "boolean") {
      form.setFieldValue("config_value", String(currentValue));
    }
  }

  function renderValueEditor() {
    if (valueType === "boolean") {
      return <Switch checkedChildren="true" unCheckedChildren="false" />;
    }
    if (valueType === "number") {
      return <InputNumber style={{ width: "100%" }} />;
    }
    if (valueType === "json") {
      return <Input.TextArea rows={8} placeholder='{"key":"value"}' />;
    }
    return <Input.TextArea rows={4} />;
  }

  const columns: ColumnsType<SystemConfig> = [
    { title: "Key", dataIndex: "config_key" },
    { title: "模块", dataIndex: "module_name", width: 140, render: (value) => value || "-" },
    { title: "类型", dataIndex: "config_type", width: 100 },
    { title: "值", dataIndex: "config_value", ellipsis: true },
    { title: "启用", dataIndex: "enabled", width: 80, render: (value) => <Tag color={value ? "green" : "default"}>{value ? "启用" : "停用"}</Tag> },
    { title: "更新", dataIndex: "updated_at", width: 160, render: formatTime },
    {
      title: "操作",
      width: 150,
      render: (_, record) => (
        <Space size={6}>
          <Button size="small" onClick={() => openEdit(record)}>编辑</Button>
          <Popconfirm title="删除这个系统配置？" description={record.config_key} okText="删除" cancelText="取消" onConfirm={() => handleDelete(record)}>
            <Button size="small" danger>删除</Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <>
      <DataPanel
        toolbar={
          <>
            <Select allowClear size="small" placeholder="模块" value={moduleFilter} options={modules} style={{ width: 160 }} onChange={setModuleFilter} />
            <div className="data-panel-toolbar-spacer" />
            <Button size="small" type="primary" onClick={openCreate}>新增配置</Button>
          </>
        }
      >
        <Table rowKey="id" size="small" loading={configs.loading} dataSource={rows} columns={columns} pagination={{ pageSize: 12, showSizeChanger: true }} />
      </DataPanel>

      <Modal title={editing ? "编辑配置" : "新增配置"} width={720} open={open} onCancel={() => setOpen(false)} onOk={submit} destroyOnHidden>
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="config_key" label="配置 Key" rules={[{ required: true, message: "请输入配置 Key" }]}>
            <Input disabled={Boolean(editing)} />
          </Form.Item>
          <Space.Compact block>
            <Form.Item name="config_type" label="类型" style={{ width: "50%" }} rules={[{ required: true }]}>
              <Select
                onChange={handleTypeChange}
                options={[
                  { value: "string", label: "string" },
                  { value: "number", label: "number" },
                  { value: "boolean", label: "boolean" },
                  { value: "json", label: "json" }
                ]}
              />
            </Form.Item>
            <Form.Item name="enabled" label="启用" valuePropName="checked" style={{ width: "50%" }}>
              <Switch />
            </Form.Item>
          </Space.Compact>
          <Form.Item name="config_value" label="配置值" valuePropName={valueType === "boolean" ? "checked" : "value"} rules={[{ required: true, message: "请输入配置值" }]}>
            {renderValueEditor()}
          </Form.Item>
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
