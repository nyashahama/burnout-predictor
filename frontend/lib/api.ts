// frontend/lib/api.ts
import type { ApiError } from "./types";

export class ApiClientError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

/**
 * ApiClient wraps fetch with:
 * - Automatic Bearer token attachment
 * - Calls onUnauthenticated on 401 (AuthContext handles redirect/refresh)
 * - JSON parse + error extraction
 */
export class ApiClient {
  constructor(
    private baseUrl: string,
    private getToken: () => string | null,
    private onUnauthenticated: () => void
  ) {}

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (res.status === 401) {
      this.onUnauthenticated();
      throw new ApiClientError(401, "Session expired");
    }

    if (!res.ok) {
      let message = res.statusText;
      try {
        const err = (await res.json()) as ApiError;
        if (err.error) message = err.error;
      } catch {
        // ignore parse failure
      }
      throw new ApiClientError(res.status, message);
    }

    if (res.status === 204) return undefined as T;

    return res.json() as Promise<T>;
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("PATCH", path, body);
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>("DELETE", path);
  }
}

/** Creates (and caches) an ApiClient with a live token getter. */
let _client: ApiClient | null = null;

export function createApiClient(
  getToken: () => string | null,
  onUnauthenticated: () => void
): ApiClient {
  _client = new ApiClient(
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080",
    getToken,
    onUnauthenticated
  );
  return _client;
}
