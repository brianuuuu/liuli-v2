import { BulbOutlined, MoonOutlined, MoreOutlined, ReloadOutlined, SearchOutlined, SunOutlined, UserOutlined } from "@ant-design/icons";
import { Button, Input, Space } from "antd";
import { useLiuliTheme, type ThemeMode } from "../../app/theme";

export function TopStatusBar() {
  const { mode, resolvedMode, setMode } = useLiuliTheme();

  return (
    <div className="top-status-bar">
      <Space size={8} className="top-status-left">
        <Input
          size="small"
          className="global-search"
          prefix={<SearchOutlined />}
          placeholder="搜索股票/赛道/公告/知识库"
          suffix={<span className="search-shortcut">⌘ K</span>}
        />
        <span className="status-chip status-warn"><i />任务 2 待同步</span>
      </Space>
      <Space size={6} className="top-status-right">
        <Button
          size="small"
          type="text"
          className="toolbar-button"
          icon={resolvedMode === "dark" ? <MoonOutlined /> : <SunOutlined />}
          onClick={() => setMode(resolvedMode === "dark" ? "light" : "dark")}
        >
          {resolvedMode === "dark" ? "深色" : "浅色"}
        </Button>
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
