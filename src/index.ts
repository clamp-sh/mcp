#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ── Config ───────────────────────────────────────────

const API_BASE = process.env.CLAMP_API_URL ?? "https://api.clamp.sh";
const API_KEY = process.env.CLAMP_API_KEY ?? "";

// ── Bootstrap (deferred to first tool/prompt call) ───

let PROJECT_ID = "";
let PROJECT_NAME = "";
let PLAN = "";
let bootstrapped = false;

async function ensureBootstrapped(): Promise<void> {
  if (bootstrapped) return;
  if (!API_KEY) {
    throw new Error("CLAMP_API_KEY is required. Set it in your MCP config env.");
  }
  const res = await fetch(`${API_BASE}/mcp/bootstrap`, {
    headers: { "x-clamp-key": API_KEY },
  });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 401) {
      throw new Error(
        "Invalid CLAMP_API_KEY. The key was rejected — it may have been revoked or rotated. Generate a new key from the Clamp dashboard and restart your MCP client.",
      );
    }
    if (res.status === 400) {
      throw new Error(
        "This API key is not linked to a project. Regenerate it from the project's Settings tab in the Clamp dashboard.",
      );
    }
    throw new Error(`Bootstrap failed (${res.status}): ${body}`);
  }
  const data = (await res.json()) as { projectId: string; projectName: string; plan: string };
  PROJECT_ID = data.projectId;
  PROJECT_NAME = data.projectName;
  PLAN = data.plan;
  bootstrapped = true;
}

