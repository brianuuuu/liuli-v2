import { apiClient } from "./client";

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

export async function listKnowledgeNotes(): Promise<Record<string, unknown>[]> {
  const response = await apiClient.get<Record<string, unknown>[]>("/api/knowledge/notes");
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
