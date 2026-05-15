# Liuli Web Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Liuli Web frontend as a left-nav investment research workstation aligned with `docs/liuli_system_spec_v6.md` and `docs/superpowers/specs/2026-05-14-liuli-web-design.md`.

**Architecture:** The Web app lives under `invest_assistant/ui/web`, uses a single React/Vite shell, a centralized axios client, feature-scoped API modules, and page folders aligned with backend module boundaries. The UI uses left-side primary navigation, content-top secondary tabs, drawer-based list details, dedicated detail pages for complex research objects, and Ant Design theme switching for light, dark, and follow-system modes.

**Tech Stack:** React 18, Vite 5, TypeScript, Ant Design 6, axios, dayjs, echarts, echarts-for-react.

---

## File Structure

Create the Web project from scratch under `invest_assistant/ui/web`. Do not copy the old Web directory.

```text
invest_assistant/ui/web/
├── package.json
├── index.html
├── vite.config.ts
├── tsconfig.json
└── src/
    ├── main.tsx
    ├── app/
    │   ├── App.tsx
    │   ├── navigation.ts
    │   ├── router.tsx
    │   └── theme.tsx
    ├── api/
    │   ├── client.ts
    │   ├── auth.ts
    │   ├── console.ts
    │   ├── marketRadar.ts
    │   ├── trackDiscovery.ts
    │   ├── stockAnalysis.ts
    │   ├── alerts.ts
    │   ├── portfolio.ts
    │   ├── knowledge.ts
    │   ├── jobs.ts
    │   ├── reports.ts
    │   ├── disclosures.ts
    │   ├── stocks.ts
    │   └── systemConfig.ts
    ├── components/
    │   ├── charts/
    │   │   ├── ChartCard.tsx
    │   │   └── chartTheme.ts
    │   ├── common/
    │   │   ├── EmptyAction.tsx
    │   │   ├── PageHeader.tsx
    │   │   ├── StatusTag.tsx
    │   │   └── WorkbenchCard.tsx
    │   └── layout/
    │       ├── AppLayout.tsx
    │       ├── ModuleTabs.tsx
    │       └── TopStatusBar.tsx
    ├── hooks/
    │   ├── useAsyncData.ts
    │   └── useDrawerState.ts
    ├── pages/
    │   ├── auth/
    │   │   └── LoginPage.tsx
    │   ├── dashboard/
    │   │   └── DashboardPage.tsx
    │   ├── market-radar/
    │   │   ├── MarketRadarPage.tsx
    │   │   └── sections.tsx
    │   ├── track-discovery/
    │   │   ├── TrackDiscoveryPage.tsx
    │   │   └── TrackDetailPage.tsx
    │   ├── stock-analysis/
    │   │   ├── StockAnalysisPage.tsx
    │   │   └── StockDetailPage.tsx
    │   ├── alerts/
    │   │   └── AlertsPage.tsx
    │   ├── portfolio/
    │   │   ├── PortfolioPage.tsx
    │   │   └── PortfolioDetailPage.tsx
    │   ├── knowledge/
    │   │   └── KnowledgePage.tsx
    │   └── console/
    │       ├── ConsolePage.tsx
    │       └── sections.tsx
    ├── styles/
    │   └── global.css
    └── types/
        └── api.ts
```

## Task 1: Scaffold Web Project

**Files:**
- Create: `invest_assistant/ui/web/package.json`
- Create: `invest_assistant/ui/web/index.html`
- Create: `invest_assistant/ui/web/vite.config.ts`
- Create: `invest_assistant/ui/web/tsconfig.json`
- Create: `invest_assistant/ui/web/src/main.tsx`
- Create: `invest_assistant/ui/web/src/styles/global.css`

- [ ] **Step 1: Create package metadata**

Create `invest_assistant/ui/web/package.json`:

```json
{
  "name": "liuli-web",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@ant-design/icons": "^6.1.0",
    "@vitejs/plugin-react": "^4.2.0",
    "antd": "^6.0.1",
    "axios": "^1.6.0",
    "dayjs": "^1.11.19",
    "echarts": "^5.5.1",
    "echarts-for-react": "^3.0.2",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.30.1"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "typescript": "^5.4.0",
    "vite": "^5.0.0"
  }
}
```

- [ ] **Step 2: Create Vite entry files**

Create `index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>琉璃</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `vite.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true
      }
    }
  }
});
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["DOM", "DOM.Iterable", "ES2020"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx"
  },
  "include": ["src"],
  "references": []
}
```

- [ ] **Step 3: Create temporary app entry**

Create `src/main.tsx`:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import "antd/dist/reset.css";
import "./styles/global.css";

function BootstrapApp() {
  return <div className="boot-screen">琉璃 Web</div>;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BootstrapApp />
  </React.StrictMode>
);
```

Create `src/styles/global.css`:

```css
:root {
  font-family: Inter, "Segoe UI", "Microsoft YaHei", system-ui, sans-serif;
  color: #1f2937;
  background: #f5f7fb;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-width: 1200px;
  background: #f5f7fb;
}

.boot-screen {
  display: grid;
  min-height: 100vh;
  place-items: center;
  font-size: 20px;
  color: #1f2937;
}
```

- [ ] **Step 4: Install and build**

Run:

```powershell
cd invest_assistant\ui\web
npm.cmd install
npm.cmd run build
```

Expected: Vite builds successfully and creates `dist/`.