// ── HTTP helper ──────────────────────────────────────

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  await ensureBootstrapped();
  if (!PROJECT_ID) {
    throw new Error(
      "No project resolved. Bootstrap completed but returned no project — regenerate your API key from the Clamp dashboard.",
    );
  }
  // Tool paths use a literal `{pid}` placeholder because they're evaluated
  // when the tool callback runs, which can be before the first bootstrap
  // completes. We substitute here, after bootstrap, so PROJECT_ID is always
  // populated by the time it's spliced into the URL.
  const finalPath = path.replace("{pid}", PROJECT_ID);
  const url = `${API_BASE}${finalPath}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-clamp-key": API_KEY,
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(formatApiError(res.status, body, finalPath));
  }
  return res.json() as Promise<T>;
}

function formatApiError(status: number, body: string, path: string): string {
  // Try to pull a structured { error, message } out of the body
  let parsed: { error?: string; message?: string } | null = null;
  try {
    parsed = JSON.parse(body);
  } catch {
    // non-JSON body (e.g. bare "404 Not Found" from the router)
  }
  const detail = parsed?.message || parsed?.error || body?.trim() || "";

  if (status === 401) {
    return "Unauthorized. The CLAMP_API_KEY set in your MCP config is invalid or was revoked. Generate a new key in the Clamp dashboard and restart your MCP client.";
  }
  if (status === 403) {
    return `Forbidden${detail ? `: ${detail}` : ""}.`;
  }
  if (status === 404) {
    // If there's no structured error, it's almost certainly a route miss —
    // usually means PROJECT_ID was empty or the endpoint path drifted.
    if (!parsed) {
      return `Endpoint not found (${path}). Your MCP client may be on an older version — try updating @clamp-sh/mcp.`;
    }
    return `Not found${detail ? `: ${detail}` : ""}.`;
  }
  if (status === 429) {
    return `Rate limited${detail ? `: ${detail}` : ""}. Try again in a moment.`;
  }
  if (status >= 500) {
    return `Clamp API is having trouble (${status}). Try again in a moment; if it persists, check status.clamp.sh.`;
  }
  return `API ${status}${detail ? `: ${detail}` : ""}`;
}

function qs(params: Record<string, string | number | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== "");
  if (entries.length === 0) return "";
  return "?" + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString();
}

// ── Shared param descriptions ────────────────────────

const PERIOD_DESC =
  'Time period. Use "today", "yesterday", "7d", "30d", "90d", or a custom range as "YYYY-MM-DD:YYYY-MM-DD" (e.g. "2026-01-01:2026-03-31"). Defaults to "30d".';

const LIMIT_DESC = "Max rows to return (1-50). Defaults to 10.";

const PATHNAME_FILTER_DESC =
  'Filter to a specific page path (e.g. "/pricing", "/blog/my-post"). Must start with /.';

const UTM_SOURCE_DESC =
  'Filter by UTM source (e.g. "google", "twitter", "newsletter"). Case-sensitive, must match the value in the tracking URL.';

const UTM_CAMPAIGN_DESC =
  'Filter by UTM campaign name (e.g. "spring-launch", "product-hunt"). Case-sensitive.';

const CHANNEL_DESC =
  'Traffic channel. One of: "direct", "organic_search", "organic_social", "paid", "email", "referral".';

const COUNTRY_DESC =
  'ISO 3166-1 alpha-2 country code, uppercase (e.g. "US", "GB", "DE", "NL", "JP"). Filter results to visitors from this country.';

const DEVICE_TYPE_DESC =
  'Device category. One of: "desktop", "mobile", "tablet".';

const REFERRER_HOST_DESC =
  'Filter by referrer hostname (e.g. "news.ycombinator.com", "twitter.com", "github.com"). Use this to see what traffic from a specific source did. Must match the value returned by get_top_referrers exactly (lowercase, no protocol or path).';

// ── Shared Zod shapes ──────────────────────────────────

const periodParam = z.string().optional().describe(PERIOD_DESC);
const limitParam = z.coerce.number().optional().describe(LIMIT_DESC);
const pathnameParam = z.string().optional().describe(PATHNAME_FILTER_DESC);
const utmSourceParam = z.string().optional().describe(UTM_SOURCE_DESC);
const utmCampaignParam = z.string().optional().describe(UTM_CAMPAIGN_DESC);
const channelParam = z.string().optional().describe(CHANNEL_DESC);
const countryParam = z.string().optional().describe(COUNTRY_DESC);
const deviceTypeParam = z.string().optional().describe(DEVICE_TYPE_DESC);
const referrerHostParam = z.string().optional().describe(REFERRER_HOST_DESC);

// ── Server ───────────────────────────────────────────

const server = new McpServer({
  name: "clamp",
  version: "0.1.0",
});

// ── Tool: get_overview ───────────────────────────────

server.tool(
  "get_overview",
  "Get a high-level overview of website analytics: total pageviews, unique visitors, sessions, bounce rate (%), and average session duration (seconds). Includes comparison with the previous period of the same length. Use this first to understand overall traffic before drilling into specifics.",
  {
    period: periodParam,
    pathname: pathnameParam,
    utm_source: utmSourceParam,
    utm_campaign: utmCampaignParam,
    referrer_host: referrerHostParam,
  },
  async ({ period, pathname, utm_source, utm_campaign, referrer_host }) => {
    const data = await api(
      `/analytics/{pid}/overview${qs({ period, pathname, utm_source, utm_campaign, referrer_host })}`,
    );
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  },
);

// ── Tool: get_top_pages ──────────────────────────────

server.tool(
  "get_top_pages",
  "Get the most visited pages ranked by pageviews. Returns pathname, pageview count, and unique visitor count for each page. Use to identify which pages attract the most traffic. Filter by referrer_host to see which pages a specific traffic source landed on (e.g. what Hacker News visitors read).",
  {
    period: periodParam,
    limit: limitParam,
    referrer_host: referrerHostParam,
  },
  async ({ period, limit, referrer_host }) => {
    const data = await api(
      `/analytics/{pid}/top-pages${qs({ period, limit, referrer_host })}`,
    );
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  },
);

// ── Tool: get_top_referrers ──────────────────────────

server.tool(
  "get_top_referrers",
  'Get the top traffic sources (referrer hostnames) ranked by unique visitors. Each row includes: referrer_host (e.g. "google.com"), channel (one of: "direct", "organic_search", "organic_social", "paid", "email", "referral"), visitor count, and pageview count. Use to understand where traffic comes from.',
  {
    period: periodParam,
    limit: limitParam,
    channel: channelParam,
    pathname: pathnameParam,
  },
  async ({ period, limit, channel, pathname }) => {
    const data = await api(
      `/analytics/{pid}/top-referrers${qs({ period, limit, channel, pathname })}`,
    );
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  },
);

// ── Tool: get_countries ──────────────────────────────

server.tool(
  "get_countries",
  'Get visitor counts by country. Returns ISO 3166-1 alpha-2 country codes (e.g. "US", "GB", "DE") with unique visitors and pageviews for each. Results sorted by visitors descending.',
  {
    period: periodParam,
    limit: limitParam,
  },
  async ({ period, limit }) => {
    const data = await api(
      `/analytics/{pid}/countries${qs({ period, limit })}`,
    );
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  },
);

// ── Tool: get_cities ─────────────────────────────────

server.tool(
  "get_cities",
  'Get visitor counts by city. Returns city name, ISO country code, unique visitors, and pageviews. Optionally filter by country (ISO 3166-1 alpha-2 code). Results sorted by visitors descending.',
  {
    period: periodParam,
    limit: limitParam,
    country: z
      .string()
      .max(2)
      .optional()
      .describe('Optional ISO country code to filter by (e.g. "US", "DE").'),
  },
  async ({ period, limit, country }) => {
    const data = await api(
      `/analytics/{pid}/cities${qs({ period, limit, country })}`,
    );
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  },
);

// ── Tool: get_devices ────────────────────────────────

server.tool(
  "get_devices",
  'Get visitor breakdown by device type, browser, or operating system. Set group_by to choose the dimension. Returns the dimension name with visitor and pageview counts.',
  {
    period: periodParam,
    limit: limitParam,
    group_by: z
      .enum(["device_type", "browser", "os"])
      .optional()
      .describe(
        'Dimension to group by. "device_type" returns desktop/mobile/tablet. "browser" returns Chrome/Firefox/Safari/etc. "os" returns Windows/macOS/Linux/iOS/Android/etc. Defaults to "device_type".',
      ),
  },
  async ({ period, limit, group_by }) => {
    const data = await api(
      `/analytics/{pid}/devices${qs({ period, limit, group_by })}`,
    );
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  },
);

// ── Tool: get_events ─────────────────────────────────

server.tool(
  "get_events",
  'Get custom event counts. Without a name filter, returns all event names with their total counts (excludes "pageview"). With a name filter, returns counts for that specific event. Supports filtering by a single custom property key/value pair and grouping by a property key. Custom events are tracked via clamp.track("event_name", { key: "value" }).',
  {
    period: periodParam,
    limit: limitParam,
    name: z
      .string()
      .optional()
      .describe(
        'Filter to a specific event name (e.g. "signup", "checkout_completed", "button_clicked"). Event names are case-sensitive strings set by the developer.',
      ),
    property: z
      .string()
      .optional()
      .describe(
        'A custom property key to filter or group by (e.g. "plan", "source", "button_id"). Property keys are strings, max 128 chars. Only works when a name filter is set.',
      ),
    value: z
      .string()
      .optional()
      .describe(
        'Filter to events where the property key equals this value. Must be used together with the "property" parameter. Values are strings, max 512 chars.',
      ),
    group_by: z
      .string()
      .optional()
      .describe(
        'Group results by this custom property key (e.g. "plan" to see signups broken down by plan). Returns each unique value with its count. Must be used with a name filter.',
      ),
    utm_source: utmSourceParam,
    utm_campaign: utmCampaignParam,
    referrer_host: referrerHostParam,
  },
  async ({ period, limit, name, property, value, group_by, utm_source, utm_campaign, referrer_host }) => {
    const data = await api(
      `/analytics/{pid}/events${qs({ period, limit, name, property, value, group_by, utm_source, utm_campaign, referrer_host })}`,
    );
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  },
);

// ── Tool: get_timeseries ─────────────────────────────

server.tool(
  "get_timeseries",
  'Get event counts over time as a series of date buckets. Granularity is automatic: hourly for ≤2 days, daily for ≤90 days, weekly for ≤365 days, monthly beyond. Returns [{ date, count }] array. Use to visualize trends and spot patterns. Can optionally specify a granularity override and filter to a specific event name.',
  {
    period: periodParam,
    event: z
      .string()
      .optional()
      .describe(
        'Event name to chart. Defaults to "pageview". Use any custom event name to see its trend over time.',
      ),
    granularity: z
      .enum(["hour", "day", "week", "month"])
      .optional()
      .describe(
        'Override the automatic granularity. "hour" for hourly buckets, "day" for daily, "week" for weekly, "month" for monthly. If omitted, chosen automatically based on the period length.',
      ),
    property: z.string().optional().describe("Filter by this custom property key (used with value)."),
    value: z.string().optional().describe("Filter to events where the property key equals this value."),
    referrer_host: referrerHostParam,
  },
  async ({ period, event, granularity, property, value, referrer_host }) => {
    const data = await api(
      `/analytics/{pid}/timeseries${qs({ period, event, granularity, property, value, referrer_host })}`,
    );
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  },
);

// ── Tool: create_funnel ──────────────────────────────

server.tool(
  "create_funnel",
  'Create and immediately evaluate a conversion funnel. A funnel tracks how many unique visitors complete a sequence of steps. Returns step-by-step counts, conversion rates, and overall conversion. Steps can be event names (e.g. "signup") or pageviews with a path (e.g. "pageview:/pricing"). The funnel is saved for later retrieval. Requires Pro plan.',
  {
    name: z
      .string()
      .describe(
        'A descriptive name for this funnel (e.g. "pricing-to-signup", "onboarding-flow"). Used to retrieve it later. Max 200 chars.',
      ),
    steps: z
      .array(z.string())
      .describe(
        'Ordered array of 2-10 funnel steps. Each step is either: (1) a custom event name like "signup", "checkout_completed", or (2) a pageview with path in the format "pageview:/path" (e.g. "pageview:/pricing", "pageview:/blog/my-post"). Example: ["pageview:/pricing", "signup", "checkout_completed"].',
      ),
  },
  async ({ name, steps }) => {
    const data = await api(`/analytics/{pid}/funnels`, {
      method: "POST",
      body: JSON.stringify({ name, steps }),
    });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  },
);

// ── Tool: get_funnel ─────────────────────────────────

server.tool(
  "get_funnel",
  'Retrieve and evaluate a previously created funnel. Re-evaluates against current data for the specified period. Supports cohort filters to analyze specific segments (e.g. mobile users from the US who came via organic search). If no name is specified, returns all funnels for the project.',
  {
    name: z
      .string()
      .optional()
      .describe("The funnel name to retrieve. Omit to list all funnels for the project."),
    period: periodParam,
    country: countryParam,
    channel: channelParam,
    device_type: deviceTypeParam,
    utm_source: utmSourceParam,
    utm_campaign: utmCampaignParam,
    pathname: z
      .string()
      .optional()
      .describe('Additional pathname filter applied to all funnel steps (e.g. filter to users who started on "/blog").'),
    referrer_host: referrerHostParam,
  },
  async ({ name, period, country, channel, device_type, utm_source, utm_campaign, pathname, referrer_host }) => {
    const data = await api(
      `/analytics/{pid}/funnels${qs({ name, period, country, channel, device_type, utm_source, utm_campaign, pathname, referrer_host })}`,
    );
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  },
);

// ── Tool: create_alert ───────────────────────────────

server.tool(
  "create_alert",
  'Create a metric alert that triggers when a condition is met. The alert monitors a specific metric over a period and fires when it crosses the threshold. Evaluated on each MCP session connect. Requires Pro plan.',
  {
    metric: z
      .enum(["pageviews", "visitors", "sessions", "bounce_rate", "avg_duration"])
      .describe(
        'The metric to monitor. "pageviews" = total page views, "visitors" = unique visitors, "sessions" = total sessions, "bounce_rate" = % of single-page sessions (0-100), "avg_duration" = average session length in seconds.',
      ),
    condition: z
      .enum(["above", "below", "drops_by", "increases_by"])
      .describe(
        'Alert condition. "above" = metric exceeds threshold, "below" = metric falls below threshold, "drops_by" = metric drops by threshold % compared to previous period, "increases_by" = metric increases by threshold % compared to previous period.',
      ),
    threshold: z.coerce
      .number()
      .describe(
        'Threshold value. For "above"/"below": the absolute metric value (e.g. 1000 pageviews). For "drops_by"/"increases_by": the percentage change (e.g. 50 means 50% drop/increase).',
      ),
    period: z
      .string()
      .optional()
      .describe('Evaluation window. Use "7d", "30d", etc. Defaults to "7d". Compared against the previous period of the same length.'),
    pathname: z
      .string()
      .optional()
      .describe('Scope the alert to a specific page path (e.g. "/pricing"). Omit to monitor all pages.'),
  },
  async ({ metric, condition, threshold, period, pathname }) => {
    const data = await api(`/analytics/{pid}/alerts`, {
      method: "POST",
      body: JSON.stringify({ metric, condition, threshold, period, pathname }),
    });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  },
);

// ── Response formatting instructions ─────────────────

const RESPONSE_STYLE = `
## How to present analytics data

