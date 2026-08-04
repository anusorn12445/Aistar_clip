#!/usr/bin/env node
/**
 * AISTAR Talent OS — MCP server (Phase 1).
 *
 * Thin facade over the REST API. The token inherits the user's RBAC.
 * Scopes: read + draft_write ONLY (Decision D8) — there are deliberately
 * NO tools for approve / publish / rollback / archive / delete / export,
 * and the API additionally rejects non-draft writes server-side.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { loadConfig } from './config.js';
import { createApiClient, buildQuery, type ApiResult } from './api.js';

const config = loadConfig();
const apiFetch = createApiClient(config);

const server = new McpServer({
  name: 'aistar-talent-os',
  version: '0.1.0',
});

/** Convert an ApiResult into MCP tool output; API errors are surfaced verbatim, not thrown. */
function toToolResult(result: ApiResult) {
  if (!result.ok) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `API error ${result.status}: ${result.message}`,
        },
      ],
      isError: true,
    };
  }
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(result.data, null, 2),
      },
    ],
  };
}

/** Strip undefined values so PATCH bodies only contain provided fields. */
function compact<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

// ---------------------------------------------------------------------------
// Shared field shapes
// ---------------------------------------------------------------------------

const characterFields = {
  nameEn: z.string().optional().describe('English name'),
  oneLineConcept: z.string().optional().describe('One-line character concept'),
  universe: z.string().optional().describe('Universe the character belongs to'),
  series: z.string().optional().describe('Series within the universe'),
  roleLabel: z.string().optional().describe('Role label, e.g. "Idol", "Brand ambassador"'),
  age: z.number().int().min(18).max(120).optional().describe('Age (must be >= 18)'),
  gender: z.string().optional(),
  region: z.string().optional(),
  persona: z.record(z.unknown()).optional().describe('Persona JSON object'),
  visualDna: z.record(z.unknown()).optional().describe('Visual DNA JSON object'),
  commerceProfile: z.record(z.unknown()).optional().describe('Commerce profile JSON object'),
};

// ---------------------------------------------------------------------------
// Read tools
// ---------------------------------------------------------------------------

server.registerTool(
  'search_characters',
  {
    description:
      'Search/list characters. Optional free-text query, approval status filter (draft | in_review | approved | published | archived) and page number.',
    inputSchema: {
      q: z.string().optional().describe('Free-text search query'),
      status: z.string().optional().describe('Filter by approval status, e.g. "draft"'),
      page: z.number().int().min(1).optional().describe('Page number (1-based)'),
    },
  },
  async ({ q, status, page }) =>
    toToolResult(await apiFetch(`/characters${buildQuery({ q, status, page })}`)),
);

server.registerTool(
  'get_character',
  {
    description: 'Get one character by id, including persona, visual DNA and commerce profile.',
    inputSchema: {
      id: z.string().uuid().describe('Character id (UUID)'),
    },
  },
  async ({ id }) => toToolResult(await apiFetch(`/characters/${id}`)),
);

server.registerTool(
  'list_character_versions',
  {
    description: 'List the version history of a character.',
    inputSchema: {
      id: z.string().uuid().describe('Character id (UUID)'),
    },
  },
  async ({ id }) => toToolResult(await apiFetch(`/characters/${id}/versions`)),
);

server.registerTool(
  'search_prompts',
  {
    description:
      'Search/list prompts. Optional free-text query, prompt type and target platform filters.',
    inputSchema: {
      q: z.string().optional().describe('Free-text search query (matches prompt name)'),
      promptType: z
        .string()
        .optional()
        .describe(
          'Filter by prompt type: identity | character_sheet | expression | outfit | scene | shot | negative | anti_clone',
        ),
      targetPlatform: z.string().optional().describe('Filter by target generation platform'),
      status: z.string().optional().describe('Filter by approval status, e.g. "draft"'),
      page: z.number().int().min(1).optional().describe('Page number (1-based)'),
    },
  },
  async ({ q, promptType, targetPlatform, status, page }) =>
    toToolResult(
      await apiFetch(`/prompts${buildQuery({ q, promptType, targetPlatform, status, page })}`),
    ),
);

server.registerTool(
  'get_prompt',
  {
    description: 'Get one prompt by id, including its body, negative body and versions.',
    inputSchema: {
      id: z.string().uuid().describe('Prompt id (UUID)'),
    },
  },
  async ({ id }) => toToolResult(await apiFetch(`/prompts/${id}`)),
);

server.registerTool(
  'list_platforms',
  {
    description: 'List the generation platforms known to the system (for prompt targetPlatform values).',
    inputSchema: {},
  },
  async () => toToolResult(await apiFetch('/platforms')),
);

