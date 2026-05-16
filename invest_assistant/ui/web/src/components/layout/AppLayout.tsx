import { MenuFoldOutlined, MenuUnfoldOutlined } from "@ant-design/icons";
import { Button, Layout, Menu, Typography } from "antd";
import { useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { primaryNavItems } from "../../app/navigation";
import { TopStatusBar } from "./TopStatusBar";

const { Sider, Content } = Layout;

function activeKeyFromPath(pathname: string) {
  if (pathname === "/") return "dashboard";
  return primaryNavItems.find((item) => pathname.startsWith(item.path) && item.path !== "/")?.key || "dashboard";
}

export function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(() => window.localStorage.getItem("liuli.sider.collapsed") === "true");
  const activeKey = activeKeyFromPath(location.pathname);
  const menuItems = useMemo(
    () =>
      primaryNavItems.map((item) => ({
        key: item.key,
        icon: item.icon,
        label: item.label
      })),
    []
  );

  function toggleCollapsed() {
    const next = !collapsed;
    window.localStorage.setItem("liuli.sider.collapsed", String(next));
    setCollapsed(next);
  }

  return (
    <Layout className="app-shell">
      <Sider width={208} collapsedWidth={66} collapsed={collapsed} className="app-sider" theme="light">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <img src="/favicon.svg" alt="logo" style={{ width: '100%', height: '100%' }} />
          </div>
          {!collapsed ? <div className="brand-text">
            <Typography.Title level={4}>琉璃 Liuli</Typography.Title>
            <Typography.Text type="secondary">洞察与决策平台</Typography.Text>
          </div> : null}
        </div>
        <Menu
          mode="inline"
          selectedKeys={[activeKey]}
          items={menuItems}
          onClick={(event) => {
            const item = primaryNavItems.find((nav) => nav.key === event.key);
            if (item) navigate(item.path);
          }}
        />
        <div className="sider-footer">
          <Button
            type="text"
            size="small"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={toggleCollapsed}
          >
            {!collapsed ? "收起菜单" : null}
          </Button>
        </div>
      </Sider>
      <Layout>
        <TopStatusBar />
        <Content className="app-content">
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
