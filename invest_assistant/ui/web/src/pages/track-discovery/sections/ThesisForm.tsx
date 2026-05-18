import { Form, Input, Select, Space } from "antd";
import type { FormInstance } from "antd";
import type { TrackThesisPayload } from "../../../api/trackDiscovery";
import { confidenceOptions, thesisStatusOptions } from "./shared";

export type ThesisFormValues = Required<Pick<TrackThesisPayload, "title" | "core_thesis">> &
  Omit<TrackThesisPayload, "title" | "core_thesis">;

export function ThesisForm({ form }: { form: FormInstance<ThesisFormValues> }) {
  return (
    <Form form={form} layout="vertical" preserve={false}>
      <Form.Item name="title" label="赛道标题" rules={[{ required: true, message: "请输入赛道标题" }]}>
        <Input />
      </Form.Item>
      <Form.Item name="core_thesis" label="核心假设" rules={[{ required: true, message: "请输入核心假设" }]}>
        <Input.TextArea rows={4} />
      </Form.Item>
      <Form.Item name="underlying_change" label="底层变化">
        <Input.TextArea rows={3} />
      </Form.Item>
      <Space.Compact block>
        <Form.Item name="old_bottleneck" label="旧瓶颈" style={{ width: "50%" }}>
          <Input.TextArea rows={3} />
        </Form.Item>
        <Form.Item name="new_solution" label="新解法" style={{ width: "50%" }}>
          <Input.TextArea rows={3} />
        </Form.Item>
      </Space.Compact>
      <Form.Item name="value_chain_shift" label="价值链迁移">
        <Input.TextArea rows={3} />
      </Form.Item>
      <Space.Compact block>
        <Form.Item name="time_horizon" label="时间维度" style={{ width: "34%" }}>
          <Input placeholder="如 6-12M" />
        </Form.Item>
        <Form.Item name="confidence_level" label="置信度" style={{ width: "33%" }}>
          <Select allowClear options={confidenceOptions} />
        </Form.Item>
        <Form.Item name="status" label="状态" style={{ width: "33%" }}>
          <Select options={thesisStatusOptions} />
        </Form.Item>
      </Space.Compact>
    </Form>
  );
}
