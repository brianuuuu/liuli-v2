import { BulbOutlined, MoreOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { Button, Input, Select, Space, Tag, Typography } from "antd";
import { useLiuliTheme, type ThemeMode } from "../../app/theme";

export function TopStatusBar() {
  const { mode, resolvedMode, setMode } = useLiuliTheme();

  return (
    <div className="top-status-bar">
      <Space size={12}>
        <Select
          value="all"
          size="small"
          className="market-select"
          options={[{ value: "all", label: "全部市场" }]}
        />
        <Input
          size="small"
          className="global-search"
          prefix={<SearchOutlined />}
          placeholder="搜索股票/赛道/公告/知识库"
        />
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
        <Button size="small" icon={<MoreOutlined />} />
      </Space>
    </div>
  );
}
