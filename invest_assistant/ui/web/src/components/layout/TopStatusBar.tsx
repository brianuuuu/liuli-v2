import {
  KeyOutlined,
  LogoutOutlined,
  MoonOutlined,
  MoreOutlined,
  ReloadOutlined,
  SearchOutlined,
  SunOutlined,
  UserOutlined
} from "@ant-design/icons";
import { Button, Dropdown, Form, Input, Modal, Space, message } from "antd";
import type { MenuProps } from "antd";
import { useEffect, useMemo, useState } from "react";
import { changePassword, getMe, logout } from "../../api/auth";
import { tokenStorageKey } from "../../api/client";
import { listJobs, listRunRequests } from "../../api/jobs";
import { useLiuliTheme } from "../../app/theme";
import type { JobConfig, JobRunRequest, UserMe } from "../../types/api";
import { getTaskStatus } from "./taskStatus";

type PasswordFormValues = {
  old_password: string;
  new_password: string;
  confirm_password: string;
};

export function TopStatusBar() {
  const { resolvedMode, setMode } = useLiuliTheme();
  const [jobs, setJobs] = useState<JobConfig[]>([]);
  const [requests, setRequests] = useState<JobRunRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<UserMe | null>(null);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordForm] = Form.useForm<PasswordFormValues>();

  useEffect(() => {
    let active = true;

    async function refreshTaskStatus() {
      try {
        const [nextJobs, nextRequests] = await Promise.all([listJobs(), listRunRequests({ limit: 50, offset: 0 })]);
        if (!active) return;
        setJobs(nextJobs);
        setRequests(nextRequests.items);
      } catch {
        if (!active) return;
      } finally {
        if (active) setLoading(false);
      }
    }

    refreshTaskStatus();
    const timer = window.setInterval(refreshTaskStatus, 3000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadCurrentUser() {
      try {
        const user = await getMe();
        if (active) setCurrentUser(user);
      } catch {
        if (active) setCurrentUser(null);
      }
    }

    loadCurrentUser();
    return () => {
      active = false;
    };
  }, []);

  const taskStatus = useMemo(() => getTaskStatus(jobs, requests, loading), [jobs, loading, requests]);
  const userLabel = currentUser?.display_name || currentUser?.username || "用户";
  const userMenuItems: MenuProps["items"] = [
    { key: "change-password", icon: <KeyOutlined />, label: "修改密码" },
    { type: "divider" },
    { key: "logout", danger: true, icon: <LogoutOutlined />, label: "退出登录" }
  ];

  function openPasswordModal() {
    passwordForm.resetFields();
    setPasswordOpen(true);
  }

  function closePasswordModal() {
    if (passwordLoading) return;
    setPasswordOpen(false);
    passwordForm.resetFields();
  }

  const handleUserMenuClick: MenuProps["onClick"] = ({ key }) => {
    if (key === "change-password") {
      openPasswordModal();
      return;
    }
    if (key === "logout") {
      handleLogout();
    }
  };

  async function handleLogout() {
    try {
      await logout();
    } catch {
      // Local token removal is the source of truth for this single-user Web session.
    } finally {
      window.localStorage.removeItem(tokenStorageKey);
      window.location.assign("/login");
    }
  }

  async function submitPasswordChange() {
    let values: PasswordFormValues;
    try {
      values = await passwordForm.validateFields();
    } catch {
      return;
    }

    setPasswordLoading(true);
    try {
      await changePassword({
        old_password: values.old_password,
        new_password: values.new_password
      });
      message.success("密码已修改");
      setPasswordOpen(false);
      passwordForm.resetFields();
    } catch {
      message.error("密码修改失败，请检查原密码");
    } finally {
      setPasswordLoading(false);
    }
  }

  return (
    <>
      <div className="top-status-bar">
        <Space size={8} className="top-status-left">
          <Input
            size="small"
            className="global-search"
            prefix={<SearchOutlined />}
            placeholder="搜索股票/赛道/公告/知识库"
            suffix={<span className="search-shortcut">⌘ K</span>}
          />
          <span className={`status-chip ${taskStatus.className}`}><i />{taskStatus.label}</span>
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
          <Dropdown trigger={["click"]} placement="bottomRight" menu={{ items: userMenuItems, onClick: handleUserMenuClick }}>
            <Button size="small" type="text" className="toolbar-button user-button" icon={<UserOutlined />}>
              {userLabel}
            </Button>
          </Dropdown>
          <Button size="small" type="text" className="toolbar-icon" icon={<MoreOutlined />} />
        </Space>
      </div>
      <Modal
        title="修改密码"
        open={passwordOpen}
        onCancel={closePasswordModal}
        onOk={submitPasswordChange}
        confirmLoading={passwordLoading}
        destroyOnHidden
        forceRender
        width={420}
      >
        <Form form={passwordForm} layout="vertical" autoComplete="off">
          <Form.Item name="old_password" label="原密码" rules={[{ required: true, message: "请输入原密码" }]}>
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Form.Item name="new_password" label="新密码" rules={[{ required: true, message: "请输入新密码" }]}>
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            name="confirm_password"
            label="确认新密码"
            dependencies={["new_password"]}
            rules={[
              { required: true, message: "请再次输入新密码" },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue("new_password") === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error("两次输入的新密码不一致"));
                }
              })
            ]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