server.registerTool(
  'search_assets',
  {
    description:
      'Search/list assets, optionally filtered by owning entity (e.g. entityType "character" + entityId), asset type or status.',
    inputSchema: {
      entityType: z.string().optional().describe('Owning entity type, e.g. "character" or "prompt"'),
      entityId: z.string().optional().describe('Owning entity id'),
      assetType: z.string().optional().describe('Filter by asset type'),
      status: z.string().optional().describe('Filter by asset status'),
      page: z.number().int().min(1).optional().describe('Page number (1-based)'),
    },
  },
  async ({ entityType, entityId, assetType, status, page }) =>
    toToolResult(
      await apiFetch(`/assets${buildQuery({ entityType, entityId, assetType, status, page })}`),
    ),
);

// ---------------------------------------------------------------------------
// Draft-write tools (server enforces draft-only writes — API errors are
// returned verbatim so the client can see why a write was rejected)
// ---------------------------------------------------------------------------

server.registerTool(
  'create_character_draft',
  {
    description:
      'Create a NEW character in draft status. Only nameTh is required. The character stays in draft until a human reviews it in the app — this tool cannot approve or publish anything.',
    inputSchema: {
      nameTh: z.string().describe('Thai name (required)'),
      ...characterFields,
    },
  },
  async (args) =>
    toToolResult(
      await apiFetch('/characters', {
        method: 'POST',
        body: JSON.stringify(compact(args)),
      }),
    ),
);

