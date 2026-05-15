import type { Disclosure } from "../types/api";
import { apiClient } from "./client";

export async function listDisclosures(): Promise<Disclosure[]> {
  const response = await apiClient.get<Disclosure[]>("/api/disclosures");
  return response.data;
}

export async function fetchDisclosures(): Promise<unknown> {
  const response = await apiClient.post("/api/disclosures/fetch", {});
  return response.data;
}
