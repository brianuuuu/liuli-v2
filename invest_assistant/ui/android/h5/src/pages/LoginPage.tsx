import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { mobileApi } from "../api/mobileApi";

export function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await mobileApi.login(username.trim(), password);
      navigate("/dashboard", { replace: true });
    } catch {
      setError("登录失败，请检查账号、密码或服务器");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <div className="login-brand">
        <img src="/liuli-logo.svg" alt="" />
        <h1>琉璃</h1>
        <p>个人投资研究工作台</p>
      </div>
      <form className="login-form" onSubmit={submit}>
        <label>账号<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" /></label>
        <label>密码<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label>
        {error ? <p className="form-error">{error}</p> : null}
        <button type="submit" className="primary-button" disabled={loading || !username.trim() || !password}>
          {loading ? "登录中…" : "登录"}
        </button>
      </form>
      <p className="login-server">服务器由 App 外壳统一管理</p>
    </main>
  );
}