**Lead with the insight, not the numbers.** Start every response with a one-sentence takeaway. "Traffic is up 23% week-over-week, driven by an organic search spike from your blog post" is better than listing raw numbers first.

**Structure every response as:**
1. **Headline insight** — one sentence, the most important thing
2. **Key numbers** — 3-5 metrics that matter, with period comparison (↑12%, ↓5%, →flat)
3. **Breakdown** — the supporting detail, only what's relevant
4. **What to watch / recommendation** — one actionable next step

**Formatting rules:**
- Use ↑ ↓ → arrows for trends, never write "increased" or "decreased"
- Percentages get one decimal place: 23.4%, not 23.4123%
- Round large numbers: "12.3K pageviews", not "12,347 pageviews"
- Bounce rate context: <30% is excellent, 30-50% is normal, 50-70% needs attention, >70% is a problem
- Duration context: >2min is strong engagement, 30s-2min is normal, <30s suggests content mismatch
- Always compare to previous period when comparison data exists. Skip comparison if previous period is zero.
- Use tables for >3 rows of data. Use bullet points for ≤3.
- Never dump raw JSON. Always interpret the data.
- If a metric is zero or data is missing, say so briefly and move on. Don't speculate.
- Country codes should be presented with their name: "US (United States)", "DE (Germany)".
- The user's current plan is "${PLAN}". If they try to use a Pro-only feature (funnels, alerts) on a free plan, mention the upgrade requirement clearly.
`.trim();

// ── Prompt: weekly_report ────────────────────────────

server.prompt(
  "weekly_report",
  "Generate a weekly analytics report summarizing traffic, top pages, referral sources, and geographic breakdown. Call this to get a comprehensive snapshot of the past 7 days compared to the prior week.",
  {},
  async () => {
    await ensureBootstrapped();
    return {
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `${RESPONSE_STYLE}

