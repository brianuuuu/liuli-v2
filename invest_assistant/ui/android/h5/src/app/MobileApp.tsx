import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState, type ReactNode } from "react";
import { tokenStorageKey } from "../api/client";
import { publishNavigationState } from "../native/bridge";
import { parentPathForDetail, rootSections, sectionForPath, type SectionKey } from "./navigation";
import { DashboardPage } from "../pages/DashboardPage";
import { AlertDetailPage, NewsDetailPage, NoteDetailPage, ReportReaderPage, ReportsPage } from "../pages/DetailPages";
import { LoginPage } from "../pages/LoginPage";
import { MePage } from "../pages/MePage";
import { NewsPage } from "../pages/NewsPage";
import { NotesPage } from "../pages/NotesPage";
import { TasksPage } from "../pages/TasksPage";

function RequireAuth({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState(() => Boolean(window.localStorage.getItem(tokenStorageKey)));
  useEffect(() => {
    const unauthorized = () => setAuthenticated(false);
    window.addEventListener("liuli:unauthorized", unauthorized);
    return () => window.removeEventListener("liuli:unauthorized", unauthorized);
  }, []);
  return authenticated ? children : <Navigate to="/login" replace />;
}

function NativeRouteSync() {
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const isLogin = location.pathname === "/login";
    const isReportReader = /^\/reports\/\d+$/.test(location.pathname);
    publishNavigationState(
      sectionForPath(location.pathname),
      !isLogin && !isReportReader,
      parentPathForDetail(location.pathname) !== null
    );
  }, [location.pathname]);
  useEffect(() => {
    const navigateFromNative = (event: Event) => {
      const section = (event as CustomEvent<{ section?: SectionKey }>).detail?.section;
      const target = rootSections.find((item) => item.key === section);
      if (target) navigate(target.path, { replace: true });
    };
    const backFromNative = () => {
      const fallback = parentPathForDetail(location.pathname);
      if (!fallback) return;
      const historyIndex = Number(window.history.state?.idx ?? 0);
      if (historyIndex > 0) navigate(-1);
      else navigate(fallback, { replace: true });
    };
    window.addEventListener("liuli:navigate", navigateFromNative);
    window.addEventListener("liuli:back", backFromNative);
    return () => {
      window.removeEventListener("liuli:navigate", navigateFromNative);
      window.removeEventListener("liuli:back", backFromNative);
    };
  }, [location.pathname, navigate]);
  return null;
}

export function MobileApp() {
  return (
    <>
      <NativeRouteSync />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<RequireAuth><DashboardPage /></RequireAuth>} />
        <Route path="/notes" element={<RequireAuth><NotesPage /></RequireAuth>} />
        <Route path="/notes/:id" element={<RequireAuth><NoteDetailPage /></RequireAuth>} />
        <Route path="/news" element={<RequireAuth><NewsPage /></RequireAuth>} />
        <Route path="/news/:id" element={<RequireAuth><NewsDetailPage /></RequireAuth>} />
        <Route path="/tasks" element={<RequireAuth><TasksPage /></RequireAuth>} />
        <Route path="/tasks/alerts/:id" element={<RequireAuth><AlertDetailPage /></RequireAuth>} />
        <Route path="/me" element={<RequireAuth><MePage /></RequireAuth>} />
        <Route path="/reports" element={<RequireAuth><ReportsPage /></RequireAuth>} />
        <Route path="/reports/:id" element={<RequireAuth><ReportReaderPage /></RequireAuth>} />
        <Route path="*" element={<Navigate to={window.localStorage.getItem(tokenStorageKey) ? "/dashboard" : "/login"} replace />} />
      </Routes>
    </>
  );
}