- [ ] **Step 5: Commit**

```powershell
git add invest_assistant\ui\web
git commit -m "feat: scaffold liuli web app"
```

## Task 2: Add API Client, Types, And Auth Flow

**Files:**
- Create: `invest_assistant/ui/web/src/api/client.ts`
- Create: `invest_assistant/ui/web/src/api/auth.ts`
- Create: `invest_assistant/ui/web/src/types/api.ts`
- Create: `invest_assistant/ui/web/src/pages/auth/LoginPage.tsx`
- Modify: `invest_assistant/ui/web/src/main.tsx`

- [ ] **Step 1: Add shared API types**

Create `src/types/api.ts`:

```ts
export type TokenResponse = {
  access_token: string;
  token_type: string;
};

export type UserMe = {
  id: number;
  username: string;
  display_name?: string | null;
  role: string;
};

export type ApiErrorPayload = {
  detail?: string;
};
```

- [ ] **Step 2: Add axios client**

Create `src/api/client.ts`:

```ts
import axios from "axios";

export const tokenStorageKey = "liuli.auth.token";

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "",
  timeout: 30000
});

apiClient.interceptors.request.use((config) => {
  const token = window.localStorage.getItem(tokenStorageKey);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && window.location.pathname !== "/login") {
      window.localStorage.removeItem(tokenStorageKey);
      window.location.assign("/login");
    }
    return Promise.reject(error);
  }
);
```

- [ ] **Step 3: Add auth API module**

Create `src/api/auth.ts`:

```ts
import { apiClient } from "./client";
import type { TokenResponse, UserMe } from "../types/api";

export async function login(username: string, password: string): Promise<TokenResponse> {
  const response = await apiClient.post<TokenResponse>("/api/auth/login", {
    username,
    password
  });
  return response.data;
}

export async function getMe(): Promise<UserMe> {
  const response = await apiClient.get<UserMe>("/api/auth/me");
  return response.data;
}

export async function logout(): Promise<void> {
  await apiClient.post("/api/auth/logout");
}
```

- [ ] **Step 4: Add login page**

Create `src/pages/auth/LoginPage.tsx`:

```tsx
import { LockOutlined, UserOutlined } from "@ant-design/icons";
import { Button, Card, Form, Input, Typography, message } from "antd";
import { useState } from "react";
import { login } from "../../api/auth";
import { tokenStorageKey } from "../../api/client";

type LoginValues = {
  username: string;
  password: string;
};

export function LoginPage() {
  const [loading, setLoading] = useState(false);

  async function handleFinish(values: LoginValues) {
    setLoading(true);
    try {
      const token = await login(values.username, values.password);
      window.localStorage.setItem(tokenStorageKey, token.access_token);
      window.location.assign("/");
    } catch {
      message.error("登录失败，请检查账号和密码");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <Card className="login-card">
        <Typography.Title level={3}>琉璃</Typography.Title>
        <Typography.Text type="secondary">投资研究工作台</Typography.Text>
        <Form layout="vertical" onFinish={handleFinish} className="login-form">
          <Form.Item name="username" label="账号" rules={[{ required: true, message: "请输入账号" }]}>
            <Input prefix={<UserOutlined />} autoComplete="username" />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true, message: "请输入密码" }]}>
            <Input.Password prefix={<LockOutlined />} autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={loading} block>
            登录
          </Button>
        </Form>
      </Card>
    </div>
  );
}
```

Append to `src/styles/global.css`:

```css
.login-page {
  display: grid;
  min-height: 100vh;
  place-items: center;
  background: #eef2f7;
}

.login-card {
  width: 360px;
}

.login-form {
  margin-top: 24px;
}
```

- [ ] **Step 5: Run build**

Run:

```powershell
cd invest_assistant\ui\web
npm.cmd run build
```

Expected: TypeScript and Vite build succeed.

- [ ] **Step 6: Commit**

```powershell
git add invest_assistant\ui\web
git commit -m "feat: add web api client and login"
```

## Task 3: Add Theme Provider And Application Shell

**Files:**
- Create: `invest_assistant/ui/web/src/app/theme.tsx`
- Create: `invest_assistant/ui/web/src/app/navigation.ts`
- Create: `invest_assistant/ui/web/src/components/layout/AppLayout.tsx`
- Create: `invest_assistant/ui/web/src/components/layout/TopStatusBar.tsx`
- Create: `invest_assistant/ui/web/src/components/layout/ModuleTabs.tsx`
- Create: `invest_assistant/ui/web/src/app/App.tsx`
- Modify: `invest_assistant/ui/web/src/main.tsx`
- Modify: `invest_assistant/ui/web/src/styles/global.css`

- [ ] **Step 1: Add theme provider**

Create `src/app/theme.tsx`:

