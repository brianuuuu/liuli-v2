import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronRight, LogOut, Moon, Server, Sun, UserRound } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { mobileApi } from "../api/mobileApi";
import { tokenStorageKey } from "../api/client";
import { MobilePageFrame } from "../components/MobilePageFrame";
import { SecondaryNavigation } from "../components/SecondaryNavigation";
import { ErrorState, LoadingState, SectionCard } from "../components/Ui";
import { nativeBridge, type ThemeMode } from "../native/bridge";

const tabs = [{ key: "settings", label: "设置" }] as const;

export function MePage() {
  const navigate = useNavigate();
  const me = useQuery({ queryKey: ["me"], queryFn: mobileApi.me });
  const [theme, setTheme] = useState<ThemeMode>(() => (window.localStorage.getItem("liuli.mobile.theme") as ThemeMode) || "system");
  const [server, setServer] = useState("");
  const [passwordOpen, setPasswordOpen] = useState(false);
  function changeTheme(next: ThemeMode) {
    setTheme(next);
    window.localStorage.setItem("liuli.mobile.theme", next);
    document.documentElement.dataset.theme = next === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : next;
    nativeBridge.setTheme(next);
  }
  function logout() {
    window.localStorage.removeItem(tokenStorageKey);
    nativeBridge.logout();
    navigate("/login", { replace: true });
  }
  return <MobilePageFrame navigation={<SecondaryNavigation items={tabs} activeKey="settings" onChange={() => undefined} />}>{me.isLoading ? <LoadingState /> : me.isError ? <ErrorState onRetry={() => void me.refetch()} /> : <div className="page-stack settings-list"><SectionCard><div className="profile-row"><div className="profile-avatar"><UserRound /></div><div><strong>{me.data?.username}</strong><span>个人投资账户</span></div></div></SectionCard><SectionCard title="外观"><div className="segmented">{(["light", "dark", "system"] as ThemeMode[]).map((mode) => <button className={theme === mode ? "is-active" : ""} key={mode} onClick={() => changeTheme(mode)}>{mode === "light" ? <Sun size={16} /> : mode === "dark" ? <Moon size={16} /> : null}{mode === "light" ? "浅色" : mode === "dark" ? "深色" : "跟随系统"}</button>)}</div></SectionCard><SectionCard title="应用"><button className="settings-row" onClick={() => navigate("/reports")}><span>报告中心</span><ChevronRight /></button><button className="settings-row" onClick={() => setPasswordOpen(true)}><span>修改密码</span><ChevronRight /></button><div className="settings-row settings-row--form"><Server size={18} /><input value={server} onChange={(event) => setServer(event.target.value)} placeholder="修改服务器地址" /><button disabled={!server.trim()} onClick={() => nativeBridge.setServer(server.trim())}>保存</button></div></SectionCard><button type="button" className="logout-button" onClick={logout}><LogOut size={18} />退出登录</button><p className="version-text">琉璃 Android H5 · 0.1.0</p></div>}{passwordOpen ? <PasswordSheet onClose={() => setPasswordOpen(false)} /> : null}</MobilePageFrame>;
}

function PasswordSheet({ onClose }: { onClose: () => void }) {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const mutation = useMutation({ mutationFn: () => mobileApi.changePassword(oldPassword, newPassword), onSuccess: onClose });
  return <div className="sheet-backdrop"><section className="composer-sheet"><header><strong>修改密码</strong><button onClick={onClose}>关闭</button></header><input type="password" value={oldPassword} onChange={(event) => setOldPassword(event.target.value)} placeholder="原密码" /><input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="新密码" /><button className="primary-button" disabled={!oldPassword || !newPassword || mutation.isPending} onClick={() => mutation.mutate()}>确认修改</button></section></div>;
}
