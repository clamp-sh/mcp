<p align="center">
  <a href="https://clamp.sh">
    <img src="https://raw.githubusercontent.com/clamp-sh/mcp/main/.github/banner.png" alt="Clamp" />
  </a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@clamp-sh/mcp"><img src="https://img.shields.io/npm/v/@clamp-sh/mcp?style=flat-square&color=B8E847&labelColor=1a1a1a" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/@clamp-sh/mcp"><img src="https://img.shields.io/npm/dm/@clamp-sh/mcp?style=flat-square&color=B8E847&labelColor=1a1a1a" alt="npm downloads" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/npm/l/@clamp-sh/mcp?style=flat-square&color=B8E847&labelColor=1a1a1a" alt="license" /></a>
  <a href="https://glama.ai/mcp/servers/clamp-sh/mcp"><img src="https://glama.ai/mcp/servers/clamp-sh/mcp/badges/score.svg" alt="mcp MCP server" /></a>
</p>

# @clamp-sh/mcp

Stdio MCP server for [Clamp](https://clamp.sh) analytics. Gives your AI assistant read access to pageviews, visitors, referrers, countries, cities, devices, custom events, and conversion funnels. Pro plans can create funnels and set up metric alerts.

Works with any MCP client: Claude Desktop, VS Code Copilot, Cursor, Windsurf, Cline, or anything that speaks the [Model Context Protocol](https://modelcontextprotocol.io).

> **Using Cursor, VS Code, Claude Code, or Claude Desktop?** There is a one-click remote install in the Clamp dashboard that handles auth via OAuth, no API key to paste. Open a project, go to the Installation tab, and pick your editor. This package is the stdio path for CI, headless agents, custom clients, and self-hosted Clamp instances.

## Setup

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
```

Then set your API key:

```bash
export CLAMP_API_KEY="sk_proj..."
```

### Claude Desktop

Add to `claude_desktop_config.json`:

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

### Cursor

Add to `.cursor/mcp.json`:

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

Get your API key from the Clamp dashboard under **Settings > API Keys**. Keys are scoped to a project and start with `sk_proj`.

## Tools

### Free (all plans)

| Tool | What it does |
|---|---|
| `traffic.overview` | Pageviews, visitors, sessions, bounce rate, avg duration. Period comparison included. |
| `pages.top` | Most visited pages ranked by pageviews. |
| `referrers.top` | Traffic sources with channel classification (organic_search, direct, referral, paid, email, organic_social). |
| `countries.top` | Visitors by country (ISO 3166-1 alpha-2 codes). |
| `cities.top` | Visitors by city. Optionally filter by country. |
| `devices.top` | Breakdown by device type, browser, or OS. |
| `events.list` | Custom event counts with property filtering and grouping. |
| `revenue.sum` | Sum revenue from Money-typed event properties. Split by currency, optionally grouped by referrer_host, country, channel, UTM, etc. |
| `sessions.paths` | Aggregate session paths: top entry → exit pairs with pages per session and duration. |
| `pages.engagement` | Per-page engagement seconds and bounce rate. |
| `traffic.timeseries` | Event counts over time with automatic granularity. |

### Pro

| Tool | What it does |
|---|---|
| `funnels.create` | Define and immediately evaluate a multi-step conversion funnel. |
| `funnels.get` | Retrieve a funnel with cohort filters (country, channel, device, UTM). |
| `alerts.create` | Set up metric alerts (e.g. "visitors drops_by 30% over 7d"). |

### Common parameters

**period** — `"today"`, `"yesterday"`, `"7d"`, `"30d"`, `"90d"`, or a custom range as `"YYYY-MM-DD:YYYY-MM-DD"`. Defaults to `"30d"`.

**limit** — Max rows returned, 1-50. Defaults to 10.

**Filters** — Most tools accept `pathname`, `utm_source`, `utm_campaign`, and `referrer_host`. Referrers accept `channel`. Funnels accept cohort filters: `country`, `channel`, `device_type`, `utm_source`, `utm_campaign`, `referrer_host`.

**referrer_host** — Filter results to visitors from a specific source. Must match the value returned by `referrers.top` exactly (e.g. `"news.ycombinator.com"`, `"twitter.com"`, `"github.com"`). Works on overview, top pages, events, timeseries, and funnels.

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

> "What's the bounce rate on /pricing?"

Calls `traffic.overview` with `pathname="/pricing"`. Returns metrics for that single page, including comparison to the prior period.

> "Show me traffic trends for the last 90 days"

Calls `traffic.timeseries` with `period="90d"`. Returns daily counts over the full window.

### Sources and geography

> "Where are my visitors coming from?"

Calls `referrers.top`. Returns referrer hostnames with channel classification (organic_search, direct, referral, paid, email, organic_social).

> "Show me only organic search traffic to /blog"

Calls `referrers.top` with `channel="organic_search"` and `pathname="/blog"`.

> "Which countries send the most traffic?"

Calls `countries.top`. Returns ISO country codes with visitor and pageview counts.

> "Which cities in Germany have the most visitors?"

Calls `cities.top` with `country="DE"`. Returns city names with visitor and pageview counts.

> "Which pages did Hacker News visitors read?"

Calls `pages.top` with `referrer_host="news.ycombinator.com"`. Returns only pages viewed by traffic from HN.

> "How's traffic from Twitter trending?"

Calls `traffic.timeseries` with `referrer_host="twitter.com"`. Returns the pageview curve for visitors from a single source.

### Devices

> "What's the mobile vs desktop split?"

Calls `devices.top` with `group_by="device_type"`.

> "Which browsers are my visitors using?"

Calls `devices.top` with `group_by="browser"`.

### Custom events

> "How many signups happened this month?"

Calls `events.list` with `name="signup"` and `period="30d"`.

> "Break down signups by plan"

Calls `events.list` with `name="signup"` and `group_by="plan"`. Returns counts per property value (e.g. free: 42, pro: 18, growth: 7).

> "How many signups came from the spring campaign?"

Calls `events.list` with `name="signup"` and `utm_campaign="spring-launch"`.

### Funnels (Pro)

Funnels let you track multi-step conversion and filter by cohorts: country, channel, device type, and UTM parameters. This is where you answer questions like "how many mobile users from Germany actually signed up?"

> "Create a funnel from pricing page to signup to checkout"

Calls `funnels.create` with steps `["pageview:/pricing", "signup", "checkout_completed"]`. Returns step-by-step conversion rates immediately.

> "How does the pricing-to-signup funnel convert on mobile?"

Calls `funnels.get` with `name="pricing-to-signup"` and `device_type="mobile"`.

> "Compare funnel conversion for US vs Germany"

Two calls to `funnels.get`, one with `country="US"` and one with `country="DE"`.

> "What's the funnel conversion for visitors from Google?"

Calls `funnels.get` with `channel="organic_search"`.

> "How many mobile users from Germany signed up?"

Create a single-step funnel with `steps=["signup"]` and filter with `country="DE"` and `device_type="mobile"`. Cohort filtering works on any funnel, including single-event funnels.

### Alerts (Pro)

> "Alert me if visitors drop by 30% week over week"

Calls `alerts.create` with `metric="visitors"`, `condition="drops_by"`, `threshold=30`, `period="7d"`.

> "Alert me if bounce rate on /pricing goes above 70%"

Calls `alerts.create` with `metric="bounce_rate"`, `condition="above"`, `threshold=70`, `pathname="/pricing"`.

### Workflows

> "Run a weekly report"

Follows the `weekly_report` prompt. Calls overview, top pages, referrers, countries, and timeseries, then synthesizes a structured report with trends and one actionable insight.

> "Why did traffic drop last week?"

Follows the `traffic_diagnosis` prompt. Systematically checks channels, countries, devices, and pages to isolate the root cause.

> "Audit our conversion funnel"

Follows the `conversion_audit` prompt. Analyzes funnel drop-offs, segments by device/country/channel, and identifies the biggest optimization opportunity.

> "How is /pricing performing?"

Follows the `page_performance` prompt. Pulls page-specific metrics, referrers, device split, and compares engagement to the site average.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `CLAMP_API_KEY` | Yes | Project API key (`sk_proj...`). |
| `CLAMP_API_URL` | No | Override the API base. Defaults to `https://api.clamp.sh`. Set this when pointing at a self-hosted Clamp instance. |
