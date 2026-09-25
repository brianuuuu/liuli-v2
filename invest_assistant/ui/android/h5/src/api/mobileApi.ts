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
  PendingReport,
  PortfolioOverview,
  PortfolioValuePoint,
  Report,
  SourceItem,
  StockDashboard,
  StockDetail,
  StockMaterial,
  StockMaterialDetail,
  StockOption,
  StockPoolItem,
  Tag,
  TagHeat,
  TrackDashboard,
  TrackDetail,
  TrackListItem,
  TrackMaterial,
  TrackMaterialDetail,
  TrackOption,
  UserMe,
  WorkbenchToday
} from "../types/api";

export type NoteWrite = {
  content: string;
  group_id?: number | null;
  tag_ids?: number[];
  status?: string;
};

export type MarketRankingType = "all" | "track" | "stock";
export type MarketRankingWindow = "24h" | "7d" | "30d";

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
  marketRankings: (type: MarketRankingType = "all", window: MarketRankingWindow = "7d") =>
    apiClient.get<TagHeat[]>("/api/market-radar/rankings", { type, window }),
  workbenchToday: () => apiClient.get<WorkbenchToday>("/api/console/workbench-today"),
  trackDashboard: () => apiClient.get<TrackDashboard>("/api/track-discovery/dashboard"),
  stockDashboard: () => apiClient.get<StockDashboard>("/api/stock-analysis/dashboard"),
  // 必须带 /detail：不带的那个路由只返回扁平的 TrackRead，没有 summary/stocks/materials
  // 移动端只显示资讯热度那一个数字和环比，不画热度曲线，明确要求后端别回 90 天序列
  trackDetail: (trackId: number) =>
    apiClient.get<TrackDetail>(`/api/track-discovery/tracks/${trackId}/detail?include_heat_trends=false`),
  // 赛道总量是十几条量级，一次取回在端上排序分档，不做分页
  trackList: (limit = 50, status?: string) =>
    apiClient.get<TrackListItem[]>("/api/track-discovery/tracks", status ? { limit, status } : { limit }),
  trackMaterials: (offset = 0, limit = 10) =>
    apiClient.get<PageDto<TrackMaterial>>("/api/track-discovery/materials", { status: "confirmed", offset, limit }),
  // 材料详情按关联记录 id 取，不是 source_item / note 的 id：同一条资讯挂到两条赛道就是两条材料。
  trackMaterialDetail: (materialId: number) =>
    apiClient.get<TrackMaterialDetail>(`/api/track-discovery/materials/${materialId}`),
  // 后端 /pool 只支持 q + limit（上限 50）+ 单个 status，没有分页，
  // 状态分组和计数在端上完成；标的池超过 50 条时需要后端补分页。
  // status 只在回收站视图传 archived：不传时后端本来就不返归档。
  stockDetail: (stockId: number) => apiClient.get<StockDetail>(`/api/stock-analysis/stocks/${stockId}/detail`),
  stockPool: (limit = 50) =>
    apiClient.get<StockPoolItem[]>("/api/stock-analysis/pool", { limit }),
  stockMaterials: (offset = 0, limit = 10) =>
    apiClient.get<PageDto<StockMaterial>>("/api/stock-analysis/materials", { status: "confirmed", offset, limit }),
  stockMaterialDetail: (materialId: number) =>
    apiClient.get<StockMaterialDetail>(`/api/stock-analysis/materials/${materialId}`),
  portfolioOverview: (portfolioId?: number | null) =>
    apiClient.get<PortfolioOverview>("/api/portfolios/overview", { portfolio_id: portfolioId }),
  portfolioSnapshots: (portfolioId?: number | null) =>
    apiClient.get<PortfolioValuePoint[]>("/api/portfolios/value-snapshots", { portfolio_id: portfolioId, days: 180 }),
  news: (query: Record<string, string | number | boolean | undefined>, signal?: AbortSignal) =>
    apiClient.get<PageDto<SourceItem>>("/api/market-radar/source-items", query, signal),
  newsDetail: (id: number) => apiClient.get<SourceItem>(`/api/market-radar/source-items/${id}`),
  noteGroups: () => apiClient.get<NoteGroup[]>("/api/knowledge/note-groups"),
  tags: () => apiClient.get<Tag[]>("/api/market-radar/tags"),
  // ungrouped 是布尔量：group_id 留空表示"不按分组过滤"，表达不了"未分组"这个收件箱。
  notes: (query: Record<string, string | number | boolean | undefined>) =>
    apiClient.get<PageDto<KnowledgeNote>>("/api/knowledge/notes", query),
  noteDetail: (id: number) => apiClient.get<KnowledgeNote>(`/api/knowledge/notes/${id}`),
  createNote: (write: NoteWrite) =>
    apiClient.post<KnowledgeNote>("/api/knowledge/notes", {
      title: null,
      content: write.content,
      note_type: "",
      group_id: write.group_id ?? null,
      tags: null,
      tag_ids: write.tag_ids ?? [],
      status: write.status ?? "active"
    }),
  updateNote: (id: number, write: NoteWrite) =>
    apiClient.put<KnowledgeNote>(`/api/knowledge/notes/${id}`, {
      title: null,
      content: write.content,
      note_type: "",
      group_id: write.group_id ?? null,
      tags: null,
      tag_ids: write.tag_ids ?? [],
      status: write.status ?? "active"
    }),
  archiveNote: (id: number) => apiClient.post<KnowledgeNote>(`/api/knowledge/notes/${id}/archive`),
  deleteNote: (id: number) => apiClient.delete<KnowledgeNote>(`/api/knowledge/notes/${id}`),
  createNoteGroup: (name: string, sortOrder: number) =>
    apiClient.post<NoteGroup>("/api/knowledge/note-groups", { name, sort_order: sortOrder, status: "active" }),
  reorderNoteGroups: (orderedIds: number[]) =>
    apiClient.put<NoteGroup[]>("/api/knowledge/note-groups/reorder", { ordered_ids: orderedIds }),
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
  // 待处理报告 = 知识库研究回流里「收到、可导入、还没导入」的那批，判定规则留在后端。
  pendingReports: (signal?: AbortSignal) =>
    apiClient.get<PendingReport[]>("/api/knowledge/research-feedback", { pending_import: true }, signal),
  importPendingReport: (id: number) =>
    apiClient.post<{ message?: string }>(`/api/knowledge/research-feedback/${id}/import`),
  deletePendingReport: (id: number) =>
    apiClient.delete<PendingReport>(`/api/knowledge/research-feedback/${id}`),
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
