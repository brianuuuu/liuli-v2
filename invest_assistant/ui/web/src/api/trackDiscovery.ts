import type {
  Track,
  TrackEvidence,
  TrackRelatedStock,
  TrackThesis,
  TrackValidationIndicator,
  StockTrackRelation
} from "../types/api";
import { apiClient } from "./client";

export type TrackThesisPayload = {
  title: string;
  core_thesis: string;
  underlying_change?: string | null;
  old_bottleneck?: string | null;
  new_solution?: string | null;
  value_chain_shift?: string | null;
  time_horizon?: string | null;
  confidence_level?: string | null;
  status?: string;
};

export type TrackPayload = {
  name: string;
  description?: string | null;
  status?: string;
};

export type TrackIndicatorPayload = {
  name: string;
  indicator_type?: string | null;
  data_source?: string | null;
  current_value?: string | null;
  direction?: string | null;
  validation_meaning?: string | null;
};

export type TrackEvidencePayload = {
  source_item_id?: number | null;
  evidence_direction: string;
  evidence_strength?: number;
  summary?: string | null;
  affected_segments?: string | null;
  related_stock_ids?: string | null;
};

export type TrackRelatedStockPayload = {
  stock_id: number;
  role?: string | null;
  relevance_score?: number;
  evidence_count?: number;
  heat_score?: number;
  status?: string;
};

export type TrackTagStockBindingPayload = {
  stock_id: number;
  relation_type?: string | null;
  conviction?: number;
  reason?: string | null;
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

export async function changeTrackStatus(trackId: number, newStatus: string, reason?: string | null): Promise<Track> {
  const response = await apiClient.post<Track>(`/api/track-discovery/tracks/${trackId}/status`, {
    new_status: newStatus,
    reason: reason || null
  });
  return response.data;
}

export async function listTrackTheses(trackId: number): Promise<TrackThesis[]> {
  const response = await apiClient.get<TrackThesis[]>(`/api/track-discovery/tracks/${trackId}/theses`);
  return response.data;
}

export async function createTrackThesis(trackId: number, payload: TrackThesisPayload): Promise<TrackThesis> {
  const response = await apiClient.post<TrackThesis>(`/api/track-discovery/tracks/${trackId}/theses`, payload);
  return response.data;
}

export async function listTrackIndicators(trackId: number): Promise<TrackValidationIndicator[]> {
  const response = await apiClient.get<TrackValidationIndicator[]>(`/api/track-discovery/tracks/${trackId}/indicators`);
  return response.data;
}

export async function createTrackIndicator(trackId: number, payload: TrackIndicatorPayload): Promise<TrackValidationIndicator> {
  const response = await apiClient.post<TrackValidationIndicator>(`/api/track-discovery/tracks/${trackId}/indicators`, payload);
  return response.data;
}

export async function listTrackEvidence(trackId: number): Promise<TrackEvidence[]> {
  const response = await apiClient.get<TrackEvidence[]>(`/api/track-discovery/tracks/${trackId}/evidence`);
  return response.data;
}

export async function createTrackEvidence(trackId: number, payload: TrackEvidencePayload): Promise<TrackEvidence> {
  const response = await apiClient.post<TrackEvidence>(`/api/track-discovery/tracks/${trackId}/evidence`, payload);
  return response.data;
}

export async function listTrackRelatedStocks(trackId: number): Promise<TrackRelatedStock[]> {
  const response = await apiClient.get<TrackRelatedStock[]>(`/api/track-discovery/tracks/${trackId}/related-stocks`);
  return response.data;
}

export async function createTrackRelatedStock(trackId: number, payload: TrackRelatedStockPayload): Promise<TrackRelatedStock> {
  const response = await apiClient.post<TrackRelatedStock>(`/api/track-discovery/tracks/${trackId}/related-stocks`, payload);
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
