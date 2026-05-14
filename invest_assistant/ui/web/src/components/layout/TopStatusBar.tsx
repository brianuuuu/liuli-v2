import { BulbOutlined, MoreOutlined, ReloadOutlined, SearchOutlined, SunOutlined, UserOutlined } from "@ant-design/icons";
import { Button, Input, Select, Space } from "antd";
import { useLiuliTheme, type ThemeMode } from "../../app/theme";

export function TopStatusBar() {
  const { mode, resolvedMode, setMode } = useLiuliTheme();

  return (
    <div className="top-status-bar">
      <Space size={8} className="top-status-left">
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
          suffix={<span className="search-shortcut">⌘ K</span>}
        />
        <span className="status-chip status-ok"><i />API 在线</span>
        <span className="status-chip status-warn"><i />任务 2 待同步</span>
      </Space>
      <Space size={6} className="top-status-right">
        <span className="toolbar-item theme-label"><SunOutlined />{resolvedMode === "dark" ? "深色" : "浅色"}</span>
        <span className="toolbar-separator" />
        <Select<ThemeMode>
          value={mode}
          size="small"
          variant="borderless"
          className="theme-select"
          onChange={setMode}
          options={[
            { value: "light", label: "主题" },
            { value: "dark", label: "深色" },
            { value: "system", label: "跟随系统" }
          ]}
        />
        <span className="toolbar-separator" />
        <Button size="small" type="text" className="toolbar-button" icon={<ReloadOutlined />} onClick={() => window.location.reload()}>
          刷新
        </Button>
        <Button size="small" type="text" className="toolbar-button user-button" icon={<UserOutlined />}>
          brian
        </Button>
        <Button size="small" type="text" className="toolbar-icon" icon={<MoreOutlined />} />
      </Space>
    </div>
  );
}
