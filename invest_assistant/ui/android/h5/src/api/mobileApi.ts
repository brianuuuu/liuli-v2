import { apiClient, tokenStorageKey } from "./client";
import type {
  AlertEvent,
  AlertStats,
  AiTagSuggestion,
  AiTagSuggestionApprove,
  AiTagSuggestionWrite,
  HotwordOption,
  KnowledgeNote,
  MarketOverview,
  NoteGroup,
  PageDto,
  PortfolioOverview,
  PortfolioValuePoint,
  Report,
  SourceItem,
  StockDashboard,
  StockOption,
  TagHeat,
  TrackDashboard,
  TrackOption,
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
  portfolioOverview: (portfolioId?: number | null) =>
    apiClient.get<PortfolioOverview>("/api/portfolios/overview", { portfolio_id: portfolioId }),
  portfolioSnapshots: (portfolioId?: number | null) =>
    apiClient.get<PortfolioValuePoint[]>("/api/portfolios/value-snapshots", { portfolio_id: portfolioId, days: 180 }),
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
  archiveNote: (id: number) => apiClient.post<KnowledgeNote>(`/api/knowledge/notes/${id}/archive`),
  deleteNote: (id: number) => apiClient.delete<KnowledgeNote>(`/api/knowledge/notes/${id}`),
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
  aiTagSuggestions: (query: { status?: string; q?: string; limit?: number; offset?: number }, signal?: AbortSignal) =>
    apiClient.get<PageDto<AiTagSuggestion>>("/api/market-radar/ai-tag-suggestions", query, signal),
  createAiTagSuggestion: (write: AiTagSuggestionWrite) =>
    apiClient.post<AiTagSuggestion>("/api/market-radar/ai-tag-suggestions", { ...write, status: "pending" }),
  approveAiTagSuggestion: (id: number, write: AiTagSuggestionApprove) =>
    apiClient.post<AiTagSuggestion>(`/api/market-radar/ai-tag-suggestions/${id}/approve`, write),
  rejectAiTagSuggestion: (id: number) =>
    apiClient.post<AiTagSuggestion>(`/api/market-radar/ai-tag-suggestions/${id}/reject`),
  restoreAiTagSuggestion: (id: number) =>
    apiClient.post<AiTagSuggestion>(`/api/market-radar/ai-tag-suggestions/${id}/restore`),
  hotwordOptions: () =>
    apiClient.get<PageDto<HotwordOption>>("/api/market-radar/hotwords", { limit: 100, offset: 0 }),
  trackOptions: () => apiClient.get<TrackOption[]>("/api/track-discovery/tracks", { limit: 50 }),
  stockOptions: (keyword: string) => apiClient.get<StockOption[]>("/api/stocks/search", { keyword }),
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