## Task: Weekly analytics report

Generate a comprehensive weekly report for project ${PROJECT_NAME} (${PROJECT_ID}). Follow these steps:

1. Call **get_overview** with period="7d" to get headline metrics and week-over-week comparison.
2. Call **get_top_pages** with period="7d" and limit=10 for the most visited pages.
3. Call **get_top_referrers** with period="7d" and limit=10 for traffic sources.
4. Call **get_countries** with period="7d" and limit=10 for geographic distribution.
5. Call **get_timeseries** with period="7d" for the daily traffic trend.

Then synthesize into a report with these sections:
- **This week at a glance**: headline metrics with ↑↓→ vs last week
- **Traffic trend**: describe the daily pattern, note any spikes or dips
- **Top pages**: which pages got the most traffic, any new entries vs typical
- **Traffic sources**: where visitors came from, any notable channel shifts
- **Geography**: where visitors are located, any surprising countries
- **One thing to watch**: the single most actionable insight from the data`,
        },
      },
    ],
    };
  },
);

// ── Prompt: traffic_diagnosis ────────────────────────

server.prompt(
  "traffic_diagnosis",
  "Diagnose why traffic changed. Investigates which channels, countries, devices, and pages are responsible for a traffic increase or decrease. Use when a metric moved unexpectedly.",
  {
    period: z.string().optional().describe('Period to investigate. Defaults to "7d". Use "30d" for longer-term shifts.'),
  },
  async ({ period }) => {
    await ensureBootstrapped();
    return {
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `${RESPONSE_STYLE}

