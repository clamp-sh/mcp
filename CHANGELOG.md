# @clamp-sh/mcp

## 0.6.0

### Minor Changes

- [`0763773`](https://github.com/clamp-sh/clamp/commit/0763773d9e9c493c51670e31231fbe58d00a26c7) Thanks [@sbj-o](https://github.com/sbj-o)! - Added `list_projects` tool and optional `project_id` parameter to every data tool. The remote MCP endpoint is now `/mcp` (previously `/mcp/:projectId`) and grants access to every project in the authenticated user's account. Tools resolve automatically when you only have one project, and return a structured `project_required` error listing available projects when they need disambiguation. Stdio usage is unchanged.

## 0.5.0

### Minor Changes

- [`b7cd7b7`](https://github.com/clamp-sh/clamp/commit/b7cd7b7c3017651d9149dc3a20389c076bb326c9) Thanks [@sbj-o](https://github.com/sbj-o)! - Added four tools: `get_breakdown` (slice by 18 dimensions including entry/exit page, region, browser version, and all UTM fields), `compare_periods` (a vs b metric delta), `get_current_visitors` (active-visitor realtime count), and `docs_search` (keyword search over the public Clamp docs). Broadened filter coverage across every read tool to accept `utm_medium`, `utm_content`, `utm_term`, `country`, `device_type`, `channel`, and `referrer_host`. All read tools now declare `readOnlyHint` so MCP clients can reason about side-effect safety.

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

- [`cfa4b82`](https://github.com/clamp-sh/clamp/commit/cfa4b8275f95bda53de7ad6c00180bbad91934e7) Thanks [@sbj-o](https://github.com/sbj-o)! - Added `referrer_host` filter to `get_overview`, `get_top_pages`, `get_events`, `get_timeseries`, and `get_funnel`. Use it to scope analytics to visitors from a specific source (e.g. `referrer_host="news.ycombinator.com"` to see which pages Hacker News visitors read).

## 0.3.1

### Patch Changes

- [`8ca258d`](https://github.com/clamp-sh/clamp/commit/8ca258d4cfcdca8cfd5127a16225d23214145656) Thanks [@sbj-o](https://github.com/sbj-o)! - Defer API key validation and bootstrap to first tool call so the server starts and responds to introspection without a valid key.

## 0.3.0

### Minor Changes

- [`bbe51b5`](https://github.com/clamp-sh/clamp/commit/bbe51b561f882bf8464ef1c231561761684bdb08) Thanks [@sbj-o](https://github.com/sbj-o)! - Auto-detect project from API key at startup. The MCP server now calls a bootstrap endpoint to resolve the project, removing the need to pass project_id on every tool call and prompt.

## 0.2.0

### Minor Changes

- [`5fae53b`](https://github.com/clamp-sh/clamp/commit/5fae53bf27792cef8d971c2600907cbf9a14f8c2) Thanks [@sbj-o](https://github.com/sbj-o)! - Added `get_cities` tool for visitor breakdown by city with optional country filter.
