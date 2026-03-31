// frontend/lib/api.ts
import type { ApiError } from "./types";

type Validator<T> = (value: unknown) => T;

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
    body?: unknown,
    validate?: Validator<T>,
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
      if (token) {
        // Authenticated request expired — clear session and redirect.
        this.onUnauthenticated();
        throw new ApiClientError(401, "Session expired");
      }
      // Unauthenticated 401 (e.g. wrong login credentials) — surface the server message.
      let message = "Invalid credentials";
      try {
        const err = (await res.json()) as ApiError;
        if (err.error) message = err.error;
      } catch {
        // ignore parse failure
      }
      throw new ApiClientError(401, message);
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

    const payload = (await res.json()) as unknown;
    return validate ? validate(payload) : (payload as T);
  }

  get<T>(path: string, validate?: Validator<T>): Promise<T> {
    return this.request<T>("GET", path, undefined, validate);
  }

  post<T>(path: string, body?: unknown, validate?: Validator<T>): Promise<T> {
    return this.request<T>("POST", path, body, validate);
  }

  patch<T>(path: string, body: unknown, validate?: Validator<T>): Promise<T> {
    return this.request<T>("PATCH", path, body, validate);
  }

  delete<T>(path: string, validate?: Validator<T>): Promise<T> {
    return this.request<T>("DELETE", path, undefined, validate);
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
