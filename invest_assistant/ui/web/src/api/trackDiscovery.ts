import type {
  StockTrackRelation,
  TagBinding,
  Track,
  TrackAnalysisSnapshot,
  TrackMaterial
} from "../types/api";
import { apiClient } from "./client";

export type TrackPayload = {
  name: string;
  description?: string | null;
  status?: string;
  track_score?: number | null;
  current_view?: string | null;
  stage?: string | null;
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

export type TrackAnalysisSnapshotPayload = {
  analysis_date: string;
  market_space?: string | null;
  market_size?: string | null;
  growth_rate?: string | null;
  heat_summary?: string | null;
  ai_summary?: string | null;
  opportunity_points?: string | null;
  risk_points?: string | null;
  watch_signals?: string | null;
  score?: number | null;
  confidence_level?: string | null;
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

export async function listTracks(status?: string): Promise<Track[]> {
  const response = await apiClient.get<Track[]>("/api/track-discovery/tracks", {
    params: status ? { status } : undefined
  });
  return response.data;
}

export async function createTrack(payload: TrackPayload): Promise<Track> {
  const response = await apiClient.post<Track>("/api/track-discovery/tracks", payload);
  return response.data;
}

export async function getTrack(trackId: number): Promise<Track> {
  const response = await apiClient.get<Track>(`/api/track-discovery/tracks/${trackId}`);
  return response.data;
}

export async function updateTrack(trackId: number, payload: Partial<TrackPayload>): Promise<Track> {
  const response = await apiClient.put<Track>(`/api/track-discovery/tracks/${trackId}`, payload);
  return response.data;
}

export async function deleteTrack(trackId: number): Promise<void> {
  await apiClient.delete(`/api/track-discovery/tracks/${trackId}`);
}

export async function changeTrackStatus(trackId: number, newStatus: string, reason?: string | null, newStage?: string | null): Promise<Track> {
  const response = await apiClient.post<Track>(`/api/track-discovery/tracks/${trackId}/status`, {
    new_status: newStatus,
    new_stage: newStage || null,
    reason: reason || null,
    changed_by: "manual"
  });
  return response.data;
}

export async function listTrackMaterials(trackId: number): Promise<TrackMaterial[]> {
  const response = await apiClient.get<TrackMaterial[]>(`/api/track-discovery/tracks/${trackId}/materials`);
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

export async function listTrackAnalysisSnapshots(trackId: number): Promise<TrackAnalysisSnapshot[]> {
  const response = await apiClient.get<TrackAnalysisSnapshot[]>(`/api/track-discovery/tracks/${trackId}/analysis-snapshots`);
  return response.data;
}

export async function createTrackAnalysisSnapshot(trackId: number, payload: TrackAnalysisSnapshotPayload): Promise<TrackAnalysisSnapshot> {
  const response = await apiClient.post<TrackAnalysisSnapshot>(`/api/track-discovery/tracks/${trackId}/analysis-snapshots`, payload);
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
