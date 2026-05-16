import type { Disclosure } from "../types/api";
import { apiClient } from "./client";

export type DisclosureCreate = {
  stock_id?: number | null;
  source: string;
  disclosure_type: string;
  title: string;
  publish_time?: string | null;
  report_period?: string | null;
  source_url?: string | null;
  file_path?: string | null;
  parsed_text_path?: string | null;
  parsed_markdown_path?: string | null;
  parse_status?: string;
};

export type DisclosureUpdate = Partial<DisclosureCreate>;

export async function listDisclosures(): Promise<Disclosure[]> {
  const response = await apiClient.get<Disclosure[]>("/api/disclosures");
  return response.data;
}

export async function createDisclosure(payload: DisclosureCreate): Promise<Disclosure> {
  const response = await apiClient.post<Disclosure>("/api/disclosures", payload);
  return response.data;
}

export async function updateDisclosure(disclosureId: number, payload: DisclosureUpdate): Promise<Disclosure> {
  const response = await apiClient.put<Disclosure>(`/api/disclosures/${disclosureId}`, payload);
  return response.data;
}

export async function fetchDisclosures(params: { keyword?: string; page_num?: number; page_size?: number } = {}): Promise<{ fetched: number }> {
  const response = await apiClient.post<{ fetched: number }>("/api/disclosures/fetch", null, { params });
  return response.data;
}

export async function downloadDisclosure(disclosureId: number): Promise<Disclosure> {
  const response = await apiClient.post<Disclosure>(`/api/disclosures/${disclosureId}/download`, {});
  return response.data;
}

export async function parseDisclosure(disclosureId: number): Promise<Disclosure> {
  const response = await apiClient.post<Disclosure>(`/api/disclosures/${disclosureId}/parse`, {});
  return response.data;
}

export async function getParsedDisclosure(disclosureId: number): Promise<string> {
  const response = await apiClient.get<string>(`/api/disclosures/${disclosureId}/parsed`, { responseType: "text" });
  return response.data;
}

export async function disclosureToSourceItem(disclosureId: number): Promise<unknown> {
  const response = await apiClient.post(`/api/disclosures/${disclosureId}/to-source-item`, {});
  return response.data;
}
