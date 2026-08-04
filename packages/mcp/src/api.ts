/**
 * Thin typed fetch wrapper over the AISTAR REST API.
 *
 * The MCP server is a facade only: it never enforces business rules itself.
 * RBAC and the draft-only write policy are enforced server-side (Decision D8);
 * non-2xx responses are surfaced verbatim so the AI client can self-correct.
 */

import type { Config } from './config.js';

export type ApiResult =
  | { ok: true; data: unknown }
  | { ok: false; status: number; message: string };

/** Query params: undefined/null values are omitted. */
export type QueryParams = Record<string, string | number | undefined | null>;

export function buildQuery(params: QueryParams): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

/** Extract a human-readable message from a NestJS-style error body. */
function extractErrorMessage(body: unknown, fallback: string): string {
  if (typeof body === 'string' && body.trim() !== '') return body;
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    if (Array.isArray(b.message)) return b.message.map(String).join('; ');
    if (typeof b.message === 'string') return b.message;
    if (typeof b.error === 'string') return b.error;
    return JSON.stringify(body);
  }
  return fallback;
}

export function createApiClient(config: Config) {
  return async function apiFetch(path: string, init?: RequestInit): Promise<ApiResult> {
    const url = `${config.apiUrl}${path}`;
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${config.apiToken}`,
          'Content-Type': 'application/json',
          ...(init?.headers ?? {}),
        },
      });
    } catch (err) {
      return {
        ok: false,
        status: 0,
        message: `Could not reach the AISTAR API at ${url}: ${err instanceof Error ? err.message : String(err)}. Is the API running?`,
      };
    }

    let body: unknown = null;
    const text = await response.text();
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        message: extractErrorMessage(body, response.statusText),
      };
    }

    return { ok: true, data: body };
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
