import { apiClient } from "./client";
import type { MarketTag } from "../types/api";
import { normalizeKnowledgeNotePage } from "./knowledgePage";

export type KnowledgeNoteGroup = {
  id: number;
  name: string;
  sort_order: number;
  status: string;
  created_at?: string | null;
  updated_at?: string | null;
};

export type KnowledgeNote = {
  id: number;
  title: string;
  content: string;
  note_type: string;
  group_id?: number | null;
  related_module?: string | null;
  related_id?: number | null;
  tags_text?: string | null;
  status: string;
  created_at?: string | null;
  updated_at?: string | null;
  group?: KnowledgeNoteGroup | null;
  tags: MarketTag[];
};

export type KnowledgeNotePayload = {
  title?: string | null;
  content: string;
  note_type: string;
  group_id?: number | null;
  related_module?: string | null;
  related_id?: number | null;
  tags?: string | null;
  tag_ids?: number[];
  status?: string;
};

export type KnowledgeNoteQuery = {
  status?: string;
  group_id?: number;
  tag_id?: number;
  q?: string;
  limit?: number;
  offset?: number;
};

export type KnowledgeNotePage = {
  items: KnowledgeNote[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
};

export type KnowledgeNoteGroupPayload = {
  name: string;
  sort_order?: number;
  status?: string;
};

export type KnowledgePrompt = {
  id: number;
  prompt_key: string;
  title: string;
  target_task: string;
  provider: string;
  model: string;
  system_prompt: string;
  user_prompt: string;
  response_format: string;
  status: string;
  created_at?: string | null;
  updated_at?: string | null;
};

export type KnowledgePromptPayload = Omit<KnowledgePrompt, "id" | "created_at" | "updated_at">;

export async function listKnowledgeNotes(params: KnowledgeNoteQuery = {}): Promise<KnowledgeNotePage> {
  const response = await apiClient.get<unknown>("/api/knowledge/notes", { params });
  return normalizeKnowledgeNotePage(response.data, params);
}

export async function createKnowledgeNote(payload: KnowledgeNotePayload): Promise<KnowledgeNote> {
  const response = await apiClient.post<KnowledgeNote>("/api/knowledge/notes", payload);
  return response.data;
}

export async function updateKnowledgeNote(id: number, payload: KnowledgeNotePayload): Promise<KnowledgeNote> {
  const response = await apiClient.put<KnowledgeNote>(`/api/knowledge/notes/${id}`, payload);
  return response.data;
}

export async function archiveKnowledgeNote(id: number): Promise<KnowledgeNote> {
  const response = await apiClient.post<KnowledgeNote>(`/api/knowledge/notes/${id}/archive`);
  return response.data;
}

export async function deleteKnowledgeNote(id: number): Promise<KnowledgeNote> {
  const response = await apiClient.delete<KnowledgeNote>(`/api/knowledge/notes/${id}`);
  return response.data;
}

export async function restoreKnowledgeNote(id: number): Promise<KnowledgeNote> {
  const response = await apiClient.post<KnowledgeNote>(`/api/knowledge/notes/${id}/restore`);
  return response.data;
}

export async function listKnowledgeNoteGroups(status = "active"): Promise<KnowledgeNoteGroup[]> {
  const response = await apiClient.get<KnowledgeNoteGroup[]>("/api/knowledge/note-groups", { params: { status } });
  return response.data;
}

export async function createKnowledgeNoteGroup(payload: KnowledgeNoteGroupPayload): Promise<KnowledgeNoteGroup> {
  const response = await apiClient.post<KnowledgeNoteGroup>("/api/knowledge/note-groups", payload);
  return response.data;
}

export async function updateKnowledgeNoteGroup(id: number, payload: KnowledgeNoteGroupPayload): Promise<KnowledgeNoteGroup> {
  const response = await apiClient.put<KnowledgeNoteGroup>(`/api/knowledge/note-groups/${id}`, payload);
  return response.data;
}

export async function archiveKnowledgeNoteGroup(id: number): Promise<KnowledgeNoteGroup> {
  const response = await apiClient.post<KnowledgeNoteGroup>(`/api/knowledge/note-groups/${id}/archive`);
  return response.data;
}

export async function listKnowledgeSkills(): Promise<Record<string, unknown>[]> {
  const response = await apiClient.get<Record<string, unknown>[]>("/api/knowledge/skills");
  return response.data;
}

export async function listKnowledgeAgents(): Promise<Record<string, unknown>[]> {
  const response = await apiClient.get<Record<string, unknown>[]>("/api/knowledge/agents");
  return response.data;
}

export async function listKnowledgeFeedbackLogs(): Promise<Record<string, unknown>[]> {
  const response = await apiClient.get<Record<string, unknown>[]>("/api/knowledge/feedback-logs");
  return response.data;
}

export async function listKnowledgePrompts(): Promise<KnowledgePrompt[]> {
  const response = await apiClient.get<KnowledgePrompt[]>("/api/knowledge/prompts");
  return response.data;
}

export async function createKnowledgePrompt(payload: KnowledgePromptPayload): Promise<KnowledgePrompt> {
  const response = await apiClient.post<KnowledgePrompt>("/api/knowledge/prompts", payload);
  return response.data;
}

export async function updateKnowledgePrompt(id: number, payload: KnowledgePromptPayload): Promise<KnowledgePrompt> {
  const response = await apiClient.put<KnowledgePrompt>(`/api/knowledge/prompts/${id}`, payload);
  return response.data;
}

export async function deleteKnowledgePrompt(id: number): Promise<KnowledgePrompt> {
  const response = await apiClient.delete<KnowledgePrompt>(`/api/knowledge/prompts/${id}`);
  return response.data;
}
