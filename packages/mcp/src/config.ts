/**
 * Environment configuration for the AISTAR MCP server.
 *
 * AISTAR_API_URL   — base URL of the REST API (default http://localhost:4000/api)
 * AISTAR_API_TOKEN — JWT from POST /api/auth/login (required, short-lived in Phase 1)
 */

export interface Config {
  apiUrl: string;
  apiToken: string;
}

export function loadConfig(): Config {
  const apiUrl = (process.env.AISTAR_API_URL ?? 'http://localhost:4000/api').replace(/\/+$/, '');
  const apiToken = process.env.AISTAR_API_TOKEN;

  if (!apiToken) {
    // stderr only — stdout is reserved for the MCP stdio transport.
    console.error(
      'ERROR: AISTAR_API_TOKEN is not set.\n' +
        'Get a JWT via: curl -X POST http://localhost:4000/api/auth/login ' +
        `-H 'Content-Type: application/json' -d '{"email":"...","password":"..."}'\n` +
        'Then export AISTAR_API_TOKEN=<accessToken> (note: tokens are short-lived, ~15 min in this phase).',
    );
    process.exit(1);
  }

  return { apiUrl, apiToken };
}
