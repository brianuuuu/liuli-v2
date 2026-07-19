import { apiClient, tokenStorageKey } from "./client";
import type {
  AlertEvent,
  AlertStats,
  KnowledgeNote,
  MarketOverview,
  NoteGroup,
  PageDto,
  PortfolioOverview,
  PortfolioValuePoint,
  Report,
  SourceItem,
  StockDashboard,
  TagHeat,
  TrackDashboard,
  UserMe,
  WorkbenchToday
} from "../types/api";

export type NoteWrite = {
  content: string;
  group_id?: number | null;
  tags?: string | null;
  status?: string;
};

export const mobileApi = {
  async login(username: string, password: string) {
    const token = await apiClient.post<{ access_token: string }>("/api/auth/login", { username, password });
    window.localStorage.setItem(tokenStorageKey, token.access_token);
    return token;
  },
  me: () => apiClient.get<UserMe>("/api/auth/me"),
  changePassword: (oldPassword: string, newPassword: string) =>
    apiClient.post("/api/auth/change-password", { old_password: oldPassword, new_password: newPassword }),
  marketOverview: () => apiClient.get<MarketOverview>("/api/market-radar/overview"),
  marketRankings: () => apiClient.get<TagHeat[]>("/api/market-radar/rankings", { type: "all", window: "24h" }),
  workbenchToday: () => apiClient.get<WorkbenchToday>("/api/console/workbench-today"),
  trackDashboard: () => apiClient.get<TrackDashboard>("/api/track-discovery/dashboard"),
  stockDashboard: () => apiClient.get<StockDashboard>("/api/stock-analysis/dashboard"),
  portfolioOverview: () => apiClient.get<PortfolioOverview>("/api/portfolios/overview"),
  portfolioSnapshots: () => apiClient.get<PortfolioValuePoint[]>("/api/portfolios/value-snapshots", { days: 90 }),
  news: (query: Record<string, string | number | boolean | undefined>, signal?: AbortSignal) =>
    apiClient.get<PageDto<SourceItem>>("/api/market-radar/source-items", query, signal),
  newsDetail: (id: number) => apiClient.get<SourceItem>(`/api/market-radar/source-items/${id}`),
  noteGroups: () => apiClient.get<NoteGroup[]>("/api/knowledge/note-groups"),
  notes: (query: Record<string, string | number | undefined>) =>
    apiClient.get<PageDto<KnowledgeNote>>("/api/knowledge/notes", query),
  noteDetail: (id: number) => apiClient.get<KnowledgeNote>(`/api/knowledge/notes/${id}`),
  createNote: (write: NoteWrite) =>
    apiClient.post<KnowledgeNote>("/api/knowledge/notes", {
      title: null,
      content: write.content,
      note_type: "",
      group_id: write.group_id ?? null,
      tags: write.tags ?? null,
      tag_ids: [],
      status: write.status ?? "active"
    }),
  updateNote: (id: number, write: NoteWrite) =>
    apiClient.put<KnowledgeNote>(`/api/knowledge/notes/${id}`, {
      title: null,
      content: write.content,
      note_type: "",
      group_id: write.group_id ?? null,
      tags: write.tags ?? null,
      tag_ids: [],
      status: write.status ?? "active"
    }),
  createNoteGroup: (name: string) =>
    apiClient.post<NoteGroup>("/api/knowledge/note-groups", { name, sort_order: 0, status: "active" }),
  updateNoteGroup: (group: NoteGroup) =>
    apiClient.put<NoteGroup>(`/api/knowledge/note-groups/${group.id}`, group),
  alerts: (offset = 0, limit = 50, signal?: AbortSignal) =>
    apiClient.get<PageDto<AlertEvent>>("/api/alerts/events", { offset, limit }, signal),
  alertStats: () => apiClient.get<AlertStats>("/api/alerts/events/stats"),
  alertDetail: (id: number) => apiClient.get<AlertEvent>(`/api/alerts/events/${id}`),
  markAlertRead: (id: number) => apiClient.post<AlertEvent>(`/api/alerts/events/${id}/read`),
  handleAlert: (id: number) => apiClient.post<AlertEvent>(`/api/alerts/events/${id}/handle`),
  reports: (offset = 0, limit = 30) =>
    apiClient.get<PageDto<Report>>("/api/reports", { offset, limit }),
  reportDetail: (id: number) => apiClient.get<Report>(`/api/reports/${id}`),
  async reportContent(id: number) {
    const token = window.localStorage.getItem(tokenStorageKey);
    const response = await fetch(`/api/reports/${id}/content`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if (!response.ok) throw new Error(`报告加载失败（${response.status}）`);
    return response.text();
  }
};