server.registerTool(
  'update_character_draft',
  {
    description:
      'Update fields of an existing DRAFT character. Only provided fields are changed. The API rejects this with 403 if the character is not in draft status.',
    inputSchema: {
      id: z.string().uuid().describe('Character id (UUID)'),
      nameTh: z.string().optional().describe('Thai name'),
      ...characterFields,
    },
  },
  async ({ id, ...fields }) =>
    toToolResult(
      await apiFetch(`/characters/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(compact(fields)),
      }),
    ),
);

server.registerTool(
  'create_prompt_draft',
  {
    description:
      'Create a NEW prompt in draft status. Use list_platforms to find valid targetPlatform values. Drafts require human review in the app before use — this tool cannot approve or publish anything.',
    inputSchema: {
      name: z.string().describe('Prompt name (required)'),
      promptType: z
        .string()
        .describe(
          'Prompt type (required): identity | character_sheet | expression | outfit | scene | shot | negative | anti_clone',
        ),
      body: z.string().describe('Prompt body text (required)'),
      negativeBody: z.string().optional().describe('Negative prompt text'),
      targetPlatform: z.string().describe('Target generation platform (required)'),
      modelName: z.string().optional().describe('Model name on the target platform'),
      modelVersion: z.string().optional().describe('Model version'),
      generationParams: z.record(z.unknown()).optional().describe('Generation parameters JSON object'),
      seed: z.string().optional().describe('Generation seed (string)'),
    },
  },
  async (args) =>
    toToolResult(
      await apiFetch('/prompts', {
        method: 'POST',
        body: JSON.stringify(compact(args)),
      }),
    ),
);

server.registerTool(
  'add_prompt_version',
  {
    description:
      'Add a new draft version to an existing prompt. The API rejects the write if versioning rules are violated — the error message is returned as-is.',
    inputSchema: {
      promptId: z.string().uuid().describe('Prompt id (UUID)'),
      body: z.string().describe('Prompt body text (required)'),
      negativeBody: z.string().optional().describe('Negative prompt text'),
      targetPlatform: z.string().describe('Target generation platform (required)'),
      modelName: z.string().optional().describe('Model name on the target platform'),
      modelVersion: z.string().optional().describe('Model version'),
      generationParams: z.record(z.unknown()).optional().describe('Generation parameters JSON object'),
      seed: z.string().optional().describe('Generation seed (string)'),
      performanceNote: z.string().optional().describe('Note on how this version performed'),
    },
  },
  async ({ promptId, ...fields }) =>
    toToolResult(
      await apiFetch(`/prompts/${promptId}/versions`, {
        method: 'POST',
        body: JSON.stringify(compact(fields)),
      }),
    ),
);

// ===========================================================================
// SYSTEM-WIDE COVERAGE (read + draft-write only — Decision D8)
//
// Everything below mirrors the conventions above: read tools GET list/detail
// endpoints and dump the API's (already list-trimmed) payload; draft-write
// tools only ever create records in their initial/draft state. There are NO
// status-advance, approve, publish, rollback, archive, delete, export, or
// link-mutation tools — those decisions stay with humans in the app, and the
// API rejects such writes from this JWT anyway (403s are surfaced verbatim).
// ===========================================================================

// ---------------------------------------------------------------------------
// Jobs & Clients (RBAC: `job` V/C)
// ---------------------------------------------------------------------------

server.registerTool(
  'search_jobs',
  {
    title: 'Search jobs',
    description:
      'Read-only, RBAC-scoped (needs `job` View). Search/list client jobs with filters: free-text q, status (inquiry | quoted | confirmed | in_production | internal_qc | delivered | revision | approved | closed | cancelled), type (image_pack | video_review | live | mixed), clientId, priority (low | normal | urgent), ownerId, dueBefore/dueAfter (ISO dates). Paginated.',
    inputSchema: {
      q: z.string().optional().describe('Free-text search query'),
      status: z.string().optional().describe('Filter by job status'),
      type: z.string().optional().describe('Filter by job type'),
      clientId: z.string().uuid().optional().describe('Filter by client id'),
      priority: z.string().optional().describe('Filter by priority: low | normal | urgent'),
      ownerId: z.string().uuid().optional().describe('Filter by owner user id'),
      dueBefore: z.string().optional().describe('Only jobs due before this ISO date'),
      dueAfter: z.string().optional().describe('Only jobs due after this ISO date'),
      page: z.number().int().min(1).optional().describe('Page number (1-based)'),
      pageSize: z.number().int().min(1).optional().describe('Items per page'),
    },
  },
  async ({ q, status, type, clientId, priority, ownerId, dueBefore, dueAfter, page, pageSize }) =>
    toToolResult(
      await apiFetch(
        `/jobs${buildQuery({ q, status, type, clientId, priority, ownerId, dueBefore, dueAfter, page, pageSize })}`,
      ),
    ),
);

server.registerTool(
  'get_job',
  {
    title: 'Get job detail',
    description:
      'Read-only, RBAC-scoped (needs `job` View). Full detail of one job including linked products, characters/presenters, crew and deliverables.',
    inputSchema: { id: z.string().uuid().describe('Job id (UUID)') },
  },
  async ({ id }) => toToolResult(await apiFetch(`/jobs/${id}`)),
);

server.registerTool(
  'list_clients',
  {
    title: 'List clients',
    description:
      'Read-only, RBAC-scoped (needs `job` View). List client records, optional free-text q and status (active | archived).',
    inputSchema: {
      q: z.string().optional().describe('Free-text search query'),
      status: z.string().optional().describe('Filter by status: active | archived'),
    },
  },
  async ({ q, status }) => toToolResult(await apiFetch(`/clients${buildQuery({ q, status })}`)),
);

server.registerTool(
  'get_client',
  {
    title: 'Get client detail',
    description: 'Read-only, RBAC-scoped (needs `job` View). Detail of one client by id.',
    inputSchema: { id: z.string().uuid().describe('Client id (UUID)') },
  },
  async ({ id }) => toToolResult(await apiFetch(`/clients/${id}`)),
);

// ---------------------------------------------------------------------------
// Series / Episodes / Shots (RBAC: `episode` V/C)
// ---------------------------------------------------------------------------

server.registerTool(
  'search_series',
  {
    title: 'Search series',
    description:
      'Read-only, RBAC-scoped (needs `episode` View). Search/list series with filters: free-text q, status, universe. Paginated.',
    inputSchema: {
      q: z.string().optional().describe('Free-text search query'),
      status: z.string().optional().describe('Filter by series status'),
      universe: z.string().optional().describe('Filter by universe'),
      sortBy: z.string().optional().describe('Sort field'),
      page: z.number().int().min(1).optional().describe('Page number (1-based)'),
    },
  },
  async ({ q, status, universe, sortBy, page }) =>
    toToolResult(await apiFetch(`/series${buildQuery({ q, status, universe, sortBy, page })}`)),
);

server.registerTool(
  'get_series',
  {
    title: 'Get series detail',
    description:
      'Read-only, RBAC-scoped (needs `episode` View). Full detail of one series including seasons, cast, locations, tie-in products, audience segments and target views where the API returns them.',
    inputSchema: { id: z.string().uuid().describe('Series id (UUID)') },
  },
  async ({ id }) => toToolResult(await apiFetch(`/series/${id}`)),
);

server.registerTool(
  'search_episodes',
  {
    title: 'Search episodes',
    description:
      'Read-only, RBAC-scoped (needs `episode` View). Search/list episodes with filters: free-text q, status, seriesId, campaignId, characterId, season. Paginated.',
    inputSchema: {
      q: z.string().optional().describe('Free-text search query'),
      status: z.string().optional().describe('Filter by episode status'),
      seriesId: z.string().uuid().optional().describe('Filter by series id'),
      campaignId: z.string().uuid().optional().describe('Filter by campaign id'),
      characterId: z.string().uuid().optional().describe('Filter by character id'),
      season: z.string().optional().describe('Filter by season number'),
      page: z.number().int().min(1).optional().describe('Page number (1-based)'),
    },
  },
  async ({ q, status, seriesId, campaignId, characterId, season, page }) =>
    toToolResult(
      await apiFetch(
        `/episodes${buildQuery({ q, status, seriesId, campaignId, characterId, season, page })}`,
      ),
    ),
);

server.registerTool(
  'get_episode',
  {
    title: 'Get episode detail',
    description:
      'Read-only, RBAC-scoped (needs `episode` View). Full detail of one episode including script, linked characters/products and shots.',
    inputSchema: { id: z.string().uuid().describe('Episode id (UUID)') },
  },
  async ({ id }) => toToolResult(await apiFetch(`/episodes/${id}`)),
);

server.registerTool(
  'list_shots',
  {
    title: 'List shots',
    description:
      'Read-only, RBAC-scoped (needs `episode` View). List shots, typically filtered by episodeId; also camera, characterId, status, free-text q. Paginated.',
    inputSchema: {
      episodeId: z.string().uuid().optional().describe('Filter by episode id'),
      status: z.string().optional().describe('Filter by shot status'),
      camera: z.string().optional().describe('Filter by camera angle/type'),
      characterId: z.string().uuid().optional().describe('Filter by character id'),
      q: z.string().optional().describe('Free-text search query'),
      page: z.number().int().min(1).optional().describe('Page number (1-based)'),
    },
  },
  async ({ episodeId, status, camera, characterId, q, page }) =>
    toToolResult(
      await apiFetch(`/shots${buildQuery({ episodeId, status, camera, characterId, q, page })}`),
    ),
);

// ---------------------------------------------------------------------------
// Campaigns & Products (RBAC: `campaign` V, `product` V)
// ---------------------------------------------------------------------------

server.registerTool(
  'search_campaigns',
  {
    title: 'Search campaigns',
    description:
      'Read-only, RBAC-scoped (needs `campaign` View). Search/list campaigns with filters: free-text q, status, objective, characterId, productId, ownerId, startFrom/startTo (ISO dates). Paginated.',
    inputSchema: {
      q: z.string().optional().describe('Free-text search query'),
      status: z.string().optional().describe('Filter by campaign status'),
      objective: z.string().optional().describe('Filter by objective'),
      characterId: z.string().uuid().optional().describe('Filter by character id'),
      productId: z.string().uuid().optional().describe('Filter by product id'),
      ownerId: z.string().uuid().optional().describe('Filter by owner user id'),
      startFrom: z.string().optional().describe('Only campaigns starting on/after this ISO date'),
      startTo: z.string().optional().describe('Only campaigns starting on/before this ISO date'),
      page: z.number().int().min(1).optional().describe('Page number (1-based)'),
      pageSize: z.number().int().min(1).optional().describe('Items per page'),
    },
  },
  async ({ q, status, objective, characterId, productId, ownerId, startFrom, startTo, page, pageSize }) =>
    toToolResult(
      await apiFetch(
        `/campaigns${buildQuery({ q, status, objective, characterId, productId, ownerId, startFrom, startTo, page, pageSize })}`,
      ),
    ),
);

server.registerTool(
  'get_campaign',
  {
    title: 'Get campaign detail',
    description:
      'Read-only, RBAC-scoped (needs `campaign` View). Full detail of one campaign including linked characters and products.',
    inputSchema: { id: z.string().uuid().describe('Campaign id (UUID)') },
  },
  async ({ id }) => toToolResult(await apiFetch(`/campaigns/${id}`)),
);

server.registerTool(
  'search_products',
  {
    title: 'Search products',
    description:
      'Read-only, RBAC-scoped (needs `product` View). Search/list products with filters: free-text q, brandId, category, claimRiskLevel, status (active | paused | discontinued), priceMin/priceMax. Paginated.',
    inputSchema: {
      q: z.string().optional().describe('Free-text search query'),
      brandId: z.string().uuid().optional().describe('Filter by brand id'),
      category: z.string().optional().describe('Filter by category slug/id'),
      claimRiskLevel: z.string().optional().describe('Filter by claim risk level'),
      status: z.string().optional().describe('Filter by status: active | paused | discontinued'),
      priceMin: z.number().optional().describe('Minimum price'),
      priceMax: z.number().optional().describe('Maximum price'),
      page: z.number().int().min(1).optional().describe('Page number (1-based)'),
      pageSize: z.number().int().min(1).optional().describe('Items per page'),
    },
  },
  async ({ q, brandId, category, claimRiskLevel, status, priceMin, priceMax, page, pageSize }) =>
    toToolResult(
      await apiFetch(
        `/products${buildQuery({ q, brandId, category, claimRiskLevel, status, priceMin, priceMax, page, pageSize })}`,
      ),
    ),
);

server.registerTool(
  'get_product',
  {
    title: 'Get product detail',
    description:
      'Read-only, RBAC-scoped (needs `product` View). Full detail of one product including brand, category and claim/compliance info.',
    inputSchema: { id: z.string().uuid().describe('Product id (UUID)') },
  },
  async ({ id }) => toToolResult(await apiFetch(`/products/${id}`)),
);

server.registerTool(
  'list_product_categories',
  {
    title: 'List product categories',
    description:
      'Read-only, RBAC-scoped (needs `product` View). List the product category taxonomy. Optional status filter.',
    inputSchema: { status: z.string().optional().describe('Filter by status') },
  },
  async ({ status }) => toToolResult(await apiFetch(`/categories${buildQuery({ status })}`)),
);

server.registerTool(
  'list_brands',
  {
    title: 'List brands',
    description:
      'Read-only, RBAC-scoped (needs `product` View). List brands, optional free-text q and status.',
    inputSchema: {
      q: z.string().optional().describe('Free-text search query'),
      status: z.string().optional().describe('Filter by status'),
    },
  },
  async ({ q, status }) => toToolResult(await apiFetch(`/brands${buildQuery({ q, status })}`)),
);

// ---------------------------------------------------------------------------
// Audience segments (RBAC: `setting` V/C — taxonomy lives under Settings)
// ---------------------------------------------------------------------------

server.registerTool(
  'list_audience_segments',
  {
    title: 'List audience segments',
    description:
      'Read-only, RBAC-scoped (needs `setting` View). List audience segments, optional free-text q and status (active | archived).',
    inputSchema: {
      q: z.string().optional().describe('Free-text search query'),
      status: z.string().optional().describe('Filter by status: active | archived'),
    },
  },
  async ({ q, status }) =>
    toToolResult(await apiFetch(`/audience-segments${buildQuery({ q, status })}`)),
);

server.registerTool(
  'get_audience_segment',
  {
    title: 'Get audience segment detail',
    description:
      'Read-only, RBAC-scoped (needs `setting` View). Full detail of one audience segment, including which characters/series reference it where the API returns them.',
    inputSchema: { id: z.string().uuid().describe('Audience segment id (UUID)') },
  },
  async ({ id }) => toToolResult(await apiFetch(`/audience-segments/${id}`)),
);

// ---------------------------------------------------------------------------
// KPI (RBAC: `setting` V for goals; /me is any logged-in user)
// ---------------------------------------------------------------------------

server.registerTool(
  'get_kpi_goals',
  {
    title: 'Get KPI goals for a role',
    description:
      'Read-only, RBAC-scoped (needs `setting` View). Team KPI goals for a role, with actuals. roleKey defaults to "creator".',
    inputSchema: {
      roleKey: z.string().optional().describe('Role key, e.g. "creator" (default), "manager"'),
    },
  },
  async ({ roleKey }) => toToolResult(await apiFetch(`/kpi/goals${buildQuery({ roleKey })}`)),
);

server.registerTool(
  'get_my_kpi',
  {
    title: 'Get my KPI',
    description:
      "Read-only. The current user's own KPI goals and actuals (any logged-in user; no extra permission needed).",
    inputSchema: {},
  },
  async () => toToolResult(await apiFetch('/kpi/me')),
);

// ---------------------------------------------------------------------------
// Content & Live (RBAC: `content` V, `live` V)
// ---------------------------------------------------------------------------

server.registerTool(
  'search_content',
  {
    title: 'Search content items',
    description:
      'Read-only, RBAC-scoped (needs `content` View). Search/list content items with filters: free-text q, platform, status, characterId, productId, campaignId, episodeId, scheduledFrom/scheduledTo (ISO dates), ownerId. Paginated.',
    inputSchema: {
      q: z.string().optional().describe('Free-text search query'),
      platform: z.string().optional().describe('Filter by publishing platform'),
      status: z.string().optional().describe('Filter by content status'),
      characterId: z.string().uuid().optional().describe('Filter by character id'),
      productId: z.string().uuid().optional().describe('Filter by product id'),
      campaignId: z.string().uuid().optional().describe('Filter by campaign id'),
      episodeId: z.string().uuid().optional().describe('Filter by episode id'),
      scheduledFrom: z.string().optional().describe('Scheduled on/after this ISO date'),
      scheduledTo: z.string().optional().describe('Scheduled on/before this ISO date'),
      ownerId: z.string().uuid().optional().describe('Filter by owner user id'),
      page: z.number().int().min(1).optional().describe('Page number (1-based)'),
      pageSize: z.number().int().min(1).optional().describe('Items per page'),
    },
  },
  async ({ q, platform, status, characterId, productId, campaignId, episodeId, scheduledFrom, scheduledTo, ownerId, page, pageSize }) =>
    toToolResult(
      await apiFetch(
        `/content-items${buildQuery({ q, platform, status, characterId, productId, campaignId, episodeId, scheduledFrom, scheduledTo, ownerId, page, pageSize })}`,
      ),
    ),
);

server.registerTool(
  'list_live_sessions',
  {
    title: 'List live sessions',
    description:
      'Read-only, RBAC-scoped (needs `live` View). List live shopping sessions with filters: free-text q, platform, status, characterId, scheduledFrom/scheduledTo (ISO dates). Paginated.',
    inputSchema: {
      q: z.string().optional().describe('Free-text search query'),
      platform: z.string().optional().describe('Filter by platform'),
      status: z.string().optional().describe('Filter by live status'),
      characterId: z.string().uuid().optional().describe('Filter by character id'),
      scheduledFrom: z.string().optional().describe('Scheduled on/after this ISO date'),
      scheduledTo: z.string().optional().describe('Scheduled on/before this ISO date'),
      page: z.number().int().min(1).optional().describe('Page number (1-based)'),
      pageSize: z.number().int().min(1).optional().describe('Items per page'),
    },
  },
  async ({ q, platform, status, characterId, scheduledFrom, scheduledTo, page, pageSize }) =>
    toToolResult(
      await apiFetch(
        `/live-sessions${buildQuery({ q, platform, status, characterId, scheduledFrom, scheduledTo, page, pageSize })}`,
      ),
    ),
);

// ---------------------------------------------------------------------------
// Performance & Dashboard (RBAC: `performance` V; finance figures are gated
// server-side by that same permission, so this JWT sees exactly what it may)
// ---------------------------------------------------------------------------

server.registerTool(
  'get_performance_overview',
  {
    title: 'Get performance overview',
    description:
      'Read-only, RBAC-scoped (needs `performance` View). Aggregated performance overview for an optional date window (dateFrom/dateTo, ISO dates). Finance figures are gated server-side by the same permission.',
    inputSchema: {
      dateFrom: z.string().optional().describe('Window start (ISO date)'),
      dateTo: z.string().optional().describe('Window end (ISO date)'),
    },
  },
  async ({ dateFrom, dateTo }) =>
    toToolResult(await apiFetch(`/performance/overview${buildQuery({ dateFrom, dateTo })}`)),
);

server.registerTool(
  'get_performance_summary',
  {
    title: 'Get performance summary',
    description:
      'Read-only, RBAC-scoped (needs `performance` View). Insight-engine summary grouped by an optional dimension (groupBy) over an optional date window (dateFrom/dateTo, ISO dates).',
    inputSchema: {
      dateFrom: z.string().optional().describe('Window start (ISO date)'),
      dateTo: z.string().optional().describe('Window end (ISO date)'),
      groupBy: z.string().optional().describe('Group-by dimension, e.g. "platform", "character"'),
    },
  },
  async ({ dateFrom, dateTo, groupBy }) =>
    toToolResult(await apiFetch(`/performance/summary${buildQuery({ dateFrom, dateTo, groupBy })}`)),
);

server.registerTool(
  'get_dashboard',
  {
    title: 'Get dashboard overview',
    description:
      'Read-only. The aggregated home dashboard for the current user. Any logged-in user can open it; finance/revenue figures are gated server-side by `performance` View, so the response contains only what this JWT is allowed to see.',
    inputSchema: {},
  },
  async () => toToolResult(await apiFetch('/dashboard')),
);

// ---------------------------------------------------------------------------
// Library — Locations / Voices / Rights (RBAC: `location` V, `voice` V, `rights` V)
// ---------------------------------------------------------------------------

server.registerTool(
  'search_locations',
  {
    title: 'Search locations',
    description:
      'Read-only, RBAC-scoped (needs `location` View). Search/list library locations with filters: free-text q, type, regionStyle, timeOfDay, status. Paginated.',
    inputSchema: {
      q: z.string().optional().describe('Free-text search query'),
      type: z.string().optional().describe('Filter by location type'),
      regionStyle: z.string().optional().describe('Filter by region style'),
      timeOfDay: z.string().optional().describe('Filter by time of day'),
      status: z.string().optional().describe('Filter by status'),
      page: z.number().int().min(1).optional().describe('Page number (1-based)'),
    },
  },
  async ({ q, type, regionStyle, timeOfDay, status, page }) =>
    toToolResult(
      await apiFetch(`/locations${buildQuery({ q, type, regionStyle, timeOfDay, status, page })}`),
    ),
);

server.registerTool(
  'get_location',
  {
    title: 'Get location detail',
    description: 'Read-only, RBAC-scoped (needs `location` View). Full detail of one location by id.',
    inputSchema: { id: z.string().uuid().describe('Location id (UUID)') },
  },
  async ({ id }) => toToolResult(await apiFetch(`/locations/${id}`)),
);

server.registerTool(
  'list_voices',
  {
    title: 'List voices',
    description:
      'Read-only, RBAC-scoped (needs `voice` View). List voice profiles, optionally filtered by characterId, free-text q and status (draft | approved | archived).',
    inputSchema: {
      characterId: z.string().uuid().optional().describe('Filter by character id'),
      q: z.string().optional().describe('Free-text search query'),
      status: z.string().optional().describe('Filter by status: draft | approved | archived'),
      page: z.number().int().min(1).optional().describe('Page number (1-based)'),
    },
  },
  async ({ characterId, q, status, page }) =>
    toToolResult(await apiFetch(`/voices${buildQuery({ characterId, q, status, page })}`)),
);

server.registerTool(
  'list_rights',
  {
    title: 'List rights / legal records',
    description:
      'Read-only, RBAC-scoped (needs `rights` View). List rights/legal records with filters: entityType + entityId (the owning entity), legalStatus, riskLevel, commercialUsage (true/false), free-text q. Paginated.',
    inputSchema: {
      entityType: z.string().optional().describe('Owning entity type, e.g. "character"'),
      entityId: z.string().optional().describe('Owning entity id'),
      legalStatus: z.string().optional().describe('Filter by legal status'),
      riskLevel: z.string().optional().describe('Filter by risk level'),
      commercialUsage: z.boolean().optional().describe('Filter by commercial-usage flag'),
      q: z.string().optional().describe('Free-text search query'),
      page: z.number().int().min(1).optional().describe('Page number (1-based)'),
    },
  },
  async ({ entityType, entityId, legalStatus, riskLevel, commercialUsage, q, page }) =>
    toToolResult(
      await apiFetch(
        `/rights${buildQuery({ entityType, entityId, legalStatus, riskLevel, commercialUsage: commercialUsage === undefined ? undefined : String(commercialUsage), q, page })}`,
      ),
    ),
);

// ---------------------------------------------------------------------------
// Intelligence & Work — Tasks / Ideas / Competitors
// (RBAC: `task` V, `idea` V, `competitor` V)
// ---------------------------------------------------------------------------

server.registerTool(
  'search_tasks',
  {
    title: 'Search tasks (My Work)',
    description:
      'Read-only, RBAC-scoped (needs `task` View). Search/list tasks with filters: assigneeId, createdBy, status, priority, entityType + entityId (the linked record), dueBefore/dueAfter (ISO dates), free-text q. Paginated.',
    inputSchema: {
      assigneeId: z.string().uuid().optional().describe('Filter by assignee user id'),
      createdBy: z.string().uuid().optional().describe('Filter by creator user id'),
      status: z.string().optional().describe('Filter by task status'),
      priority: z.string().optional().describe('Filter by task priority'),
      entityType: z.string().optional().describe('Filter by linked entity type'),
      entityId: z.string().optional().describe('Filter by linked entity id'),
      dueBefore: z.string().optional().describe('Only tasks due before this ISO date'),
      dueAfter: z.string().optional().describe('Only tasks due after this ISO date'),
      q: z.string().optional().describe('Free-text search query'),
      page: z.number().int().min(1).optional().describe('Page number (1-based)'),
      pageSize: z.number().int().min(1).optional().describe('Items per page'),
    },
  },
  async ({ assigneeId, createdBy, status, priority, entityType, entityId, dueBefore, dueAfter, q, page, pageSize }) =>
    toToolResult(
      await apiFetch(
        `/tasks${buildQuery({ assigneeId, createdBy, status, priority, entityType, entityId, dueBefore, dueAfter, q, page, pageSize })}`,
      ),
    ),
);

server.registerTool(
  'list_ideas',
  {
    title: 'List ideas',
    description:
      'Read-only, RBAC-scoped (needs `idea` View). List ideas from the idea board with filters: free-text q, ideaType, status, createdBy, dateFrom/dateTo (ISO dates). Paginated.',
    inputSchema: {
      q: z.string().optional().describe('Free-text search query'),
      ideaType: z.string().optional().describe('Filter by idea type'),
      status: z.string().optional().describe('Filter by idea status'),
      createdBy: z.string().uuid().optional().describe('Filter by creator user id'),
      dateFrom: z.string().optional().describe('Created on/after this ISO date'),
      dateTo: z.string().optional().describe('Created on/before this ISO date'),
      page: z.number().int().min(1).optional().describe('Page number (1-based)'),
    },
  },
  async ({ q, ideaType, status, createdBy, dateFrom, dateTo, page }) =>
    toToolResult(
      await apiFetch(`/ideas${buildQuery({ q, ideaType, status, createdBy, dateFrom, dateTo, page })}`),
    ),
);

server.registerTool(
  'search_competitors',
  {
    title: 'Search competitors',
    description:
      'Read-only, RBAC-scoped (needs `competitor` View). Search/list competitors with filters: free-text q, type, threatLevel, watchStatus, category. Paginated.',
    inputSchema: {
      q: z.string().optional().describe('Free-text search query'),
      type: z.string().optional().describe('Filter by competitor type'),
      threatLevel: z.string().optional().describe('Filter by threat level'),
      watchStatus: z.string().optional().describe('Filter by watch status'),
      category: z.string().optional().describe('Filter by category'),
      page: z.number().int().min(1).optional().describe('Page number (1-based)'),
    },
  },
  async ({ q, type, threatLevel, watchStatus, category, page }) =>
    toToolResult(
      await apiFetch(`/competitors${buildQuery({ q, type, threatLevel, watchStatus, category, page })}`),
    ),
);

server.registerTool(
  'get_competitor',
  {
    title: 'Get competitor detail',
    description:
      'Read-only, RBAC-scoped (needs `competitor` View). Full detail of one competitor including channels, tracked contents and insights.',
    inputSchema: { id: z.string().uuid().describe('Competitor id (UUID)') },
  },
  async ({ id }) => toToolResult(await apiFetch(`/competitors/${id}`)),
);

server.registerTool(
  'list_notifications',
  {
    title: 'List my notifications',
    description:
      "Read-only. The current user's own notifications (any logged-in user). Set unread=true to return only unread items.",
    inputSchema: {
      unread: z.boolean().optional().describe('Return only unread notifications when true'),
    },
  },
  async ({ unread }) =>
    toToolResult(await apiFetch(`/notifications${buildQuery({ unread: unread ? '1' : undefined })}`)),
);

// ---------------------------------------------------------------------------
// Draft / initial-state writes (server enforces initial-state-only; the API
// error is returned verbatim so the client can see why a write was rejected).
// NONE of these advance status, approve, publish, link, or delete anything.
// ---------------------------------------------------------------------------

server.registerTool(
  'create_job_draft',
  {
    title: 'Create job draft (inquiry)',
    description:
      'Create a NEW client job in its initial `inquiry` status (needs `job` Create). title + clientId are required; optional type (image_pack | video_review | live | mixed), brief, priority, dueDate, and productIds/characterIds to link at creation. This tool cannot move a job past inquiry — status changes stay with humans in the app.',
    inputSchema: {
      title: z.string().describe('Job title (required)'),
      clientId: z.string().uuid().describe('Client id (required)'),
      type: z.string().optional().describe('Job type: image_pack | video_review | live | mixed'),
      brief: z.string().optional().describe('Job brief / description'),
      priority: z.string().optional().describe('Priority: low | normal | urgent'),
      dueDate: z.string().optional().describe('Due date (ISO date)'),
      productIds: z.array(z.string().uuid()).optional().describe('Product ids to link'),
      characterIds: z.array(z.string().uuid()).optional().describe('Character ids to link'),
    },
  },
  async (args) =>
    toToolResult(
      await apiFetch('/jobs', { method: 'POST', body: JSON.stringify(compact(args)) }),
    ),
);

server.registerTool(
  'create_client',
  {
    title: 'Create client',
    description:
      'Create a NEW client record (needs `job` Create). Only name is required; optional contactName, phone, line, email, type (brand | agency | shop | individual), brandId, notes. Low-risk catalog write — no status/approval workflow.',
    inputSchema: {
      name: z.string().describe('Client name (required)'),
      contactName: z.string().optional().describe('Primary contact name'),
      phone: z.string().optional().describe('Phone number'),
      line: z.string().optional().describe('LINE id'),
      email: z.string().optional().describe('Contact email'),
      type: z.string().optional().describe('Client type: brand | agency | shop | individual'),
      brandId: z.string().uuid().optional().describe('Associated brand id'),
      notes: z.string().optional().describe('Free-text notes'),
    },
  },
  async (args) =>
    toToolResult(
      await apiFetch('/clients', { method: 'POST', body: JSON.stringify(compact(args)) }),
    ),
);

server.registerTool(
  'create_audience_segment_draft',
  {
    title: 'Create audience segment',
    description:
      'Create a NEW audience segment (needs `setting` Create). Only name (1-80 chars) is required; optional description, ageMin/ageMax (0-120), gender (any | female | male | mixed), interests[], platforms[], spendingPower (low | medium | high), region, painPoint. Catalog write — created active with no approval step; humans manage lifecycle in the app.',
    inputSchema: {
      name: z.string().describe('Segment name, 1-80 chars (required)'),
      description: z.string().optional().describe('Segment description'),
      ageMin: z.number().int().min(0).max(120).optional().describe('Minimum age (0-120)'),
      ageMax: z.number().int().min(0).max(120).optional().describe('Maximum age (0-120)'),
      gender: z.string().optional().describe('Gender: any | female | male | mixed'),
      interests: z.array(z.string()).optional().describe('Interest tags (max 40)'),
      platforms: z.array(z.string()).optional().describe('Preferred platforms (max 40)'),
      spendingPower: z.string().optional().describe('Spending power: low | medium | high'),
      region: z.string().optional().describe('Region'),
      painPoint: z.string().optional().describe('Primary pain point'),
    },
  },
  async (args) =>
    toToolResult(
      await apiFetch('/audience-segments', { method: 'POST', body: JSON.stringify(compact(args)) }),
    ),
);

// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`aistar-talent-os MCP server running (API: ${config.apiUrl})`);
}

main().catch((err) => {
  console.error('Fatal error starting aistar-talent-os MCP server:', err);
  process.exit(1);
});
