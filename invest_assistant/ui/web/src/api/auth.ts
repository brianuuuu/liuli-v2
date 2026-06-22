import type { ChangePasswordPayload, ChangePasswordResponse, TokenResponse, UserMe } from "../types/api";
import { apiClient } from "./client";

export async function login(username: string, password: string): Promise<TokenResponse> {
  const response = await apiClient.post<TokenResponse>("/api/auth/login", { username, password });
  return response.data;
}

export async function getMe(): Promise<UserMe> {
  const response = await apiClient.get<UserMe>("/api/auth/me");
  return response.data;
}

export async function changePassword(payload: ChangePasswordPayload): Promise<ChangePasswordResponse> {
  const response = await apiClient.post<ChangePasswordResponse>("/api/auth/change-password", payload);
  return response.data;
}

export async function logout(): Promise<void> {
  await apiClient.post("/api/auth/logout");
}