```tsx
import { ConfigProvider, theme } from "antd";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type ThemeMode = "light" | "dark" | "system";

type ThemeContextValue = {
  mode: ThemeMode;
  resolvedMode: "light" | "dark";
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const storageKey = "liuli.theme.mode";

function getSystemMode(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function LiuliThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    const stored = window.localStorage.getItem(storageKey);
    return stored === "light" || stored === "dark" || stored === "system" ? stored : "light";
  });
  const [systemMode, setSystemMode] = useState<"light" | "dark">(getSystemMode);

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = () => setSystemMode(getSystemMode());
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, []);

  const resolvedMode = mode === "system" ? systemMode : mode;

  const value = useMemo(
    () => ({
      mode,
      resolvedMode,
      setMode(nextMode: ThemeMode) {
        window.localStorage.setItem(storageKey, nextMode);
        setModeState(nextMode);
      }
    }),
    [mode, resolvedMode]
  );

  return (
    <ThemeContext.Provider value={value}>
      <ConfigProvider
        theme={{
          algorithm: resolvedMode === "dark" ? theme.darkAlgorithm : theme.defaultAlgorithm,
          token: {
            borderRadius: 6,
            colorPrimary: "#2563eb"
          }
        }}
      >
        <div data-theme={resolvedMode}>{children}</div>
      </ConfigProvider>
    </ThemeContext.Provider>
  );
}

export function useLiuliTheme() {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error("useLiuliTheme must be used inside LiuliThemeProvider");
  }
  return value;
}
```

- [ ] **Step 2: Add navigation metadata**

Create `src/app/navigation.ts`:

```ts
import {
  AlertOutlined,
  ApartmentOutlined,
  BarChartOutlined,
  BookOutlined,
  DashboardOutlined,
  FundProjectionScreenOutlined,
  LineChartOutlined,
  SettingOutlined
} from "@ant-design/icons";
import type { ReactNode } from "react";

export type NavItem = {
  key: string;
  label: string;
  path: string;
  icon: ReactNode;
};

export const primaryNavItems: NavItem[] = [
  { key: "dashboard", label: "总览", path: "/", icon: <DashboardOutlined /> },
  { key: "market-radar", label: "市场雷达", path: "/market-radar", icon: <BarChartOutlined /> },
  { key: "track-discovery", label: "赛道发现", path: "/track-discovery", icon: <ApartmentOutlined /> },
  { key: "stock-analysis", label: "标的分析", path: "/stock-analysis", icon: <LineChartOutlined /> },
  { key: "alerts", label: "预警中心", path: "/alerts", icon: <AlertOutlined /> },
  { key: "portfolio", label: "组合管理", path: "/portfolio", icon: <FundProjectionScreenOutlined /> },
  { key: "knowledge", label: "知识库", path: "/knowledge", icon: <BookOutlined /> },
  { key: "console", label: "控制台", path: "/console", icon: <SettingOutlined /> }
];

export const moduleTabs: Record<string, { key: string; label: string }[]> = {
  "market-radar": [
    { key: "overview", label: "总览" },
    { key: "rankings", label: "热度榜" },
    { key: "sources", label: "信息源" },
    { key: "tags", label: "标签" },
    { key: "candidates", label: "候选标签" },
    { key: "graph", label: "关系图" }
  ],
  "track-discovery": [
    { key: "overview", label: "总览" },
    { key: "candidates", label: "候选赛道" },
    { key: "theses", label: "赛道列表" },
    { key: "evidence", label: "证据链" }
  ],
  "stock-analysis": [
    { key: "overview", label: "总览" },
    { key: "pool", label: "标的池" },
    { key: "scores", label: "评分" },
    { key: "reports", label: "分析报告" },
    { key: "compare", label: "对比" }
  ],
  alerts: [
    { key: "events", label: "事件" },
    { key: "rules", label: "规则" },
    { key: "handled", label: "处理记录" }
  ],
  portfolio: [
    { key: "portfolios", label: "组合" },
    { key: "positions", label: "持仓" },
    { key: "risk", label: "风险暴露" },
    { key: "review", label: "复盘" }
  ],
  knowledge: [
    { key: "notes", label: "笔记" },
    { key: "skills", label: "Skills" },
    { key: "agents", label: "Agents" },
    { key: "feedback", label: "反馈日志" }
  ],
  console: [
    { key: "status", label: "系统状态" },
    { key: "jobs", label: "任务中心" },
    { key: "reports", label: "报告库" },
    { key: "disclosures", label: "公告财报库" },
    { key: "stocks", label: "股票基础库" },
    { key: "config", label: "系统配置" },
    { key: "ai-logs", label: "AI 日志" }
  ]
};
```

- [ ] **Step 3: Add layout components**

Create `src/components/layout/ModuleTabs.tsx`:

```tsx
import { Tabs } from "antd";

type ModuleTabsProps = {
  activeKey: string;
  items: { key: string; label: string }[];
  onChange: (key: string) => void;
};

export function ModuleTabs({ activeKey, items, onChange }: ModuleTabsProps) {
  return <Tabs activeKey={activeKey} items={items} onChange={onChange} className="module-tabs" />;
}
```

Create `src/components/layout/TopStatusBar.tsx`:

```tsx
import { BulbOutlined, ReloadOutlined } from "@ant-design/icons";
import { Button, Select, Space, Tag, Typography } from "antd";
import { useLiuliTheme, type ThemeMode } from "../../app/theme";

export function TopStatusBar() {
  const { mode, setMode } = useLiuliTheme();

  return (
    <div className="top-status-bar">
      <Space size={12}>
        <Tag color="success">API 在线</Tag>
        <Tag>任务状态待同步</Tag>
        <Typography.Text type="secondary">默认浅色调试</Typography.Text>
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
        <Button size="small" icon={<ReloadOutlined />}>
          刷新
        </Button>
        <Button size="small" icon={<BulbOutlined />}>
          brian
        </Button>
      </Space>
    </div>
  );
}
```

Create `src/components/layout/AppLayout.tsx`:

