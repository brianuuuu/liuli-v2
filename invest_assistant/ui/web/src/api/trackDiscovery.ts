import type {
  StockTrackRelation,
  TagBinding,
  Track,
  TrackDashboard,
  TrackDetail,
  TrackTrendSnapshot,
  TrackMaterial,
  Page
} from "../types/api";
import { apiClient } from "./client";

export type TrackPayload = {
  name: string;
  description?: string | null;
  status?: string;
  current_view?: string | null;
  industry_phase?: string | null;
  market_phase?: string | null;
  confidence_level?: string | null;
};

export type TrackMaterialPayload = {
  material_type: "source_item" | "knowledge_note";
  material_id: number;
  direction?: string | null;
  importance_level?: string | null;
  status?: string;
  note?: string | null;
};

export type TrackMaterialListOptions = {
  trackId?: number;
  statuses?: string[];
  limit?: number;
  offset?: number;
};

// 综合分、评级、热度档位是后端派生的，请求体里带了也不会被采纳，所以从 payload 里排除。
export type TrackTrendSnapshotPayload = Partial<
  Omit<TrackTrendSnapshot, "id" | "track_id" | "created_at" | "overall_score" | "track_grade" | "heat_tier">
> & {
  research_date: string;
  headline_cycle: TrackTrendSnapshot["headline_cycle"];
  market_heat_score: number;
  growth_speed_score: number;
  concentration_score: number;
  cycle_resilience_score: number;
  current_market_size_score: number;
  future_market_size_score: number;
};

export type TrackTagStockBindingPayload = {
  stock_id: number;
  relation_type?: string | null;
  conviction?: number;
  reason?: string | null;
  status?: string;
};

export type TagBindingPayload = {
  name: string;
  source?: string | null;
  status?: string;
};

export type TrackListParams = {
  status?: string;
  q?: string;
  limit?: number;
};

export async function listTracks(paramsOrStatus?: TrackListParams | string): Promise<Track[]> {
  const params = typeof paramsOrStatus === "string" ? { status: paramsOrStatus } : paramsOrStatus;
  const response = await apiClient.get<Track[]>("/api/track-discovery/tracks", {
    params
  });
  return response.data;
}

export async function searchTracks(keyword: string, limit = 8): Promise<Track[]> {
  const q = keyword.trim();
  if (!q) return [];
  return listTracks({ q, limit });
}

let trackDashboardRequest: Promise<TrackDashboard> | null = null;

export async function getTrackDashboard(): Promise<TrackDashboard> {
  if (trackDashboardRequest) return trackDashboardRequest;
  trackDashboardRequest = apiClient
    .get<TrackDashboard>("/api/track-discovery/dashboard")
    .then((response) => response.data)
    .finally(() => {
      trackDashboardRequest = null;
    });
  return trackDashboardRequest;
}

export async function createTrack(payload: TrackPayload): Promise<Track> {
  const response = await apiClient.post<Track>("/api/track-discovery/tracks", payload);
  return response.data;
}

export async function getTrack(trackId: number): Promise<Track> {
  const response = await apiClient.get<Track>(`/api/track-discovery/tracks/${trackId}`);
  return response.data;
}

export async function getTrackDetail(trackId: number): Promise<TrackDetail> {
  const response = await apiClient.get<TrackDetail>(`/api/track-discovery/tracks/${trackId}/detail`);
  return response.data;
}

export async function updateTrack(trackId: number, payload: Partial<TrackPayload>): Promise<Track> {
  const response = await apiClient.put<Track>(`/api/track-discovery/tracks/${trackId}`, payload);
  return response.data;
}

export async function deleteTrack(trackId: number): Promise<void> {
  await apiClient.delete(`/api/track-discovery/tracks/${trackId}`);
}

export type TrackPhaseChange = {
  industryPhase?: string | null;
  marketPhase?: string | null;
};

export async function changeTrackStatus(trackId: number, newStatus: string, reason?: string | null, phases: TrackPhaseChange = {}): Promise<Track> {
  const response = await apiClient.post<Track>(`/api/track-discovery/tracks/${trackId}/status`, {
    new_status: newStatus,
    new_industry_phase: phases.industryPhase || null,
    new_market_phase: phases.marketPhase || null,
    reason: reason || null,
    changed_by: "manual"
  });
  return response.data;
}

function materialListParams(options: TrackMaterialListOptions = {}) {
  return {
    track_id: options.trackId,
    status: options.statuses?.join(","),
    limit: options.limit,
    offset: options.offset,
  };
}

export async function listTrackDiscoveryMaterials(options: TrackMaterialListOptions = {}): Promise<Page<TrackMaterial>> {
  const response = await apiClient.get<Page<TrackMaterial>>("/api/track-discovery/materials", {
    params: materialListParams(options)
  });
  return response.data;
}

export async function listTrackMaterials(trackId: number, options: Omit<TrackMaterialListOptions, "trackId"> = {}): Promise<Page<TrackMaterial>> {
  const response = await apiClient.get<Page<TrackMaterial>>(`/api/track-discovery/tracks/${trackId}/materials`, {
    params: materialListParams(options)
  });
  return response.data;
}

export async function createTrackMaterial(trackId: number, payload: TrackMaterialPayload): Promise<TrackMaterial> {
  const response = await apiClient.post<TrackMaterial>(`/api/track-discovery/tracks/${trackId}/materials`, payload);
  return response.data;
}

export async function updateTrackMaterial(materialId: number, payload: Partial<TrackMaterialPayload>): Promise<TrackMaterial> {
  const response = await apiClient.put<TrackMaterial>(`/api/track-discovery/tracks/materials/${materialId}`, payload);
  return response.data;
}

export async function listTrackTrendSnapshots(trackId: number): Promise<TrackTrendSnapshot[]> {
  const response = await apiClient.get<TrackTrendSnapshot[]>(`/api/track-discovery/tracks/${trackId}/trend-snapshots`);
  return response.data;
}

export async function createTrackTrendSnapshot(trackId: number, payload: TrackTrendSnapshotPayload): Promise<TrackTrendSnapshot> {
  const response = await apiClient.post<TrackTrendSnapshot>(`/api/track-discovery/tracks/${trackId}/trend-snapshots`, payload);
  return response.data;
}

export async function listStocksForTrack(trackId: number): Promise<StockTrackRelation[]> {
  const response = await apiClient.get<StockTrackRelation[]>(`/api/track-discovery/tracks/${trackId}/stocks`);
  return response.data;
}

export async function bindStockFromTrack(trackId: number, payload: TrackTagStockBindingPayload): Promise<StockTrackRelation> {
  const response = await apiClient.post<StockTrackRelation>(`/api/track-discovery/tracks/${trackId}/stocks`, payload);
  return response.data;
}

export async function listTrackTagBindings(trackId: number): Promise<TagBinding[]> {
  const response = await apiClient.get<TagBinding[]>(`/api/track-discovery/tracks/${trackId}/tags`);
  return response.data;
}

export async function bindTrackTag(trackId: number, payload: TagBindingPayload): Promise<TagBinding> {
  const response = await apiClient.post<TagBinding>(`/api/track-discovery/tracks/${trackId}/tags`, payload);
  return response.data;
}
