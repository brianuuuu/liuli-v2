import axios from "axios";

export const tokenStorageKey = "liuli.auth.token";

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
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && window.location.pathname !== "/login") {
      window.localStorage.removeItem(tokenStorageKey);
      window.location.assign("/login");
    }
    return Promise.reject(error);
  }
);
