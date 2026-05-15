import { apiClient } from "./client";

export async function listTrackTheses(): Promise<Record<string, unknown>[]> {
  const response = await apiClient.get<Record<string, unknown>[]>("/api/track-discovery/theses");
  return response.data;
}

export async function listTrackCandidates(window = "24h"): Promise<Record<string, unknown>[]> {
  const response = await apiClient.get<Record<string, unknown>[]>("/api/track-discovery/candidates", {
    params: { window }
  });
  return response.data;
}
