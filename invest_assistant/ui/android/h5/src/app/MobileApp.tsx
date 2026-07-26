import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { tokenStorageKey } from "../api/client";
import { publishNavigationState } from "../native/bridge";
import { parentPathForDetail, rootSections, sectionForPath, type SectionKey } from "./navigation";
import { LoginPage } from "../pages/LoginPage";

const DashboardPage = lazy(() => import("../pages/DashboardPage").then((module) => ({
  default: module.DashboardPage
})));
const NewsPage = lazy(() => import("../pages/NewsPage").then((module) => ({
  default: module.NewsPage
})));
const NotesPage = lazy(() => import("../pages/NotesPage").then((module) => ({
  default: module.NotesPage
})));
const TasksPage = lazy(() => import("../pages/TasksPage").then((module) => ({
  default: module.TasksPage
})));
const MePage = lazy(() => import("../pages/MePage").then((module) => ({
  default: module.MePage
})));
const AiSuggestionReviewPage = lazy(() => import("../pages/AiSuggestionReviewPage").then((module) => ({
  default: module.AiSuggestionReviewPage
})));
const NoteDetailPage = lazy(() => import("../pages/DetailPages").then((module) => ({
  default: module.NoteDetailPage
})));
const NewsDetailPage = lazy(() => import("../pages/DetailPages").then((module) => ({
  default: module.NewsDetailPage
})));
const AlertDetailPage = lazy(() => import("../pages/DetailPages").then((module) => ({
  default: module.AlertDetailPage
})));
const ReportsPage = lazy(() => import("../pages/DetailPages").then((module) => ({
  default: module.ReportsPage
})));
const ReportReaderPage = lazy(() => import("../pages/DetailPages").then((module) => ({
  default: module.ReportReaderPage
})));

function RouteFallback() {
  return (
    <div className="skeleton-list" aria-label="页面加载中">
      <i />
      <i />
      <i />
    </div>
  );
}

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
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard" element={<RequireAuth><DashboardPage /></RequireAuth>} />
          <Route path="/notes" element={<RequireAuth><NotesPage /></RequireAuth>} />
          <Route path="/notes/:id" element={<RequireAuth><NoteDetailPage /></RequireAuth>} />
          <Route path="/news" element={<RequireAuth><NewsPage /></RequireAuth>} />
          <Route path="/news/:id" element={<RequireAuth><NewsDetailPage /></RequireAuth>} />
          <Route path="/tasks" element={<RequireAuth><TasksPage /></RequireAuth>} />
          <Route path="/tasks/suggestions/:id" element={<RequireAuth><AiSuggestionReviewPage /></RequireAuth>} />
          <Route path="/tasks/alerts/:id" element={<RequireAuth><AlertDetailPage /></RequireAuth>} />
          <Route path="/me" element={<RequireAuth><MePage /></RequireAuth>} />
          <Route path="/reports" element={<RequireAuth><ReportsPage /></RequireAuth>} />
          <Route path="/reports/:id" element={<RequireAuth><ReportReaderPage /></RequireAuth>} />
          <Route path="*" element={<Navigate to={window.localStorage.getItem(tokenStorageKey) ? "/dashboard" : "/login"} replace />} />
        </Routes>
      </Suspense>
    </>
  );
}