```tsx
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
      <Sider width={208} className="app-sider">
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
```

- [ ] **Step 4: Wire app shell**

Create `src/app/App.tsx`:

```tsx
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { tokenStorageKey } from "../api/client";
import { AppLayout } from "../components/layout/AppLayout";
import { LoginPage } from "../pages/auth/LoginPage";
import { DashboardPage } from "../pages/dashboard/DashboardPage";

function RequireAuth({ children }: { children: JSX.Element }) {
  const token = window.localStorage.getItem(tokenStorageKey);
  return token ? children : <Navigate to="/login" replace />;
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route index element={<DashboardPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
```

Modify `src/main.tsx`:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import "antd/dist/reset.css";
import { App } from "./app/App";
import { LiuliThemeProvider } from "./app/theme";
import "./styles/global.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <LiuliThemeProvider>
      <App />
    </LiuliThemeProvider>
  </React.StrictMode>
);
```

- [ ] **Step 5: Add shell styles**

Append to `src/styles/global.css`:

```css
.app-shell {
  min-height: 100vh;
}

.app-sider {
  border-right: 1px solid rgba(15, 23, 42, 0.08);
  background: #ffffff;
}

.brand {
  height: 76px;
  padding: 16px 20px 12px;
}

.brand h4 {
  margin: 0;
}

.top-status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 48px;
  padding: 0 20px;
  border-bottom: 1px solid rgba(15, 23, 42, 0.08);
  background: #ffffff;
}

.app-content {
  min-height: calc(100vh - 48px);
  padding: 20px;
  background: #f5f7fb;
}

.module-tabs {
  margin-top: 8px;
}

[data-theme="dark"] .app-sider,
[data-theme="dark"] .top-status-bar {
  background: #141414;
  border-color: rgba(255, 255, 255, 0.12);
}

[data-theme="dark"] .app-content {
  background: #0f1115;
}
```

- [ ] **Step 6: Build and commit**

Run:

```powershell
cd invest_assistant\ui\web
npm.cmd run build
```

Expected: Build succeeds.

Commit:

```powershell
git add invest_assistant\ui\web
git commit -m "feat: add web shell and theme switching"
```

## Task 4: Add Shared Workbench Components And Charts

**Files:**
- Create: `invest_assistant/ui/web/src/components/common/PageHeader.tsx`
- Create: `invest_assistant/ui/web/src/components/common/WorkbenchCard.tsx`
- Create: `invest_assistant/ui/web/src/components/common/EmptyAction.tsx`
- Create: `invest_assistant/ui/web/src/components/common/StatusTag.tsx`
- Create: `invest_assistant/ui/web/src/components/charts/chartTheme.ts`
- Create: `invest_assistant/ui/web/src/components/charts/ChartCard.tsx`
- Create: `invest_assistant/ui/web/src/hooks/useAsyncData.ts`
- Create: `invest_assistant/ui/web/src/hooks/useDrawerState.ts`

- [ ] **Step 1: Add common display components**

Create `PageHeader.tsx`:

```tsx
import { Space, Typography } from "antd";
import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
};

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="page-header">
      <div>
        <Typography.Title level={3}>{title}</Typography.Title>
        {description ? <Typography.Text type="secondary">{description}</Typography.Text> : null}
      </div>
      {actions ? <Space>{actions}</Space> : null}
    </div>
  );
}
```

Create `WorkbenchCard.tsx`:

```tsx
import { Card } from "antd";
import type { ReactNode } from "react";

export function WorkbenchCard({ title, children, extra }: { title?: string; children: ReactNode; extra?: ReactNode }) {
  return (
    <Card title={title} extra={extra} className="workbench-card" styles={{ body: { padding: 16 } }}>
      {children}
    </Card>
  );
}
```

Create `EmptyAction.tsx`:

```tsx
import { Button, Empty } from "antd";
import type { ReactNode } from "react";

type EmptyActionProps = {
  description: string;
  actionText?: string;
  onAction?: () => void;
  extra?: ReactNode;
};

export function EmptyAction({ description, actionText, onAction, extra }: EmptyActionProps) {
  return (
    <Empty
      image={Empty.PRESENTED_IMAGE_SIMPLE}
      description={description}
    >
      {actionText && onAction ? (
        <Button type="primary" onClick={onAction}>
          {actionText}
        </Button>
      ) : (
        extra
      )}
    </Empty>
  );
}
```

Create `StatusTag.tsx`:

```tsx
import { Tag } from "antd";

const colorByStatus: Record<string, string> = {
  active: "green",
  enabled: "green",
  pending: "gold",
  running: "blue",
  failed: "red",
  archived: "default",
  disabled: "default",
  handled: "green",
  unread: "red"
};

export function StatusTag({ status }: { status?: string | null }) {
  const value = status || "unknown";
  return <Tag color={colorByStatus[value] || "blue"}>{value}</Tag>;
}
```

- [ ] **Step 2: Add chart wrapper**

Create `chartTheme.ts`:

```ts
export function chartTextColor(mode: "light" | "dark") {
  return mode === "dark" ? "#d1d5db" : "#374151";
}

export function chartGridColor(mode: "light" | "dark") {
  return mode === "dark" ? "rgba(255,255,255,0.12)" : "rgba(15,23,42,0.10)";
}

