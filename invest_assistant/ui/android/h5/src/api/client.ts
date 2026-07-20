export const tokenStorageKey = "liuli.mobile.auth.token";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type QueryValue = string | number | boolean | null | undefined;

function buildUrl(path: string, query?: Record<string, QueryValue>) {
  const origin = window.location.origin === "null" ? "http://localhost" : window.location.origin;
  const url = new URL(path, origin);
  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  query?: Record<string, QueryValue>,
  signal?: AbortSignal
): Promise<T> {
  const token = window.localStorage.getItem(tokenStorageKey);
  const response = await fetch(buildUrl(path, query), {
    method,
    headers: {
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal
  });

  if (response.status === 401) {
    window.localStorage.removeItem(tokenStorageKey);
    window.dispatchEvent(new CustomEvent("liuli:unauthorized"));
  }
  if (!response.ok) {
    throw new ApiError(`请求失败（${response.status}）`, response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function createApiClient() {
  return {
    get<T>(path: string, query?: Record<string, QueryValue>, signal?: AbortSignal) {
      return request<T>("GET", path, undefined, query, signal);
    },
    post<T>(path: string, body?: unknown) {
      return request<T>("POST", path, body);
    },
    put<T>(path: string, body?: unknown) {
      return request<T>("PUT", path, body);
    },
    delete<T>(path: string) {
      return request<T>("DELETE", path);
    }
  };
}

export const apiClient = createApiClient();
