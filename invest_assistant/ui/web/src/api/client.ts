import axios from "axios";

import { saveRenewedAccessToken, tokenStorageKey } from "./token-renewal";

export { tokenStorageKey } from "./token-renewal";

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "",
  timeout: 30000
});

apiClient.interceptors.request.use((config) => {
  const token = window.localStorage.getItem(tokenStorageKey);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => {
    saveRenewedAccessToken(response.headers["x-access-token"], window.localStorage);
    return response;
  },
  (error) => {
    if (error.response?.status === 401 && window.location.pathname !== "/login") {
      window.localStorage.removeItem(tokenStorageKey);
      window.location.assign("/login");
    }
    return Promise.reject(error);
  }
);

/** 取后端 HTTPException 的 detail 文本，没有时用 fallback。 */
export function apiErrorDetail(error: unknown, fallback = "操作失败"): string {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof detail === "string" && detail.trim() ? detail : fallback;
}