export function chartBackgroundColor(mode: "light" | "dark") {
  return mode === "dark" ? "#141414" : "#ffffff";
}
```

Create `ChartCard.tsx`:

```tsx
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import { WorkbenchCard } from "../common/WorkbenchCard";
import { useLiuliTheme } from "../../app/theme";
import { chartBackgroundColor } from "./chartTheme";

type ChartCardProps = {
  title: string;
  option: EChartsOption;
  height?: number;
};

export function ChartCard({ title, option, height = 280 }: ChartCardProps) {
  const { resolvedMode } = useLiuliTheme();
  return (
    <WorkbenchCard title={title}>
      <ReactECharts
        option={{ backgroundColor: chartBackgroundColor(resolvedMode), ...option }}
        style={{ height, width: "100%" }}
        notMerge
      />
    </WorkbenchCard>
  );
}
```

- [ ] **Step 3: Add small hooks**

Create `useAsyncData.ts`:

```ts
import { useCallback, useEffect, useState } from "react";

export function useAsyncData<T>(loader: () => Promise<T>, initialValue: T) {
  const [data, setData] = useState<T>(initialValue);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nextData = await loader();
      setData(nextData);
    } catch (nextError) {
      setError(nextError);
    } finally {
      setLoading(false);
    }
  }, [loader]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}
```

Create `useDrawerState.ts`:

```ts
import { useState } from "react";

export function useDrawerState<T>() {
  const [record, setRecord] = useState<T | null>(null);
  return {
    record,
    open: Boolean(record),
    show: setRecord,
    close: () => setRecord(null)
  };
}
```

- [ ] **Step 4: Add styles**

Append to `src/styles/global.css`:

```css
.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 12px;
}

.page-header h3 {
  margin: 0 0 4px;
}

