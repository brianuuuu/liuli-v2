import { Layout, Menu, Typography } from "antd";
import { useMemo } from "react";
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

  return (
    <Layout className="app-shell">
      <Sider width={208} className="app-sider" theme="light">
        <div className="brand">
          <Typography.Title level={4}>琉璃</Typography.Title>
          <Typography.Text type="secondary">研究工作台</Typography.Text>
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