## Task: Traffic diagnosis

Investigate what's driving traffic changes for project ${PROJECT_NAME} (${PROJECT_ID}) over ${period || "7d"}. Follow this diagnostic sequence:

1. Call **get_overview** with period="${period || "7d"}" — check which metrics changed vs the previous period. Identify the biggest mover (pageviews? visitors? bounce rate?).
2. Call **get_top_referrers** with period="${period || "7d"}" — see if a specific channel drove the change. Compare organic_search vs direct vs referral vs paid vs social.
3. Call **get_countries** with period="${period || "7d"}" — check if the change is concentrated in specific countries.
4. Call **get_devices** with period="${period || "7d"}" — check if it's a specific device type (mobile spike could mean social traffic).
5. Call **get_top_pages** with period="${period || "7d"}" — which pages are affected? Is it site-wide or concentrated on a few pages?
6. If a specific page stands out, call **get_overview** with that page's pathname filter to get its isolated metrics.

Present your diagnosis as:
- **What changed**: the primary metric shift, with magnitude
- **Root cause**: which dimension (channel, country, device, page) explains it
- **Evidence**: the specific numbers that support your conclusion
- **Recommendation**: what to do about it (or why it's fine)`,
        },
      },
    ],
    };
  },
);

// ── Prompt: conversion_audit ─────────────────────────