.workbench-card {
  border-radius: 6px;
}
```

- [ ] **Step 5: Build and commit**

Run:

```powershell
cd invest_assistant\ui\web
npm.cmd run build
```

Commit:

```powershell
git add invest_assistant\ui\web
git commit -m "feat: add web workbench components"
```

## Task 5: Add API Modules For Existing Backend Routes

**Files:**
- Create/modify files in `invest_assistant/ui/web/src/api/*.ts`
- Modify: `invest_assistant/ui/web/src/types/api.ts`

- [ ] **Step 1: Add common domain types**

Append to `src/types/api.ts`:

```ts
export type Id = number;

export type JobConfig = {
  id: number;
  job_name: string;
  module_name: string;
  description?: string | null;
  enabled: boolean;
  cron_expr?: string | null;
  timeout_seconds?: number | null;
  status?: string | null;
};

export type Report = {
  id: number;
  title: string;
  report_type: string;
  source_module: string;
  target_type?: string | null;
  target_id?: number | null;
  file_path?: string | null;
  created_at?: string | null;
};

export type Disclosure = {
  id: number;
  title: string;
  stock_code?: string | null;
  stock_name?: string | null;
  disclosure_type: string;
  publish_date?: string | null;
  parse_status?: string | null;
};

export type Stock = {
  id: number;
  symbol: string;
  name: string;
  market?: string | null;
  industry?: string | null;
  status?: string | null;
};
```

- [ ] **Step 2: Add console and basic API modules**

Create `src/api/console.ts`:

```ts
import { apiClient } from "./client";

export type SystemStatus = {
  api: string;
  database: string;
};

export async function getSystemStatus(): Promise<SystemStatus> {
  const response = await apiClient.get<SystemStatus>("/api/console/system-status");
  return response.data;
}

export async function getDashboard(): Promise<Record<string, string>> {
  const response = await apiClient.get<Record<string, string>>("/api/console/dashboard");
  return response.data;
}

export async function getAiLogs(): Promise<Record<string, string>[]> {
  const response = await apiClient.get<Record<string, string>[]>("/api/console/ai-logs");
  return response.data;
}
```

Create `src/api/jobs.ts`:

```ts
import { apiClient } from "./client";
import type { JobConfig } from "../types/api";

export async function listJobs(): Promise<JobConfig[]> {
  const response = await apiClient.get<JobConfig[]>("/api/jobs");
  return response.data;
}

export async function syncJobDefinitions(): Promise<{ synced: number }> {
  const response = await apiClient.post<{ synced: number }>("/api/jobs/sync-definitions");
  return response.data;
}

export async function runJob(jobName: string): Promise<unknown> {
  const response = await apiClient.post(`/api/jobs/${encodeURIComponent(jobName)}/run`, {});
  return response.data;
}
```

Create `src/api/reports.ts`, `src/api/disclosures.ts`, `src/api/stocks.ts`, and `src/api/systemConfig.ts` with the same pattern:

```ts
import { apiClient } from "./client";
import type { Disclosure, Report, Stock } from "../types/api";

export async function listReports(): Promise<Report[]> {
  const response = await apiClient.get<Report[]>("/api/reports");
  return response.data;
}

export async function listDisclosures(): Promise<Disclosure[]> {
  const response = await apiClient.get<Disclosure[]>("/api/disclosures");
  return response.data;
}

export async function listStocks(): Promise<Stock[]> {
  const response = await apiClient.get<Stock[]>("/api/stocks");
  return response.data;
}

export async function listSystemConfigs(): Promise<Record<string, unknown>[]> {
  const response = await apiClient.get<Record<string, unknown>[]>("/api/system-config");
  return response.data;
}
```

Split those functions into their own files, not one combined file.

- [ ] **Step 3: Add business API modules**

Create one module per business boundary:

```ts
// src/api/marketRadar.ts
import { apiClient } from "./client";

export async function getMarketOverview(): Promise<Record<string, number>> {
  const response = await apiClient.get<Record<string, number>>("/api/market-radar/overview");
  return response.data;
}

export async function listMarketTags(): Promise<Record<string, unknown>[]> {
  const response = await apiClient.get<Record<string, unknown>[]>("/api/market-radar/tags");
  return response.data;
}

export async function listSourceItems(): Promise<Record<string, unknown>[]> {
  const response = await apiClient.get<Record<string, unknown>[]>("/api/market-radar/source-items");
  return response.data;
}

export async function listRankings(type: string, window = "24h"): Promise<Record<string, unknown>[]> {
  const response = await apiClient.get<Record<string, unknown>[]>("/api/market-radar/rankings", {
    params: { type, window }
  });
  return response.data;
}
```

Create equivalent files with currently available endpoints:

- `trackDiscovery.ts`: `/api/track-discovery/theses`, `/api/track-discovery/candidates`
- `stockAnalysis.ts`: `/api/stock-analysis/pool`, `/api/stock-analysis/compare-groups`, `/api/stock-analysis/reports`
- `alerts.ts`: `/api/alerts/events`, `/api/alerts/rules`
- `portfolio.ts`: `/api/portfolios`
- `knowledge.ts`: `/api/knowledge/notes`, `/api/knowledge/skills`, `/api/knowledge/agents`, `/api/knowledge/feedback-logs`

- [ ] **Step 4: Build and commit**

Run:

```powershell
cd invest_assistant\ui\web
npm.cmd run build
```

Commit:

```powershell
git add invest_assistant\ui\web
git commit -m "feat: add web api modules"
```

## Task 6: Add Dashboard And Route Registration

**Files:**
- Create: `invest_assistant/ui/web/src/pages/dashboard/DashboardPage.tsx`
- Create: `invest_assistant/ui/web/src/app/router.tsx`
- Modify: `invest_assistant/ui/web/src/app/App.tsx`

- [ ] **Step 1: Create dashboard page**

Create `DashboardPage.tsx`:

```tsx
import { Col, Row, Statistic, Table } from "antd";
import { useCallback } from "react";
import { getSystemStatus } from "../../api/console";
import { listJobs } from "../../api/jobs";
import { listReports } from "../../api/reports";
import { PageHeader } from "../../components/common/PageHeader";
import { WorkbenchCard } from "../../components/common/WorkbenchCard";
import { useAsyncData } from "../../hooks/useAsyncData";

export function DashboardPage() {
  const loadStatus = useCallback(getSystemStatus, []);
  const loadJobs = useCallback(listJobs, []);
  const loadReports = useCallback(listReports, []);
  const status = useAsyncData(loadStatus, { api: "unknown", database: "unknown" });
  const jobs = useAsyncData(loadJobs, []);
  const reports = useAsyncData(loadReports, []);

  return (
    <>
      <PageHeader title="工作台总览" description="市场、任务、报告和系统状态的统一入口" />
      <Row gutter={[12, 12]}>
        <Col span={6}>
          <WorkbenchCard>
            <Statistic title="API" value={status.data.api} loading={status.loading} />
          </WorkbenchCard>
        </Col>
        <Col span={6}>
          <WorkbenchCard>
            <Statistic title="数据库" value={status.data.database} loading={status.loading} />
          </WorkbenchCard>
        </Col>
        <Col span={6}>
          <WorkbenchCard>
            <Statistic title="任务定义" value={jobs.data.length} loading={jobs.loading} />
          </WorkbenchCard>
        </Col>
        <Col span={6}>
          <WorkbenchCard>
            <Statistic title="报告数量" value={reports.data.length} loading={reports.loading} />
          </WorkbenchCard>
        </Col>
        <Col span={12}>
          <WorkbenchCard title="最近任务">
            <Table
              rowKey="job_name"
              size="small"
              loading={jobs.loading}
              dataSource={jobs.data.slice(0, 6)}
              pagination={false}
              columns={[
                { title: "任务", dataIndex: "job_name" },
                { title: "模块", dataIndex: "module_name" },
                { title: "启用", dataIndex: "enabled", render: (value) => (value ? "是" : "否") }
              ]}
            />
          </WorkbenchCard>
        </Col>
        <Col span={12}>
          <WorkbenchCard title="最近报告">
            <Table
              rowKey="id"
              size="small"
              loading={reports.loading}
              dataSource={reports.data.slice(0, 6)}
              pagination={false}
              columns={[
                { title: "标题", dataIndex: "title" },
                { title: "类型", dataIndex: "report_type" },
                { title: "模块", dataIndex: "source_module" }
              ]}
            />
          </WorkbenchCard>
        </Col>
      </Row>
    </>
  );
}
```

- [ ] **Step 2: Create route registry**

Create `src/app/router.tsx`:

```tsx
import { RouteObject } from "react-router-dom";
import { DashboardPage } from "../pages/dashboard/DashboardPage";

export const protectedRoutes: RouteObject[] = [
  { index: true, element: <DashboardPage /> }
];
```

Modify `App.tsx` to render future route children from `protectedRoutes` or directly keep explicit route declarations. The route tree must keep `/` under `AppLayout`.

- [ ] **Step 3: Build and commit**

Run:

```powershell
cd invest_assistant\ui\web
npm.cmd run build
```

Commit:

```powershell
git add invest_assistant\ui\web
git commit -m "feat: add web dashboard"
```

## Task 7: Add Six Business Module Pages

**Files:**
- Create/modify all files under:
  - `invest_assistant/ui/web/src/pages/market-radar/`
  - `invest_assistant/ui/web/src/pages/track-discovery/`
  - `invest_assistant/ui/web/src/pages/stock-analysis/`
  - `invest_assistant/ui/web/src/pages/alerts/`
  - `invest_assistant/ui/web/src/pages/portfolio/`
  - `invest_assistant/ui/web/src/pages/knowledge/`
- Modify: `invest_assistant/ui/web/src/app/App.tsx`

- [ ] **Step 1: Implement Market Radar page**

Create `MarketRadarPage.tsx` with local tab state and sections from `sections.tsx`. It must use `moduleTabs["market-radar"]` and show ECharts for overview and graph tabs.

Use this page shape:

```tsx
import { useState } from "react";
import { moduleTabs } from "../../app/navigation";
import { ModuleTabs } from "../../components/layout/ModuleTabs";
import { PageHeader } from "../../components/common/PageHeader";
import { MarketRadarSections } from "./sections";

export function MarketRadarPage() {
  const [activeTab, setActiveTab] = useState("overview");
  return (
    <>
      <PageHeader title="市场雷达" description="发现市场正在关注什么" />
      <ModuleTabs activeKey={activeTab} items={moduleTabs["market-radar"]} onChange={setActiveTab} />
      <MarketRadarSections activeTab={activeTab} />
    </>
  );
}
```

`sections.tsx` must map tabs to API-backed tables and charts using `getMarketOverview`, `listRankings`, `listSourceItems`, and `listMarketTags`.

- [ ] **Step 2: Implement Track Discovery page**

Create `TrackDiscoveryPage.tsx` using `moduleTabs["track-discovery"]`.

Tabs:

- `overview`: summary from thesis and candidates counts.
- `candidates`: table using `listTrackCandidates`.
- `theses`: table using `listTrackTheses`.
- `evidence`: empty state pointing to thesis detail.

Create `TrackDetailPage.tsx` as a minimal route page. It must read `id` from `useParams`, show title `赛道详情`, and render three sections: `基础信息`, `验证指标`, and `证据链`. If the matching backend detail data is unavailable, show an `EmptyAction` explaining that the route is ready and evidence will appear after data is created.

- [ ] **Step 3: Implement Stock Analysis page**

Create `StockAnalysisPage.tsx` using `moduleTabs["stock-analysis"]`.

Tabs:

- `overview`: pool count and report count.
- `pool`: table using `listStockPool`.
- `scores`: empty state instructing user to select a stock.
- `reports`: table using `listStockReports`.
- `compare`: table using `listCompareGroups`.

Create `StockDetailPage.tsx` as a minimal route page. It must read `id` from `useParams`, show title `标的详情`, and render three sections: `研究笔记`, `评分快照`, and `分析报告`. If the selected stock has no related data, show real empty states for each section.

- [ ] **Step 4: Implement Alerts page**

Create `AlertsPage.tsx` using `moduleTabs.alerts`.

Tabs:

- `events`: table using `listAlertEvents`, right drawer detail.
- `rules`: table using `listAlertRules`.
- `handled`: filter events where status is `handled` or `read`.

- [ ] **Step 5: Implement Portfolio page**

Create `PortfolioPage.tsx` using `moduleTabs.portfolio`.

Tabs:

- `portfolios`: table using `listPortfolios`.
- `positions`: empty state instructing user to open a portfolio.
- `risk`: ECharts pie or bar chart derived from available portfolio list. If there is no position-level risk data, show portfolio count by status and an empty-state hint explaining that risk exposure requires positions.
- `review`: empty state instructing user to open a portfolio.

Create `PortfolioDetailPage.tsx` as a minimal route page. It must read `id` from `useParams`, show title `组合详情`, and render sections for `持仓`, `风险暴露`, and `复盘`. If API data is empty, render actionable empty states.

- [ ] **Step 6: Implement Knowledge page**

Create `KnowledgePage.tsx` using `moduleTabs.knowledge`.

Tabs:

- `notes`: table using `listKnowledgeNotes`, right drawer detail.
- `skills`: table using `listKnowledgeSkills`.
- `agents`: table using `listKnowledgeAgents`.
- `feedback`: table using `listKnowledgeFeedbackLogs`.

- [ ] **Step 7: Register routes**

Modify `App.tsx` to include:

```tsx
<Route path="market-radar" element={<MarketRadarPage />} />
<Route path="track-discovery" element={<TrackDiscoveryPage />} />
<Route path="track-discovery/theses/:id" element={<TrackDetailPage />} />
<Route path="stock-analysis" element={<StockAnalysisPage />} />
<Route path="stock-analysis/stocks/:id" element={<StockDetailPage />} />
<Route path="alerts" element={<AlertsPage />} />
<Route path="portfolio" element={<PortfolioPage />} />
<Route path="portfolio/:id" element={<PortfolioDetailPage />} />
<Route path="knowledge" element={<KnowledgePage />} />
```

- [ ] **Step 8: Build and commit**

Run:

```powershell
cd invest_assistant\ui\web
npm.cmd run build
```

Commit:

```powershell
git add invest_assistant\ui\web
git commit -m "feat: add web business modules"
```

## Task 8: Add Console Page

**Files:**
- Create: `invest_assistant/ui/web/src/pages/console/ConsolePage.tsx`
- Create: `invest_assistant/ui/web/src/pages/console/sections.tsx`
- Modify: `invest_assistant/ui/web/src/app/App.tsx`

- [ ] **Step 1: Implement Console shell**

Create `ConsolePage.tsx`:

```tsx
import { useState } from "react";
import { moduleTabs } from "../../app/navigation";
import { PageHeader } from "../../components/common/PageHeader";
import { ModuleTabs } from "../../components/layout/ModuleTabs";
import { ConsoleSections } from "./sections";

export function ConsolePage() {
  const [activeTab, setActiveTab] = useState("status");
  return (
    <>
      <PageHeader title="控制台" description="系统运营管理入口，不承载投资分析业务逻辑" />
      <ModuleTabs activeKey={activeTab} items={moduleTabs.console} onChange={setActiveTab} />
      <ConsoleSections activeTab={activeTab} />
    </>
  );
}
```

- [ ] **Step 2: Implement Console sections**

Create `sections.tsx` with one rendering function per tab:

- `status`: `getSystemStatus`, `getDashboard`, `getAiLogs`
- `jobs`: `listJobs`, `syncJobDefinitions`, `runJob`
- `reports`: `listReports`
- `disclosures`: `listDisclosures`
- `stocks`: `listStocks`
- `config`: `listSystemConfigs`
- `ai-logs`: `getAiLogs`

The jobs section must include two buttons:

```tsx
<Button onClick={() => syncJobDefinitions().then(refresh)}>同步任务定义</Button>
<Button onClick={() => runJob(record.job_name).then(refresh)}>立即运行</Button>
```

Use a `Table` for every list and `EmptyAction` when the list is empty.

- [ ] **Step 3: Register route**

Modify `App.tsx`:

```tsx
<Route path="console" element={<ConsolePage />} />
```

- [ ] **Step 4: Build and commit**

Run:

```powershell
cd invest_assistant\ui\web
npm.cmd run build
```

Commit:

```powershell
git add invest_assistant\ui\web
git commit -m "feat: add web console"
```

## Task 9: Browser Verification And Backend Smoke

**Files:**
- Modify only files needed to fix issues found during verification.

- [ ] **Step 1: Run backend tests**

Run from repo root:

```powershell
pytest -q --basetemp=var/cache/pytest
```

Expected: all tests pass.

- [ ] **Step 2: Run frontend build**

Run:

```powershell
cd invest_assistant\ui\web
npm.cmd run build
```

Expected: Vite build succeeds.

- [ ] **Step 3: Start backend**

Run from repo root in a background PowerShell process:

```powershell
Start-Process -WindowStyle Hidden powershell -ArgumentList "-NoProfile","-Command","cd D:\code\ai\liuli-v2; python -m uvicorn invest_assistant.main:app --host 127.0.0.1 --port 8000"
```

Expected: backend listens on `http://127.0.0.1:8000`.

- [ ] **Step 4: Start frontend**

Run:

```powershell
cd invest_assistant\ui\web
Start-Process -WindowStyle Hidden powershell -ArgumentList "-NoProfile","-Command","cd D:\code\ai\liuli-v2\invest_assistant\ui\web; npm.cmd run dev -- --host 127.0.0.1 --port 5173"
```

Expected: frontend listens on `http://127.0.0.1:5173`.

- [ ] **Step 5: Verify in browser**

Use the Browser plugin to open `http://127.0.0.1:5173`.

Verify:

- `/login` renders.
- Login with a valid local account works, or unauthenticated protected routes redirect to `/login`.
- Left primary navigation shows the six business modules plus Console.
- Module pages show content-top secondary tabs.
- Theme selector supports `浅色`, `深色`, and `跟随系统`.
- Market Radar chart area is nonblank.
- Console jobs page can show an empty or real jobs table.
- Empty states do not use fake business data.

- [ ] **Step 6: Fix issues and rerun verification**

For any TypeScript, runtime, API, or visual issue, patch the smallest affected file and rerun:

```powershell
cd invest_assistant\ui\web
npm.cmd run build
```

If backend behavior changes are required, rerun:

```powershell
pytest -q --basetemp=var/cache/pytest
```

- [ ] **Step 7: Commit final verification fixes**

```powershell
git add invest_assistant\ui\web
git commit -m "fix: polish web frontend verification issues"
```

## Self-Review

Spec coverage:

- Six business modules plus Console operation panel are covered by Tasks 3, 7, and 8.
- Content-top secondary navigation is covered by Tasks 3, 7, and 8.
- Light, dark, and follow-system theme switching is covered by Task 3.
- ECharts chart wrapper is covered by Task 4.
- API client, login, and 401 handling are covered by Task 2.
- Real empty states are covered by Tasks 4, 7, and 8.
- Console as operation panel, not business owner, is covered by Task 8.
- Browser and build verification are covered by Task 9.

Placeholder scan:

- The plan was scanned for incomplete markers and ambiguous deferred work.
- The plan avoids open-ended instructions without target files or commands.

Type consistency:

- Navigation keys match `moduleTabs` keys used by pages.
- API module names match file names in the file structure.
- Theme mode values are consistently `light`, `dark`, and `system`.
