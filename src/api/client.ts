const WORKER_URL = import.meta.env.VITE_WORKER_URL || 'http://localhost:5000';

class ApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  setToken(token: string | null) {
    this.token = token;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const isFormData = options.body instanceof FormData;

    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string> || {}),
    };

    // Only set Content-Type for non-FormData bodies.
    // For FormData the browser must set the Content-Type automatically
    // (including the multipart boundary) — setting it manually breaks uploads.
    if (!isFormData) {
      headers['Content-Type'] = 'application/json';
    }

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${endpoint}`, { ...options, headers });
    } catch (networkError: unknown) {
      const msg = networkError instanceof Error ? networkError.message : String(networkError);
      console.error('[ClipAI API] Network error:', msg);
      throw new Error(
        `Could not reach the server. Please check your connection and try again. (${msg})`
      );
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: `Request failed (HTTP ${response.status})` }));
      throw new Error(error.message || error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint);
  }

  async post<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: body instanceof FormData ? body : (body ? JSON.stringify(body) : undefined),
    });
  }
}

export const apiClient = new ApiClient(WORKER_URL);