server.prompt(
  "conversion_audit",
  "Audit conversion performance by analyzing funnels and custom events. Identifies the biggest drop-off points and suggests where to focus optimization efforts.",
  {
    funnel_name: z.string().optional().describe("Specific funnel name to analyze. If omitted, analyzes all funnels."),
  },
  async ({ funnel_name }) => {
    await ensureBootstrapped();
    return {
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `${RESPONSE_STYLE}

## Task: Conversion audit

Analyze conversion performance for project ${PROJECT_NAME} (${PROJECT_ID}). Steps:

1. Call **get_funnel** with period="30d"${funnel_name ? ` and name="${funnel_name}"` : ""} to get funnel step-by-step conversion data.
2. Call **get_events** with period="30d" to see all custom event volumes.
3. For the funnel with the biggest drop-off, call **get_funnel** with cohort filters to segment:
   - Try device_type="mobile" vs device_type="desktop" — is mobile converting worse?
   - Try the top 2-3 countries from get_countries — is conversion country-dependent?
   - Try the top channels — does organic_search convert differently than direct?
4. Call **get_timeseries** for key conversion events to spot trend changes.

Present your audit as:
- **Conversion summary**: overall funnel performance, headline rate
- **Biggest drop-off**: which step loses the most users, with the exact numbers
- **Segment differences**: which cohorts convert better/worse and by how much
- **Top opportunity**: the single change most likely to improve conversion, and why`,
        },
      },
    ],
    };
  },
);

// ── Prompt: channel_breakdown ────────────────────────

server.prompt(
  "channel_breakdown",
  "Deep-dive into traffic channels to understand which sources drive real engagement vs just visits. Compares organic search, social, referral, direct, paid, and email traffic quality.",
  {
    period: z.string().optional().describe('Period to analyze. Defaults to "30d".'),
  },
  async ({ period }) => {
    await ensureBootstrapped();
    return {
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `${RESPONSE_STYLE}

## Task: Channel breakdown

Analyze traffic quality by channel for project ${PROJECT_NAME} (${PROJECT_ID}) over ${period || "30d"}. Steps:

1. Call **get_top_referrers** with period="${period || "30d"}" and limit=20 — get the full referrer picture.
2. For each major channel, call **get_overview** with the channel's typical utm_source to compare engagement:
   - What's the bounce rate per channel?
   - Which channels have the longest session duration?
3. Call **get_events** with period="${period || "30d"}" and utm_source filters for the top sources — which channels drive custom events (signups, clicks), not just pageviews?
4. Call **get_timeseries** for overall traffic, then note which referrers align with any spikes.

Present as:
- **Channel ranking**: table with each channel's visitors, pageviews, and engagement quality
- **Best quality traffic**: which channel sends visitors that actually engage
- **Volume vs quality**: flag any channels with high volume but low engagement (or vice versa)
- **Recommendation**: where to invest more effort based on the data`,
        },
      },
    ],
    };
  },
);

// ── Prompt: page_performance ─────────────────────────

server.prompt(
  "page_performance",
  "Deep-dive into a specific page's performance: traffic trends, referral sources, device breakdown, and engagement metrics. Use to understand how a single page is performing.",
  {
    pathname: z.string().describe('The page path to analyze (e.g. "/pricing", "/blog/my-post").'),
    period: z.string().optional().describe('Period to analyze. Defaults to "30d".'),
  },
  async ({ pathname, period }) => {
    await ensureBootstrapped();
    return {
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `${RESPONSE_STYLE}

## Task: Page performance deep-dive

Analyze the performance of page "${pathname}" for project ${PROJECT_NAME} (${PROJECT_ID}) over ${period || "30d"}. Steps:

1. Call **get_overview** with period="${period || "30d"}" and pathname="${pathname}" — get pageviews, visitors, bounce rate, avg duration for this specific page, plus comparison to prior period.
2. Call **get_timeseries** with period="${period || "30d"}" — overall traffic trend, then note where this page's traffic differs.
3. Call **get_top_referrers** with period="${period || "30d"}" and pathname="${pathname}" — where does this page's traffic come from specifically?
4. Call **get_countries** with period="${period || "30d"}" — context for who's visiting.
5. Call **get_devices** with period="${period || "30d"}" and group_by="device_type" — any mobile/desktop split issues for this page?
6. If relevant, call **get_events** with period="${period || "30d"}" — any custom events fired on this page?

Present as:
- **Page snapshot**: headline metrics with ↑↓→ vs prior period
- **Traffic trend**: how this page's traffic has moved over the period
- **Where visitors come from**: top referrers and channels for this specific page
- **Engagement quality**: bounce rate and duration vs site average (get the site average from overview without pathname filter)
- **Recommendation**: one thing to improve or investigate based on the data`,
        },
      },
    ],
    };
  },
);

// ── Start ────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
