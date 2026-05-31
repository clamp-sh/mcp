<div align="center">
  <a href="https://clamp.sh"><img src="https://clamp.sh/assets/repo-banner.png" alt="Clamp Analytics — privacy-first product analytics with a built-in MCP server" width="800" /></a>
</div>

<br />

<p align="center">
  <a href="https://www.npmjs.com/package/@clamp-sh/mcp"><img src="https://img.shields.io/npm/v/@clamp-sh/mcp?style=flat-square&color=8cc1c5&labelColor=1a1a1a" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/@clamp-sh/mcp"><img src="https://img.shields.io/npm/dm/@clamp-sh/mcp?style=flat-square&color=8cc1c5&labelColor=1a1a1a" alt="npm downloads" /></a>
  <a href="https://www.npmjs.com/package/@clamp-sh/mcp"><img src="https://img.shields.io/npm/types/@clamp-sh/mcp?style=flat-square&color=8cc1c5&labelColor=1a1a1a" alt="types: TypeScript" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/npm/l/@clamp-sh/mcp?style=flat-square&color=8cc1c5&labelColor=1a1a1a" alt="license" /></a>
</p>

# @clamp-sh/mcp

Analytics [MCP](https://modelcontextprotocol.io) server for [Clamp Analytics](https://clamp.sh). Gives Claude, Cursor, VS Code Copilot, Windsurf, Cline, and any other Model Context Protocol client live access to your traffic, pages, events, revenue, errors, funnels, cohorts, and alerts — and the tools to create funnels and metric alerts from the conversation.

> **Using Cursor, VS Code, Claude Code, or Claude Desktop?** Install the hosted Remote MCP from your [Clamp dashboard](https://clamp.sh/dashboard) in one click — auth happens automatically, no API key to paste, no config files to edit. Open a project, go to the Installation tab, and pick your editor. This npm package is the stdio path for CI, headless agents, custom clients, and self-hosted Clamp instances.

## What your agent can do

Once connected, your agent can answer questions like:

- "How's traffic this week?"
- "Why did pageviews drop on Tuesday?"
- "Which referrers drove the most signups?"
- "Compare US vs Germany conversion this month"
- "Create a funnel from /pricing to signup to purchase"
- "Alert me when bounce rate on /pricing goes above 70%"
- "What did Hacker News visitors actually read?"
- "Run the weekly report"

Each question maps to one or two MCP tool calls. The agent picks the right tool, runs the query, and returns the answer in chat — no dashboard tab, no copy-paste.

## Why an MCP server for analytics

A dashboard answers the questions you anticipated when you built it. An MCP server lets the agent answer the ones you didn't. Same data, different access pattern: the agent can compose tools, follow up on its own answers, and run the diagnostic queries you'd manually click through.

Tools are typed (`outputSchema` per MCP protocol 2025-06-18), so client-side validation works before any call lands. Per-tool descriptions name the use case and a representative example, so agents pick the right tool on the first try.

## Setup

For one-click install in Cursor / VS Code / Claude Code / Claude Desktop, use the [Clamp dashboard](https://clamp.sh/dashboard). For stdio (CI, headless agents, custom clients, self-hosted instances), pick your client below.

### VS Code / Copilot

Add to `.vscode/mcp.json` in your project:

```json
{
  "servers": {
    "clamp": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@clamp-sh/mcp"],
      "env": {
        "CLAMP_API_KEY": "sk_proj..."
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add clamp -- npx -y @clamp-sh/mcp
export CLAMP_API_KEY="sk_proj..."
```

### Claude Desktop and Cursor

Both clients use the same shape — drop this into `claude_desktop_config.json` or `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "clamp": {
      "command": "npx",
      "args": ["-y", "@clamp-sh/mcp"],
      "env": {
        "CLAMP_API_KEY": "sk_proj..."
      }
    }
  }
}
```

### API key

Get your API key from the Clamp dashboard under **Settings → API Keys**. Keys are scoped to a project and start with `sk_proj`.

## Tools

### Free (all plans)

| Tool | What it does |
|---|---|
| `traffic.overview` | Pageviews, visitors, sessions, bounce rate, avg duration. Period comparison included. |
| `traffic.timeseries` | Any core metric over time with automatic granularity (visitors, sessions, bounce rate, avg duration, or event counts). |
| `traffic.compare` | Compare any metric across two arbitrary periods. Returns absolute and percent delta. |
| `traffic.live` | Visitors active in the last N minutes plus their top pages, referrers, and countries. |
| `breakdown` | Group visitors and pageviews by any dimension: `pathname`, `referrer_host`, `country`, `city`, `region`, `device_type`, `browser`, `browser_version`, `os`, `os_version`, `entry_page`, `exit_page`, `channel`, or any UTM field. |
| `pages.engagement` | Per-page metrics with `view`: `summary`, `engagement` (adds engagement seconds and bounce rate), `sections` (per-section view counts for one pathname; needs the section-views SDK extension). |
| `events.list` | Custom event counts with property filtering and grouping. |
| `events.observed_schema` | The actual fired-event signature with per-property type observations. Diff against a local `event-schema.yaml` to surface schema drift. |
| `revenue.sum` | Sum revenue from Money-typed event properties. Split by currency, optionally grouped by any dimension. |
| `sessions.paths` | Aggregate session paths: top entry → exit pairs with pages per session and duration. |
| `users.journey` | Chronological session-and-event reconstruction for one anonymous ID. |
| `cohorts.create` / `cohorts.list` / `cohorts.retention` / `cohorts.compare` | Define cohorts by event + period + filter; query retention curves; compare two cohorts side-by-side. |
| `errors.list` / `errors.groups` / `errors.timeline` / `errors.context` | Recent errors, fingerprint-grouped errors with affected-user counts, error rate over time, and breadcrumbs leading to a single error. |
| `projects.list` | List all projects this credential can access. |
| `docs.search` | Keyword-search the Clamp docs index. |

### Pro

| Tool | What it does |
|---|---|
| `funnels.create` | Define and immediately evaluate a multi-step conversion funnel. Steps accept property predicates: `cta_click[location=hero][plan=pro]`. |
| `funnels.list` | List funnels or fetch one with cohort filters (country, channel, device, UTM). |
| `alerts.create` | Set up metric alerts (e.g. "visitors drops_by 30% over 7d"). |
| `alerts.list` / `alerts.delete` | List and remove alerts. |

### Common parameters

**period** — `"today"`, `"yesterday"`, `"7d"`, `"30d"`, `"90d"`, or a custom range as `"YYYY-MM-DD:YYYY-MM-DD"`. Defaults to `"30d"`.

**limit** — Max rows returned, 1-50. Defaults to 10.

**Filters** — Most tools accept `pathname`, `referrer_host`, `channel`, `country`, `region`, `city`, `device_type`, `browser`, `browser_version`, `os`, `os_version`, and the full UTM set (`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`). Funnels accept the same cohort filters.

**dimension** (`breakdown` only) — see the `breakdown` row above for valid values.

**view** (`pages.engagement` only) — `"summary"` (default), `"engagement"`, or `"sections"`. `"sections"` requires `pathname`.

## Prompts

Pre-built analytics workflows the AI can follow. Each prompt tells the model which tools to call, in what order, and how to present the results.

| Prompt | What it produces |
|---|---|
| `weekly_report` | Traffic summary, top pages, referrers, countries, one actionable insight. |
| `traffic_diagnosis` | Root-cause analysis for traffic changes. Drills into channels, countries, devices, pages. |
| `conversion_audit` | Funnel drop-off analysis with cohort segmentation. |
| `channel_breakdown` | Traffic quality comparison across sources (volume vs engagement). |
| `page_performance` | Deep-dive on a single page: trends, referrers, devices, engagement vs site average. |

## Examples

### Traffic overview

> "How's my traffic this week?"

Calls `traffic.overview` with `period="7d"`. Returns pageviews, visitors, sessions, bounce rate, avg duration, and comparison to the previous week.

> "Show me visitor trends for the last 90 days"

Calls `traffic.timeseries` with `period="90d"` and `metric="visitors"`. Returns daily counts over the full window.

### Sources and geography

> "Where are my visitors coming from?"

Calls `breakdown` with `dimension="referrer_host"`. Returns referrer hostnames with channel classification (organic_search, direct, referral, paid, email, organic_social) joined into each row.

> "Which cities in Germany have the most visitors?"

Calls `breakdown` with `dimension="city"` and `country="DE"`. Returns city names with country and visitor/pageview counts.

> "Is Safari 17 bouncing harder than Chrome 120?"

Two calls to `traffic.overview` with `browser="Safari"`, `browser_version="17"` and `browser="Chrome"`, `browser_version="120"`. Returns side-by-side bounce rates.

> "Which pages did Hacker News visitors read?"

Calls `pages.engagement` with `referrer_host="news.ycombinator.com"`. Returns only pages viewed by traffic from HN.

### Custom events

> "How many signups happened this month?"

Calls `events.list` with `name="signup"` and `period="30d"`.

> "Break down signups by plan"

Calls `events.list` with `name="signup"` and `group_by="plan"`. Returns counts per property value.

### Funnels (Pro)

> "Create a funnel from pricing page to signup to purchase"

Calls `funnels.create` with steps `["pageview:/pricing", "signup", "purchase"]`. Returns step-by-step conversion rates immediately.

> "Compare funnel conversion for US vs Germany"

Two calls to `funnels.list`, one with `country="US"` and one with `country="DE"`.

### Alerts (Pro)

> "Alert me if visitors drop by 30% week over week"

Calls `alerts.create` with `metric="visitors"`, `condition="drops_by"`, `threshold=30`, `period="7d"`.

### Workflows

> "Why did traffic drop last week?"

Follows the `traffic_diagnosis` prompt. Systematically checks channels, countries, devices, and pages to isolate the root cause.

> "Audit our conversion funnel"

Follows the `conversion_audit` prompt. Analyzes funnel drop-offs, segments by device/country/channel, and identifies the biggest optimization opportunity.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `CLAMP_API_KEY` | Yes | Project API key (`sk_proj...`). |
| `CLAMP_API_URL` | No | Override the API base. Defaults to `https://api.clamp.sh`. Set this when pointing at a self-hosted Clamp instance. |

## FAQ

**Do I need an API key for the Remote MCP install?** No. Installing from the Clamp dashboard handles auth automatically. The API key is only needed for stdio (this npm package), self-hosted instances, CI, and custom clients.

**How is this different from the Clamp dashboard?** Same data, different access pattern. Use the dashboard when you want a chart; use the MCP when you want the agent to do the digging — diagnose a drop, compose a funnel, run a weekly report — and return the answer in chat.

**Can I self-host?** Yes. Point `CLAMP_API_URL` at your self-hosted Clamp instance, or run the stdio server inline in your own infrastructure. The MCP tools work against any Clamp API endpoint that speaks the same protocol.

**Does this work for read-only audits, or can the agent make changes?** Both. The Free-tier tools are all read-only; the Pro tools (`funnels.create`, `alerts.create`, `alerts.delete`) write. Scope the connection from the dashboard if you only want read access.

**Will the agent know about my custom events?** Yes. `events.observed_schema` returns the actual fired-event signatures with per-property type observations, so the agent can answer "what's in my event schema" without you pasting anything.

## License

MIT
