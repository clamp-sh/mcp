# @clamp-sh/mcp

## 3.0.0

### Major Changes

- [`9ff1832`](https://github.com/clamp-sh/clamp/commit/9ff1832c3f0c184d5bbca7d6de661f54d39a0000) Thanks [@sbj-o](https://github.com/sbj-o)! - Four new MCP tools for reading errors that the SDK's captureError() shipped this cycle, plus a tool-naming consistency fix.

  **New tools (errors.\* namespace):**

  - `errors.list(message?, fingerprint?, browser?, os?, device_type?, country?, handled?, period?, limit?)` — recent error events with full context (message, type, stack, fingerprint, plus standard event fields like url, browser, OS, country).
  - `errors.groups(period?, sort_by?, limit?)` — fingerprint-deduplicated triage view with count, users_affected, first_seen, last_seen per bug. Sort by count (default), users_affected, first_seen, or last_seen.
  - `errors.timeline(fingerprint?, period?, interval?)` — error count over time, hourly or daily buckets. Optional fingerprint filter to chart a single bug's rate.
  - `errors.context(anonymous_id, before_timestamp, limit?)` — breadcrumbs from the same session leading to an error, in chronological order.

  Each tool description follows the rubric (purpose, examples, limitations, "Pairs with") and parameter descriptions explain when to set each filter. The cross-correlation story works because errors live in the same event store as traffic and revenue: an agent can ask "errors spiked because the LinkedIn campaign drove broken-Safari users to /checkout" and pull from one MCP, no tool-switching.

  **Breaking: `breakdown` renamed to `traffic.breakdown`.**

  Every other tool in the surface lives under a resource namespace (`alerts.list`, `cohorts.create`, `users.journey`, `revenue.sum`, `traffic.overview`); `breakdown` was the only bare-named tool. Renaming aligns it with the rest. Same parameters, same response, same handler; the only thing that changes is the registered tool name.

  Migration: anywhere your prompts or saved configs call `breakdown(...)`, change to `traffic.breakdown(...)`. There is no alias for the old name.

  **Convention documented:** added a top-of-file comment in `tools.ts` codifying the three sub-conventions (`resource.list`/`.create`/`.delete` for CRUD, `resource.verb` for action operations, `resource.thing` for shaped reads) so future tools don't drift back into bare-name territory.

## 2.0.0

### Major Changes

- [`d8b0eda`](https://github.com/clamp-sh/clamp/commit/d8b0edaa2059601fd143fa57d876dab8b9206b91) Thanks [@sbj-o](https://github.com/sbj-o)! - Rename `funnels.get` → `funnels.list` for naming consistency with `cohorts.list` and `alerts.list`. Same behavior — list all funnels when no `name` is passed, fetch one when it is. The previous name was always slightly off ("get" implies fetch-one, but the tool also lists). Breaking for any installation referencing the old name in saved chats or scripts; rebind to `funnels.list`.

### Minor Changes

- [`e5bfcae`](https://github.com/clamp-sh/clamp/commit/e5bfcae6afcdddcb655a8e5192b38fd8b80b8cf5) Thanks [@sbj-o](https://github.com/sbj-o)! - Add first-touch attribution to `revenue.sum` and a new `users.journey` MCP tool. `attribution_model="first_touch"` joins each revenue event with the visitor's earliest-known session and groups by that session's acquisition dimension — answers "where did paying customers actually come from?" instead of the existing "what surface was active at conversion?" reading. First-touch is restricted to acquisition dimensions (channel, referrer*host, utm*\*) where it actually makes sense. The new `users.journey` tool returns chronological session history for one anonymous_id, flagging the first session with `is_first_touch: true`. It's the primitive every multi-touch attribution analysis builds on.

- [`10a0e9e`](https://github.com/clamp-sh/clamp/commit/10a0e9ee691840d4e69d0f7439b9dabb2694216c) Thanks [@sbj-o](https://github.com/sbj-o)! - Add cohorts as first-class. Five new MCP tools: `cohorts.create`, `cohorts.list`, `cohorts.retention`, `cohorts.compare`, `cohorts.delete`. A cohort is a named group of visitors defined by an event in a period (optionally narrowed by a property filter); membership is recomputed at query time, not materialised, so the same cohort always reflects current data. Retention is measured in 1-day windows at the requested days/weeks (the standard product-analytics definition: "7d retention" = "day 7 specifically"). Pro plan; behavioral / multi-event cohorts are deliberately not in 0.x.

## 1.3.0

### Minor Changes

- [`6dc8049`](https://github.com/clamp-sh/clamp/commit/6dc804906e2ec9855a3f618acb0c1dc06e462e4e) Thanks [@sbj-o](https://github.com/sbj-o)! - Add `events.observed_schema` — returns the event signature as it actually fired in the period (names, property keys, storage type per key). Pairs with `event-schema.yaml` for drift detection: an agent reads the local schema, calls this tool, and surfaces declared-but-not-firing, firing-but-not-declared, and silent property-type drift.

## 1.2.0

### Minor Changes

- [`b9d920d`](https://github.com/clamp-sh/clamp/commit/b9d920d006de62de57c077e0ea274a6175882a49) Thanks [@sbj-o](https://github.com/sbj-o)! - Funnel predicates can now target number- and boolean-typed properties via an inline type tag (`[count:n=5]`, `[refunded:b=false]`); bare `[key=value]` keeps matching strings as before. `events.list` adds `value_type` and `group_by_type` params for filtering and grouping by non-string properties. Tool descriptions point at `event-schema.yaml` as the source of truth for which type to use.

### Patch Changes

- [`b9d920d`](https://github.com/clamp-sh/clamp/commit/b9d920d006de62de57c077e0ea274a6175882a49) Thanks [@sbj-o](https://github.com/sbj-o)! - Index the Event Schema docs in `docs.search` so agents asking about typed events or generated TypeScript surface the new page.

## 1.1.0

### Minor Changes

- [`e6ea8f6`](https://github.com/clamp-sh/clamp/commit/e6ea8f6b6dea663ee585c9128ec4549be470a88a) Thanks [@sbj-o](https://github.com/sbj-o)! - Funnel steps can now carry property predicates in brackets — `"cta_click[location=hero_primary]"` matches only events whose property equals the value. Stack predicates (`[location=hero][plan=pro]`) to AND them, and use them on pageview steps too (`"pageview:/pricing[utm_source=google]"`). Unlocks "which X led to Y" questions that previously required a separate funnel per dimension value.

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
