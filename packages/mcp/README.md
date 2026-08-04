# @aistar/mcp — AISTAR Talent OS MCP Server

A thin [Model Context Protocol](https://modelcontextprotocol.io) facade over the AISTAR REST API, so AI clients (Claude Code, Claude Desktop, etc.) can browse the **whole** Talent OS — characters, prompts, assets, jobs, clients, series/episodes/shots, campaigns, products, audience, KPI, content, live sessions, performance, the library (locations/voices/rights), and intelligence/work (tasks/ideas/competitors/notifications) — and create a small set of safe **drafts**.

## Security model (Phase 1)

- The MCP token is a normal user JWT — every call inherits that user's RBAC. Each tool notes the permission it needs; if the user lacks it, the API 403 is surfaced verbatim.
- Scopes are **read** and **draft_write** only (SRS addendum §G, Decision D8).
- There are deliberately **no** tools for approve, publish, status-advance, rollback, archive, delete, or export, and **no** link/tie-in mutation or KPI-goal writes — those are human/admin decisions. Every write targets a record's initial/draft state only.
- This is enforced twice: no such tool exists here, and the API rejects non-draft/non-initial writes from any path (e.g. `update_character_draft` on a non-draft character returns 403, which the tool surfaces verbatim).
- Finance/revenue figures on `get_dashboard`, `get_performance_overview` and `get_performance_summary` are gated **server-side** by `performance` View — the tools just pass through, so the JWT only ever sees what its role allows.

## Setup

### 1. Build

```bash
cd packages/mcp
pnpm build   # tsc -> dist/
```

### 2. Get a token

The API must be running at `http://localhost:4000` (or set `AISTAR_API_URL`).

```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"..."}'
```

Copy the JWT from the response.

> **Note:** tokens are short-lived (~15 minutes) in this phase, so you will need to refresh `AISTAR_API_TOKEN` periodically. Long-lived API keys are planned for a later phase.

### 3. Register with your MCP client

Claude Code:

```bash
claude mcp add aistar-talent-os \
  --env AISTAR_API_URL=http://localhost:4000/api \
  --env AISTAR_API_TOKEN=<your JWT> \
  -- node /absolute/path/to/aistar/packages/mcp/dist/index.js
```

Or JSON config (Claude Desktop `claude_desktop_config.json` / `.mcp.json`):

```json
{
  "mcpServers": {
    "aistar-talent-os": {
      "command": "node",
      "args": ["/absolute/path/to/aistar/packages/mcp/dist/index.js"],
      "env": {
        "AISTAR_API_URL": "http://localhost:4000/api",
        "AISTAR_API_TOKEN": "<your JWT>"
      }
    }
  }
}
```

The server fails fast with a clear error if `AISTAR_API_TOKEN` is missing.

## Configuration

| Env var | Required | Default | Description |
| --- | --- | --- | --- |
| `AISTAR_API_URL` | no | `http://localhost:4000/api` | Base URL of the REST API |
| `AISTAR_API_TOKEN` | **yes** | — | JWT from `POST /api/auth/login` |

## Tools

47 tools in total — 43 **read** and 4 **draft-write**. All list/search endpoints are paginated and return the API's list-trimmed payload; `get_*` returns full detail.

### Characters / Prompts / Assets (read)

| Tool | Maps to |
| --- | --- |
| `search_characters` `{q?, status?, page?}` | `GET /characters` |
| `get_character` `{id}` | `GET /characters/:id` |
| `list_character_versions` `{id}` | `GET /characters/:id/versions` |
| `search_prompts` `{q?, promptType?, targetPlatform?, status?, page?}` | `GET /prompts` |
| `get_prompt` `{id}` | `GET /prompts/:id` |
| `list_platforms` `{}` | `GET /platforms` |
| `search_assets` `{entityType?, entityId?, assetType?, status?, page?}` | `GET /assets` |

### Jobs / Clients (read — `job` V)

| Tool | Maps to |
| --- | --- |
| `search_jobs` `{q?, status?, type?, clientId?, priority?, ownerId?, dueBefore?, dueAfter?, page?, pageSize?}` | `GET /jobs` |
| `get_job` `{id}` | `GET /jobs/:id` |
| `list_clients` `{q?, status?}` | `GET /clients` |
| `get_client` `{id}` | `GET /clients/:id` |

### Series / Episodes / Shots (read — `episode` V)

| Tool | Maps to |
| --- | --- |
| `search_series` `{q?, status?, universe?, sortBy?, page?}` | `GET /series` |
| `get_series` `{id}` | `GET /series/:id` |
| `search_episodes` `{q?, status?, seriesId?, campaignId?, characterId?, season?, page?}` | `GET /episodes` |
| `get_episode` `{id}` | `GET /episodes/:id` |
| `list_shots` `{episodeId?, status?, camera?, characterId?, q?, page?}` | `GET /shots` |

### Campaigns / Products (read — `campaign` V, `product` V)

| Tool | Maps to |
| --- | --- |
| `search_campaigns` `{q?, status?, objective?, characterId?, productId?, ownerId?, startFrom?, startTo?, page?, pageSize?}` | `GET /campaigns` |
| `get_campaign` `{id}` | `GET /campaigns/:id` |
| `search_products` `{q?, brandId?, category?, claimRiskLevel?, status?, priceMin?, priceMax?, page?, pageSize?}` | `GET /products` |
| `get_product` `{id}` | `GET /products/:id` |
| `list_product_categories` `{status?}` | `GET /categories` |
| `list_brands` `{q?, status?}` | `GET /brands` |

### Audience (read — `setting` V)

| Tool | Maps to |
| --- | --- |
| `list_audience_segments` `{q?, status?}` | `GET /audience-segments` |
| `get_audience_segment` `{id}` | `GET /audience-segments/:id` |

### KPI (read — `setting` V for goals; `/me` any user)

| Tool | Maps to |
| --- | --- |
| `get_kpi_goals` `{roleKey?}` | `GET /kpi/goals` |
| `get_my_kpi` `{}` | `GET /kpi/me` |

### Content / Live (read — `content` V, `live` V)

| Tool | Maps to |
| --- | --- |
| `search_content` `{q?, platform?, status?, characterId?, productId?, campaignId?, episodeId?, scheduledFrom?, scheduledTo?, ownerId?, page?, pageSize?}` | `GET /content-items` |
| `list_live_sessions` `{q?, platform?, status?, characterId?, scheduledFrom?, scheduledTo?, page?, pageSize?}` | `GET /live-sessions` |

### Performance / Dashboard (read — finance figures gated by `performance` V)

| Tool | Maps to |
| --- | --- |
| `get_performance_overview` `{dateFrom?, dateTo?}` | `GET /performance/overview` |
| `get_performance_summary` `{dateFrom?, dateTo?, groupBy?}` | `GET /performance/summary` |
| `get_dashboard` `{}` | `GET /dashboard` |

### Library — Locations / Voices / Rights (read — `location` V, `voice` V, `rights` V)

| Tool | Maps to |
| --- | --- |
| `search_locations` `{q?, type?, regionStyle?, timeOfDay?, status?, page?}` | `GET /locations` |
| `get_location` `{id}` | `GET /locations/:id` |
| `list_voices` `{characterId?, q?, status?, page?}` | `GET /voices` |
| `list_rights` `{entityType?, entityId?, legalStatus?, riskLevel?, commercialUsage?, q?, page?}` | `GET /rights` |

### Intelligence & Work — Tasks / Ideas / Competitors / Notifications (read)

| Tool | Maps to |
| --- | --- |
| `search_tasks` `{assigneeId?, createdBy?, status?, priority?, entityType?, entityId?, dueBefore?, dueAfter?, q?, page?, pageSize?}` | `GET /tasks` (`task` V) |
| `list_ideas` `{q?, ideaType?, status?, createdBy?, dateFrom?, dateTo?, page?}` | `GET /ideas` (`idea` V) |
| `search_competitors` `{q?, type?, threatLevel?, watchStatus?, category?, page?}` | `GET /competitors` (`competitor` V) |
| `get_competitor` `{id}` | `GET /competitors/:id` (`competitor` V) |
| `list_notifications` `{unread?}` | `GET /notifications` (own, any user) |

### Draft-write scope (initial/draft state only)

| Tool | Maps to |
| --- | --- |
| `create_character_draft` `{nameTh, ...optional fields}` | `POST /characters` (draft) |
| `update_character_draft` `{id, ...partial fields}` | `PATCH /characters/:id` (403 if status ≠ draft) |
| `create_prompt_draft` `{name, promptType, body, targetPlatform, ...}` | `POST /prompts` (draft) |
| `add_prompt_version` `{promptId, body, targetPlatform, ...}` | `POST /prompts/:id/versions` (draft version) |
| `create_job_draft` `{title, clientId, type?, brief?, priority?, dueDate?, productIds?, characterIds?}` | `POST /jobs` — created in initial `inquiry` status; cannot advance (`job` C) |
| `create_client` `{name, contactName?, phone?, line?, email?, type?, brandId?, notes?}` | `POST /clients` (`job` C) |
| `create_audience_segment_draft` `{name, description?, ageMin?, ageMax?, gender?, interests?, platforms?, spendingPower?, region?, painPoint?}` | `POST /audience-segments` (`setting` C) |

> Deliberately **excluded** (human/admin only): every `PATCH .../status`, approve/publish/handoff, archive/unarchive, delete, CSV export/import, and all link/tie-in mutation endpoints (`POST/DELETE .../characters|products|locations|seasons`, KPI goal `PUT`, etc.). The API would 403 most of them for a normal JWT anyway, but they are simply not exposed as tools.

API errors (validation, RBAC, draft/initial-only enforcement) are returned in the tool result as `API error <status>: <message>` instead of throwing, so the AI client can read the reason and self-correct.

## Pointing at production

Everything is driven by the two env vars — no rebuild needed. Point `AISTAR_API_URL` at the deployed API and supply a real user JWT:

```bash
claude mcp add aistar-talent-os \
  --env AISTAR_API_URL=https://api-production-61ef.up.railway.app/api \
  --env AISTAR_API_TOKEN=<user JWT from POST /api/auth/login on production> \
  -- node /absolute/path/to/aistar/packages/mcp/dist/index.js
```

The JWT determines the RBAC the AI operates under, so give the MCP a user (or dedicated service account) with exactly the roles you want the AI to have — read scope everywhere, draft-write only where that user already has Create rights.
