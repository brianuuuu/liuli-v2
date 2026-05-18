import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { tokenStorageKey } from "../api/client";
import { AppLayout } from "../components/layout/AppLayout";
import { AlertsPage } from "../pages/alerts/AlertsPage";
import { LoginPage } from "../pages/auth/LoginPage";
import { ConsolePage } from "../pages/console/ConsolePage";
import { DashboardPage } from "../pages/dashboard/DashboardPage";
import { KnowledgePage } from "../pages/knowledge/KnowledgePage";
import { MarketRadarPage } from "../pages/market-radar/MarketRadarPage";
import { PortfolioDetailPage } from "../pages/portfolio/PortfolioDetailPage";
import { PortfolioPage } from "../pages/portfolio/PortfolioPage";
import { StockAnalysisPage } from "../pages/stock-analysis/StockAnalysisPage";
import { StockDetailPage } from "../pages/stock-analysis/StockDetailPage";
import { TrackDetailPage } from "../pages/track-discovery/TrackDetailPage";
import { TrackDiscoveryPage } from "../pages/track-discovery/TrackDiscoveryPage";

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
          <Route path="market-radar" element={<MarketRadarPage />} />
          <Route path="track-discovery" element={<TrackDiscoveryPage />} />
          <Route path="track-discovery/tracks/:id" element={<TrackDetailPage />} />
          <Route path="stock-analysis" element={<StockAnalysisPage />} />
          <Route path="stock-analysis/stocks/:id" element={<StockDetailPage />} />
          <Route path="alerts" element={<AlertsPage />} />
          <Route path="portfolio" element={<PortfolioPage />} />
          <Route path="portfolio/:id" element={<PortfolioDetailPage />} />
          <Route path="knowledge" element={<KnowledgePage />} />
          <Route path="console" element={<ConsolePage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
