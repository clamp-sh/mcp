# @clamp-sh/mcp

## 1.0.0

### Major Changes

- [`c85af05`](https://github.com/clamp-sh/clamp/commit/c85af053eb33ad1167224ef93134e7861480d6c4) Thanks [@sbj-o](https://github.com/sbj-o)! - Consolidate analytics tools from 21 to 16. Five specialized tools (`pages.top`, `referrers.top`, `countries.top`, `cities.top`, `devices.top`) are removed and absorbed by `breakdown` (renamed from `traffic.breakdown`). `pages.engagement` gains a `view` parameter (`summary` | `engagement` | `sections`) — `view="summary"` returns the old `pages.top` shape, `view="sections"` returns per-section view counts for a single pathname (requires the section-views SDK extension). Every remaining tool description has been rewritten to clear the open-source MCP description-quality rubric (purpose, guidelines, limitations, parameter intent, length, examples).

  Migration:

  | Old call                          | New call                                                                 |
  | --------------------------------- | ------------------------------------------------------------------------ |
  | `pages.top`                       | `pages.engagement(view="summary")`                                       |
  | `referrers.top`                   | `breakdown(dimension="referrer_host")` (channel comes back per row)      |
  | `countries.top`                   | `breakdown(dimension="country")`                                         |
  | `cities.top(country="US")`        | `breakdown(dimension="city", country="US")` (country comes back per row) |
  | `devices.top(group_by="browser")` | `breakdown(dimension="browser")`                                         |
  | `traffic.breakdown(...)`          | `breakdown(...)`                                                         |

## 0.9.1

### Patch Changes

- [`b35ef43`](https://github.com/clamp-sh/clamp/commit/b35ef43b95cb2d5bb6f586a733b15e6666f4addc) Thanks [@sbj-o](https://github.com/sbj-o)! - Refresh `docs.search` results to cover the restructured documentation: new `/docs` Quick start landing, `/docs/skills` analytics-skills page, the five new SDK extension subpages (outbound-links, downloads, not-found, data-attributes, web-vitals), and updated descriptions noting which pages now carry pasteable agent prompts.

- [`6de9048`](https://github.com/clamp-sh/clamp/commit/6de9048577f152ac9c8e6a79fb1396dca0986b8a) Thanks [@sbj-o](https://github.com/sbj-o)! - Add the new SDK section-views extension page to `docs.search` results so agents can find it when users ask about engagement, section tracking, or which sections of a page get seen.

## 0.9.0

### Minor Changes

- [`eab36ab`](https://github.com/clamp-sh/clamp/commit/eab36abc8d41dadd27d59d6cdb1e466a0b2b181f) Thanks [@sbj-o](https://github.com/sbj-o)! - Rename all MCP tools from flat snake_case to dot-notation namespaces so they form a navigable tree in MCP directory UIs (Smithery, etc.) and group cleanly as new tools are added. Existing agent prompts or saved workflows referencing the old names will need to update.

  - `list_projects` → `projects.list`
  - `get_overview` / `get_timeseries` / `get_breakdown` / `compare_periods` / `get_current_visitors` → `traffic.overview` / `traffic.timeseries` / `traffic.breakdown` / `traffic.compare` / `traffic.live`
  - `get_top_pages` / `get_page_engagement` → `pages.top` / `pages.engagement`
  - `get_top_referrers` → `referrers.top`
  - `get_countries` / `get_cities` / `get_devices` → `countries.top` / `cities.top` / `devices.top`
  - `get_events` → `events.list`
  - `get_revenue` → `revenue.sum`
  - `get_session_paths` → `sessions.paths`
  - `create_funnel` / `get_funnel` → `funnels.create` / `funnels.get`
  - `create_alert` / `list_alerts` / `delete_alert` → `alerts.create` / `alerts.list` / `alerts.delete`
  - `search_docs` → `docs.search` (back-compat `docs_search` alias removed)

## 0.8.0

### Minor Changes

- [`30aaecd`](https://github.com/clamp-sh/clamp/commit/30aaecd13d97341b25fbc12991ca5d99e258414e) Thanks [@sbj-o](https://github.com/sbj-o)! - Added `alerts.list` and `alerts.delete` tools. Renamed `docs.search` to `docs.search` to match the consistent `verb_noun` naming used by every other tool; `docs.search` continues to work as a deprecated alias and will be removed in the next major.

## 0.7.0

### Minor Changes

- [`c460054`](https://github.com/clamp-sh/clamp/commit/c460054aab73cc82d8d786435142d41e2a0bf767) Thanks [@sbj-o](https://github.com/sbj-o)! - Revenue tracking and session-level analytics.

  **SDK** — Event properties now accept a `Money` value (`{ amount, currency }`). Attach revenue to any event and query it by source, country, campaign, or device. Public type aliases `Money`, `CurrencyCode`, `EventPropertyValue`, `EventProperties` are exported for typed event maps. The `dataAttributes` extension recognises `data-clamp-money-<key>="29.00 USD"` for markup-driven revenue tracking.

  **MCP** — Three new tools: `revenue.sum` (revenue split by currency, optionally grouped by any traffic dimension), `sessions.paths` (aggregate entry → exit paths with pages and duration per session), and `pages.engagement` (per-page engagement seconds and bounce rate). Tool descriptions tightened to eliminate overlap between `traffic.breakdown` and the specialized breakdown tools.

### Patch Changes

- [`c460054`](https://github.com/clamp-sh/clamp/commit/c460054aab73cc82d8d786435142d41e2a0bf767) Thanks [@sbj-o](https://github.com/sbj-o)! - Updated `docs.search` results to reflect the restructured documentation. New URLs cover the SDK split (tracking, server, extensions, reference), MCP split (setup, tools, prompts, examples), concepts section (events, properties, revenue, engagement, funnels), and the install guides index.

## 0.6.0

### Minor Changes

- [`0763773`](https://github.com/clamp-sh/clamp/commit/0763773d9e9c493c51670e31231fbe58d00a26c7) Thanks [@sbj-o](https://github.com/sbj-o)! - Added `projects.list` tool and optional `project_id` parameter to every data tool. The remote MCP endpoint is now `/mcp` (previously `/mcp/:projectId`) and grants access to every project in the authenticated user's account. Tools resolve automatically when you only have one project, and return a structured `project_required` error listing available projects when they need disambiguation. Stdio usage is unchanged.

## 0.5.0

### Minor Changes

- [`b7cd7b7`](https://github.com/clamp-sh/clamp/commit/b7cd7b7c3017651d9149dc3a20389c076bb326c9) Thanks [@sbj-o](https://github.com/sbj-o)! - Added four tools: `traffic.breakdown` (slice by 18 dimensions including entry/exit page, region, browser version, and all UTM fields), `traffic.compare` (a vs b metric delta), `traffic.live` (active-visitor realtime count), and `docs.search` (keyword search over the public Clamp docs). Broadened filter coverage across every read tool to accept `utm_medium`, `utm_content`, `utm_term`, `country`, `device_type`, `channel`, and `referrer_host`. All read tools now declare `readOnlyHint` so MCP clients can reason about side-effect safety.

## 0.4.3

### Patch Changes

- [`ebdf3ca`](https://github.com/clamp-sh/clamp/commit/ebdf3ca540e7032c1071fc78ceb9f03e0bcb2869) Thanks [@sbj-o](https://github.com/sbj-o)! - README: clarify this is the stdio server and point editor users at the one-click remote install in the Clamp dashboard. Document `CLAMP_API_URL` for self-hosted setups.

- [`8e7e050`](https://github.com/clamp-sh/clamp/commit/8e7e0502673ef8e1cefc08aa2db1ed8e02b89bb8) Thanks [@sbj-o](https://github.com/sbj-o)! - Internal refactor: tool registration split into a reusable module (`@clamp-sh/mcp/tools`). No user-visible change to the stdio binary.

## 0.4.2

### Patch Changes

- [`6e36f07`](https://github.com/clamp-sh/clamp/commit/6e36f07c35cb68529364c5fb0e9d1d50f168efe6) Thanks [@sbj-o](https://github.com/sbj-o)! - Fixed first MCP tool call failing with a 404 because the project id was spliced into the request URL before bootstrap completed.

## 0.4.1

### Patch Changes

- [`44bb43c`](https://github.com/clamp-sh/clamp/commit/44bb43cb120be89c20823da855f0dd881439a35c) Thanks [@sbj-o](https://github.com/sbj-o)! - Friendlier error messages when the API returns 401, 403, 404, 429, or 5xx. Unauthorized errors now tell you to regenerate your key; 404s from a missing route point at upgrading the MCP package; rate limits and server errors are distinguished from client mistakes.

## 0.4.0

### Minor Changes

- [`cfa4b82`](https://github.com/clamp-sh/clamp/commit/cfa4b8275f95bda53de7ad6c00180bbad91934e7) Thanks [@sbj-o](https://github.com/sbj-o)! - Added `referrer_host` filter to `traffic.overview`, `pages.top`, `events.list`, `traffic.timeseries`, and `funnels.get`. Use it to scope analytics to visitors from a specific source (e.g. `referrer_host="news.ycombinator.com"` to see which pages Hacker News visitors read).

## 0.3.1

### Patch Changes

- [`8ca258d`](https://github.com/clamp-sh/clamp/commit/8ca258d4cfcdca8cfd5127a16225d23214145656) Thanks [@sbj-o](https://github.com/sbj-o)! - Defer API key validation and bootstrap to first tool call so the server starts and responds to introspection without a valid key.

## 0.3.0

### Minor Changes

- [`bbe51b5`](https://github.com/clamp-sh/clamp/commit/bbe51b561f882bf8464ef1c231561761684bdb08) Thanks [@sbj-o](https://github.com/sbj-o)! - Auto-detect project from API key at startup. The MCP server now calls a bootstrap endpoint to resolve the project, removing the need to pass project_id on every tool call and prompt.

## 0.2.0

### Minor Changes

- [`5fae53b`](https://github.com/clamp-sh/clamp/commit/5fae53bf27792cef8d971c2600907cbf9a14f8c2) Thanks [@sbj-o](https://github.com/sbj-o)! - Added `cities.top` tool for visitor breakdown by city with optional country filter.
