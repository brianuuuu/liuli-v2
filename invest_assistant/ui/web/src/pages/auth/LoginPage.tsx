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
