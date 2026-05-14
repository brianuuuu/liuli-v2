import { BulbOutlined, ReloadOutlined } from "@ant-design/icons";
import { Button, Select, Space, Tag, Typography } from "antd";
import { useLiuliTheme, type ThemeMode } from "../../app/theme";

export function TopStatusBar() {
  const { mode, resolvedMode, setMode } = useLiuliTheme();

  return (
    <div className="top-status-bar">
      <Space size={12}>
        <Tag color="success">API 在线</Tag>
        <Tag>任务状态待同步</Tag>
        <Typography.Text type="secondary">当前主题：{resolvedMode === "dark" ? "深色" : "浅色"}</Typography.Text>
      </Space>
      <Space size={8}>
        <Select<ThemeMode>
          value={mode}
          size="small"
          style={{ width: 112 }}
          onChange={setMode}
          options={[
            { value: "light", label: "浅色" },
            { value: "dark", label: "深色" },
            { value: "system", label: "跟随系统" }
          ]}
        />
        <Button size="small" icon={<ReloadOutlined />} onClick={() => window.location.reload()}>
          刷新
        </Button>
        <Button size="small" icon={<BulbOutlined />}>
          brian
        </Button>
      </Space>
    </div>
  );
}
