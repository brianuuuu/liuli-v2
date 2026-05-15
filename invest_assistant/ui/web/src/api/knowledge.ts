import { apiClient } from "./client";

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
