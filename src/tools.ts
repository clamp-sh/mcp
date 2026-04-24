import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// ── Types ────────────────────────────────────────────

/**
 * A single project accessible by the current credential.
 */
export interface ClampProject {
  id: string;
  name: string;
  /** Plan of the owning org: "free" | "pro" | "growth". */
  plan: string;
}

/**
 * Per-session context passed to tool handlers. Lets each transport plug in
 * its own auth strategy while sharing the actual tool/prompt definitions.
 */
export interface ClampToolContext {
  /**
   * HTTP caller for the Clamp analytics API. The caller should add auth
   * headers and throw descriptive errors on non-2xx responses.
   */
  api: <T = unknown>(path: string, options?: RequestInit) => Promise<T>;
  /**
   * All projects the current credential can access. Length is 1 for
   * project-scoped credentials (stdio + API key) and N for org-scoped
   * credentials (remote MCP + OAuth). Tools auto-resolve when length is 1
   * and require `project_id` otherwise, returning a structured error that
   * lists the available projects so the agent can prompt the user.
   */
  projects: ClampProject[];
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

const DEVICE_TYPE_DESC = 'Device category. One of: "desktop", "mobile", "tablet".';

const REFERRER_HOST_DESC =
  'Filter by referrer hostname (e.g. "news.ycombinator.com", "twitter.com", "github.com"). Use this to see what traffic from a specific source did. Must match the value returned by referrers.top exactly (lowercase, no protocol or path).';

const UTM_MEDIUM_DESC = 'Filter by UTM medium (e.g. "cpc", "email", "social"). Case-sensitive.';
const UTM_CONTENT_DESC = 'Filter by UTM content (e.g. "hero-cta", "sidebar-banner"). Case-sensitive.';
const UTM_TERM_DESC = 'Filter by UTM term (e.g. "running+shoes"). Case-sensitive.';

const periodParam = z.string().optional().describe(PERIOD_DESC);
const limitParam = z.coerce.number().optional().describe(LIMIT_DESC);
const pathnameParam = z.string().optional().describe(PATHNAME_FILTER_DESC);
const utmSourceParam = z.string().optional().describe(UTM_SOURCE_DESC);
const utmMediumParam = z.string().optional().describe(UTM_MEDIUM_DESC);
const utmCampaignParam = z.string().optional().describe(UTM_CAMPAIGN_DESC);
const utmContentParam = z.string().optional().describe(UTM_CONTENT_DESC);
const utmTermParam = z.string().optional().describe(UTM_TERM_DESC);
const channelParam = z.string().optional().describe(CHANNEL_DESC);
const countryParam = z.string().optional().describe(COUNTRY_DESC);
const deviceTypeParam = z.string().optional().describe(DEVICE_TYPE_DESC);
const referrerHostParam = z.string().optional().describe(REFERRER_HOST_DESC);

const projectIdParam = z
  .string()
  .optional()
  .describe(
    'Target project ID (e.g. "proj_abc123"). Required when the credential has access to multiple projects. If omitted and only one project is accessible, that project is used automatically. Call `projects.list` to discover available project IDs.',
  );

/**
 * Shared filter fields accepted by every read tool. Callers spread this into
 * their tool schema. Keeps filter coverage consistent across the surface.
 */
const commonFilterShape = {
  pathname: pathnameParam,
  utm_source: utmSourceParam,
  utm_medium: utmMediumParam,
  utm_campaign: utmCampaignParam,
  utm_content: utmContentParam,
  utm_term: utmTermParam,
  referrer_host: referrerHostParam,
  country: countryParam,
  device_type: deviceTypeParam,
  channel: channelParam,
} as const;

/** Supported dimensions for the generic `traffic.breakdown` tool. */
const BREAKDOWN_DIMENSIONS = [
  "pathname",
  "entry_page",
  "exit_page",
  "referrer_host",
  "channel",
  "country",
  "region",
  "city",
  "device_type",
  "browser",
  "browser_version",
  "os",
  "os_version",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

// ── Helpers ──────────────────────────────────────────

function qs(params: Record<string, string | number | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== "");
  if (entries.length === 0) return "";
  return "?" + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString();
}

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

// ── Response style (used in prompts) ─────────────────

function responseStyle(): string {
  return `
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
- If a tool returns a \`plan_required\` error, explain that funnels and alerts require the Pro plan and mention the upgrade path.
`.trim();
}

// ── Registration ─────────────────────────────────────

/**
 * Register all Clamp analytics tools and prompts on an MCP server.
 * Call from any transport (stdio, HTTP) after resolving a project context.
 */
export function registerClampTools(server: McpServer, ctx: ClampToolContext): void {
  const { api, projects } = ctx;

  // ── Project resolution ─────────────────────────────
  type ResolvedProject = { projectId: string; projectName: string; plan: string };
  type ResolutionError = {
    isError: true;
    content: Array<{ type: "text"; text: string }>;
    structuredContent: {
      error: "project_required" | "project_not_found" | "no_projects";
      projects: Array<{ id: string; name: string }>;
    };
  };

  const projectList = () => projects.map((p) => ({ id: p.id, name: p.name }));

  function resolveProject(argId?: string): ResolvedProject | ResolutionError {
    if (argId) {
      const match = projects.find((p) => p.id === argId);
      if (!match) {
        const lines = projects.map((p) => `- ${p.name} (${p.id})`).join("\n");
        return {
          isError: true,
          content: [
            {
              type: "text",
              text:
                projects.length === 0
                  ? `Project "${argId}" not found. This credential has no accessible projects.`
                  : `Project "${argId}" not found or not accessible with this credential.\n\nAvailable projects:\n${lines}`,
            },
          ],
          structuredContent: { error: "project_not_found", projects: projectList() },
        };
      }
      return { projectId: match.id, projectName: match.name, plan: match.plan };
    }
    if (projects.length === 1) {
      const p = projects[0];
      return { projectId: p.id, projectName: p.name, plan: p.plan };
    }
    if (projects.length === 0) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: "This credential has no accessible projects. Create a project in the Clamp dashboard first.",
          },
        ],
        structuredContent: { error: "no_projects", projects: [] },
      };
    }
    const lines = projects.map((p) => `- ${p.name} (${p.id})`).join("\n");
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Multiple projects available. Specify \`project_id\` to continue.\n\nAvailable projects:\n${lines}`,
        },
      ],
      structuredContent: { error: "project_required", projects: projectList() },
    };
  }

  function isErr(r: ResolvedProject | ResolutionError): r is ResolutionError {
    return (r as ResolutionError).isError === true;
  }

  // ── Tool: projects.list ────────────────────────────
  server.tool(
    "projects.list",
    "List all projects this credential can access. Returns each project's id, name, and plan. Use to discover project IDs to pass as `project_id` in other tools. Most tools auto-resolve when only one project is available; call this when the user wants to see all projects or the agent needs to disambiguate.",
    {},
    { readOnlyHint: true },
    async () =>
      json({ projects: projects.map((p) => ({ id: p.id, name: p.name, plan: p.plan })) }),
  );

  // ── Tool: traffic.overview ─────────────────────────────
  server.tool(
    "traffic.overview",
    "Get a high-level overview of website analytics: total pageviews, unique visitors, sessions, bounce rate (%), and average session duration (seconds). Includes comparison with the previous period of the same length. Use this first to understand overall traffic before drilling into specifics.",
    { project_id: projectIdParam, period: periodParam, ...commonFilterShape },
    { readOnlyHint: true },
    async ({ project_id, ...rest }) => {
      const p = resolveProject(project_id);
      if (isErr(p)) return p;
      return json(await api(`/analytics/${p.projectId}/overview${qs(rest)}`));
    },
  );

  // ── Tool: pages.top ────────────────────────────
  server.tool(
    "pages.top",
    'Most visited pages ranked by pageviews. Returns pathname, pageview count, and unique visitors. **Use this for pathname totals.** Filter by referrer_host to see which pages a specific source landed on (e.g. what Hacker News visitors read). For entry/exit pages specifically, use traffic.breakdown with dimension="entry_page" or "exit_page".',
    { project_id: projectIdParam, period: periodParam, limit: limitParam, ...commonFilterShape },
    { readOnlyHint: true },
    async ({ project_id, ...rest }) => {
      const p = resolveProject(project_id);
      if (isErr(p)) return p;
      return json(await api(`/analytics/${p.projectId}/top-pages${qs(rest)}`));
    },
  );

  // ── Tool: referrers.top ────────────────────────
  server.tool(
    "referrers.top",
    'Top traffic sources (referrer hostnames) ranked by unique visitors. Returns referrer_host (e.g. "google.com"), channel ("direct", "organic_search", "organic_social", "paid", "email", "referral"), visitors, and pageviews. **Use this for referrer_host totals.** For channel totals alone use traffic.breakdown with dimension="channel". For UTM sources use traffic.breakdown with dimension="utm_source".',
    { project_id: projectIdParam, period: periodParam, limit: limitParam, ...commonFilterShape },
    { readOnlyHint: true },
    async ({ project_id, ...rest }) => {
      const p = resolveProject(project_id);
      if (isErr(p)) return p;
      return json(await api(`/analytics/${p.projectId}/top-referrers${qs(rest)}`));
    },
  );

  // ── Tool: countries.top ────────────────────────────
  server.tool(
    "countries.top",
    'Visitor counts by country. Returns ISO 3166-1 alpha-2 codes (e.g. "US", "GB", "DE") with unique visitors and pageviews. Sorted by visitors descending. **Use this for country totals.** For sub-country geography use cities.top, or traffic.breakdown with dimension="region".',
    { project_id: projectIdParam, period: periodParam, limit: limitParam, ...commonFilterShape },
    { readOnlyHint: true },
    async ({ project_id, ...rest }) => {
      const p = resolveProject(project_id);
      if (isErr(p)) return p;
      return json(await api(`/analytics/${p.projectId}/countries${qs(rest)}`));
    },
  );

  // ── Tool: cities.top ───────────────────────────────
  server.tool(
    "cities.top",
    'Visitor counts by city, with the ISO country code alongside each row. Optionally filter to one country. Sorted by visitors descending. **Use this for city totals.** For country totals use countries.top. For state/region use traffic.breakdown with dimension="region".',
    {
      project_id: projectIdParam,
      period: periodParam,
      limit: limitParam,
      country: z.string().max(2).optional().describe('Optional ISO country code to filter by (e.g. "US", "DE").'),
    },
    { readOnlyHint: true },
    async ({ project_id, period, limit, country }) => {
      const p = resolveProject(project_id);
      if (isErr(p)) return p;
      return json(await api(`/analytics/${p.projectId}/cities${qs({ period, limit, country })}`));
    },
  );

  // ── Tool: devices.top ──────────────────────────────
  server.tool(
    "devices.top",
    'Visitor breakdown by device type, browser, browser_version, OS, or os_version. Set group_by to choose which. **Use this for any device/browser/OS question** (including versions). For geography see countries.top/cities.top; for pages see pages.top; for everything else see traffic.breakdown.',
    {
      project_id: projectIdParam,
      period: periodParam,
      limit: limitParam,
      group_by: z
        .enum(["device_type", "browser", "browser_version", "os", "os_version"])
        .optional()
        .describe(
          'Dimension to group by. "device_type" returns desktop/mobile/tablet. "browser" returns Chrome/Firefox/etc. "browser_version" returns specific browser versions. "os" returns Windows/macOS/etc. "os_version" returns specific OS versions. Defaults to "device_type".',
        ),
      ...commonFilterShape,
    },
    { readOnlyHint: true },
    async ({ project_id, ...rest }) => {
      const p = resolveProject(project_id);
      if (isErr(p)) return p;
      return json(await api(`/analytics/${p.projectId}/devices${qs(rest)}`));
    },
  );

  // ── Tool: events.list ───────────────────────────────
  server.tool(
    "events.list",
    'Get custom event counts. Without a name filter, returns all event names with their total counts (excludes "pageview"). With a name filter, returns counts for that specific event. Supports filtering by a single custom property key/value pair and grouping by a property key. Custom events are tracked via clamp.track("event_name", { key: "value" }).',
    {
      project_id: projectIdParam,
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
      ...commonFilterShape,
    },
    { readOnlyHint: true },
    async ({ project_id, ...rest }) => {
      const p = resolveProject(project_id);
      if (isErr(p)) return p;
      return json(await api(`/analytics/${p.projectId}/events${qs(rest)}`));
    },
  );

  // ── Tool: revenue.sum ──────────────────────────────
  server.tool(
    "revenue.sum",
    'Sum revenue from Money-typed event properties. Returns per-currency totals, optionally grouped by a traffic dimension (source, channel, country, campaign, etc.). Use this to answer "which source generated the most revenue", "how much did we make from Google Ads last month", or "revenue by country". Different currencies are never mixed in a single sum. Money properties are tracked via clamp.track("purchase", { total: { amount: 29, currency: "USD" } }).',
    {
      project_id: projectIdParam,
      period: periodParam,
      event: z
        .string()
        .optional()
        .describe(
          'Filter to a specific event name (e.g. "purchase", "checkout_completed"). Omit to sum Money properties across all events.',
        ),
      property: z
        .string()
        .optional()
        .describe(
          'Restrict the sum to a single Money property key on the event (e.g. "total", "mrr", "ltv"). Omit to sum every Money-typed property on matched events.',
        ),
      group_by: z
        .enum([
          "referrer_host",
          "channel",
          "country",
          "device_type",
          "pathname",
          "utm_source",
          "utm_medium",
          "utm_campaign",
        ])
        .optional()
        .describe(
          'Group revenue by a traffic dimension. Returns one row per (dimension, currency) pair. Omit for a single total per currency.',
        ),
      limit: limitParam,
      ...commonFilterShape,
    },
    { readOnlyHint: true },
    async ({ project_id, ...rest }) => {
      const p = resolveProject(project_id);
      if (isErr(p)) return p;
      return json(await api(`/analytics/${p.projectId}/revenue${qs(rest)}`));
    },
  );

  // ── Tool: traffic.timeseries ───────────────────────────
  server.tool(
    "traffic.timeseries",
    "Get event counts over time as a series of date buckets. Granularity is automatic: hourly for ≤2 days, daily for ≤90 days, weekly for ≤365 days, monthly beyond. Returns [{ date, count }] array. Use to visualize trends and spot patterns. Can optionally specify a granularity override and filter to a specific event name.",
    {
      project_id: projectIdParam,
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
      ...commonFilterShape,
    },
    { readOnlyHint: true },
    async ({ project_id, ...rest }) => {
      const p = resolveProject(project_id);
      if (isErr(p)) return p;
      return json(await api(`/analytics/${p.projectId}/timeseries${qs(rest)}`));
    },
  );

  // ── Tool: funnels.create ────────────────────────────
  server.tool(
    "funnels.create",
    'Create and immediately evaluate a conversion funnel. A funnel tracks how many unique visitors complete a sequence of steps. Returns step-by-step counts, conversion rates, and overall conversion. Steps can be event names (e.g. "signup") or pageviews with a path (e.g. "pageview:/pricing"). The funnel is saved for later retrieval. Requires Pro plan.',
    {
      project_id: projectIdParam,
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
    { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    async ({ project_id, name, steps }) => {
      const p = resolveProject(project_id);
      if (isErr(p)) return p;
      const data = await api(`/analytics/${p.projectId}/funnels`, {
        method: "POST",
        body: JSON.stringify({ name, steps }),
      });
      return json(data);
    },
  );

  // ── Tool: funnels.get ───────────────────────────────
  server.tool(
    "funnels.get",
    "Retrieve and evaluate a previously created funnel. Re-evaluates against current data for the specified period. Supports cohort filters to analyze specific segments (e.g. mobile users from the US who came via organic search). If no name is specified, returns all funnels for the project.",
    {
      project_id: projectIdParam,
      name: z.string().optional().describe("The funnel name to retrieve. Omit to list all funnels for the project."),
      period: periodParam,
      ...commonFilterShape,
    },
    { readOnlyHint: true },
    async ({ project_id, ...rest }) => {
      const p = resolveProject(project_id);
      if (isErr(p)) return p;
      return json(await api(`/analytics/${p.projectId}/funnels${qs(rest)}`));
    },
  );

  // ── Tool: alerts.create ─────────────────────────────
  server.tool(
    "alerts.create",
    "Create a metric alert that triggers when a condition is met. The alert monitors a specific metric over a period and fires when it crosses the threshold. Evaluated on each MCP session connect. Requires Pro plan.",
    {
      project_id: projectIdParam,
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
        .describe(
          'Evaluation window. Use "7d", "30d", etc. Defaults to "7d". Compared against the previous period of the same length.',
        ),
      pathname: z
        .string()
        .optional()
        .describe('Scope the alert to a specific page path (e.g. "/pricing"). Omit to monitor all pages.'),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    async ({ project_id, metric, condition, threshold, period, pathname }) => {
      const p = resolveProject(project_id);
      if (isErr(p)) return p;
      const data = await api(`/analytics/${p.projectId}/alerts`, {
        method: "POST",
        body: JSON.stringify({ metric, condition, threshold, period, pathname }),
      });
      return json(data);
    },
  );

  // ── Tool: alerts.list ──────────────────────────────
  server.tool(
    "alerts.list",
    "List all alerts for a project. Returns each alert's id, metric, condition, threshold, period, pathname, and created_at. Use before alerts.delete to find the alert id, or to show the user what alerts are currently configured.",
    { project_id: projectIdParam },
    { readOnlyHint: true },
    async ({ project_id }) => {
      const p = resolveProject(project_id);
      if (isErr(p)) return p;
      return json(await api(`/analytics/${p.projectId}/alerts`));
    },
  );

  // ── Tool: alerts.delete ─────────────────────────────
  server.tool(
    "alerts.delete",
    "Delete an alert by its id. Call alerts.list first to find the id. Irreversible.",
    {
      project_id: projectIdParam,
      alert_id: z.string().min(1).describe("The alert id (UUID) to delete. Get this from alerts.list."),
    },
    { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    async ({ project_id, alert_id }) => {
      const p = resolveProject(project_id);
      if (isErr(p)) return p;
      return json(
        await api(`/analytics/${p.projectId}/alerts/${encodeURIComponent(alert_id)}`, {
          method: "DELETE",
        }),
      );
    },
  );

  // ── Tool: traffic.breakdown ────────────────────────────
  server.tool(
    "traffic.breakdown",
    'Generic single-dimension breakdown of pageviews and unique visitors. **Prefer a specialized tool when one exists:** pages.top (pathname), referrers.top (referrer_host), countries.top (country), cities.top (city), devices.top (device_type/browser/os and their versions). Use traffic.breakdown for the remaining dimensions: entry_page, exit_page, region, channel, utm_source, utm_medium, utm_campaign, utm_content, utm_term.',
    {
      project_id: projectIdParam,
      dimension: z
        .enum(BREAKDOWN_DIMENSIONS)
        .describe("The dimension to break down by. See description for the full list."),
      period: periodParam,
      limit: limitParam,
      ...commonFilterShape,
    },
    { readOnlyHint: true },
    async ({ project_id, ...rest }) => {
      const p = resolveProject(project_id);
      if (isErr(p)) return p;
      return json(await api(`/analytics/${p.projectId}/breakdown${qs(rest)}`));
    },
  );

  // ── Tool: traffic.compare ──────────────────────────
  server.tool(
    "traffic.compare",
    "Compare one metric across two arbitrary time periods side-by-side. Returns both values plus absolute and percentage delta. Use when the user asks about month-over-month, or comparing a promo week vs a baseline week.",
    {
      project_id: projectIdParam,
      metric: z
        .enum(["pageviews", "visitors", "sessions", "bounce_rate", "avg_duration"])
        .describe("The metric to compare."),
      a: z
        .string()
        .describe(
          'First period. Use "today", "yesterday", "7d", "30d", "90d", or a custom range "YYYY-MM-DD:YYYY-MM-DD".',
        ),
      b: z.string().describe("Second period. Same format as `a`."),
      ...commonFilterShape,
    },
    { readOnlyHint: true },
    async ({ project_id, ...rest }) => {
      const p = resolveProject(project_id);
      if (isErr(p)) return p;
      return json(await api(`/analytics/${p.projectId}/compare${qs(rest)}`));
    },
  );

  // ── Tool: sessions.paths ────────────────────────
  server.tool(
    "sessions.paths",
    'Aggregate session paths. Returns the top (entry_page → exit_page) pairs with how many sessions followed that path, average pages per session, average duration in seconds, and a bounce flag. Use this to answer "what do visitors actually do after landing on X", "where do sessions end", or "which entry pages lead to the deepest engagement". Aggregate-only; no per-user traces.',
    {
      project_id: projectIdParam,
      period: periodParam,
      limit: limitParam,
      min_pages: z
        .coerce.number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Minimum pageviews in a session to include it. Defaults to 1 (include bounces). Set to 2 to exclude single-page sessions."),
      ...commonFilterShape,
    },
    { readOnlyHint: true },
    async ({ project_id, ...rest }) => {
      const p = resolveProject(project_id);
      if (isErr(p)) return p;
      return json(await api(`/analytics/${p.projectId}/session-paths${qs(rest)}`));
    },
  );

  // ── Tool: pages.engagement ──────────────────────
  server.tool(
    "pages.engagement",
    'Per-page engagement metrics. Returns pathname, pageviews, unique visitors, average engagement seconds (active tab time), and bounce rate (% of sessions that entered on this page and left after one pageview). Use this to answer "which pages hold attention", "which pages bounce", or "are people actually reading the blog". Engagement data comes from the SDK\'s pageview_end beacon; pages with no engagement data return null for avg_engagement_seconds.',
    {
      project_id: projectIdParam,
      period: periodParam,
      limit: limitParam,
      ...commonFilterShape,
    },
    { readOnlyHint: true },
    async ({ project_id, ...rest }) => {
      const p = resolveProject(project_id);
      if (isErr(p)) return p;
      return json(await api(`/analytics/${p.projectId}/engagement${qs(rest)}`));
    },
  );

  // ── Tool: traffic.live ─────────────────────
  server.tool(
    "traffic.live",
    "Who's on the site right now. Returns visitor count plus top pages, referrers, and countries in the last N minutes (default 5).",
    {
      project_id: projectIdParam,
      window_minutes: z.coerce
        .number()
        .int()
        .min(1)
        .max(60)
        .optional()
        .describe("Lookback window in minutes. Defaults to 5, max 60."),
    },
    { readOnlyHint: true },
    async ({ project_id, window_minutes }) => {
      const p = resolveProject(project_id);
      if (isErr(p)) return p;
      return json(await api(`/analytics/${p.projectId}/realtime${qs({ window_minutes })}`));
    },
  );

  // ── Tool: docs.search ──────────────────────────────
  const searchDocsDescription =
    "Search the Clamp documentation for setup, SDK, and MCP help. Use when the user asks how to do something rather than what their data shows.";
  const searchDocsSchema = {
    query: z.string().min(1).max(200).describe("Search query."),
    limit: z.coerce.number().int().min(1).max(10).optional().describe("Max results. Defaults to 5."),
  };
  const searchDocsHandler = async ({ query, limit }: { query: string; limit?: number }) => {
      const DOCS = [
        { url: "https://clamp.sh/docs", title: "Documentation home", desc: "Start here. Overview of SDK, MCP, and dashboard." },
        { url: "https://clamp.sh/docs/sdk", title: "SDK overview", desc: "Install, quickstart, and links to tracking, server, extensions, and API reference." },
        { url: "https://clamp.sh/docs/sdk/tracking", title: "SDK tracking", desc: "What's captured automatically, custom events, typed events, Money properties, and property limits." },
        { url: "https://clamp.sh/docs/sdk/server", title: "SDK server-side", desc: "Track from Node.js. Link browser and server events with an anonymous ID. Authoritative revenue from webhooks." },
        { url: "https://clamp.sh/docs/sdk/extensions", title: "SDK extensions", desc: "Outbound links, downloads, 404s, web vitals, and HTML data attributes for no-code events." },
        { url: "https://clamp.sh/docs/sdk/reference", title: "SDK API reference", desc: "Every export from browser, React, and server packages. Types and script-tag build." },
        { url: "https://clamp.sh/docs/concepts/events", title: "Events", desc: "Pageviews, custom events, event shape, property rules, naming." },
        { url: "https://clamp.sh/docs/concepts/properties", title: "Properties", desc: "Property shape, limits, typed events, Money values, naming conventions." },
        { url: "https://clamp.sh/docs/concepts/revenue", title: "Revenue", desc: "Attach Money-typed properties and query revenue by source, country, campaign with revenue.sum. Refunds, mixed currencies." },
        { url: "https://clamp.sh/docs/concepts/engagement", title: "Engagement and sessions", desc: "How visible time is measured, pageview_end beacon, bounce rate, pages.engagement, sessions.paths." },
        { url: "https://clamp.sh/docs/concepts/funnels", title: "Funnels", desc: "Create and evaluate multi-step conversion funnels. Pro plan." },
        { url: "https://clamp.sh/docs/mcp", title: "MCP overview", desc: "What the MCP server does, remote vs stdio, and links to setup, tools, prompts, examples." },
        { url: "https://clamp.sh/docs/mcp/setup", title: "MCP setup", desc: "One-click install the remote MCP in Cursor, VS Code, Claude Code, Claude Desktop. OAuth sign-in on first use." },
        { url: "https://clamp.sh/docs/mcp/tools", title: "MCP tools reference", desc: "Every tool grouped by what it does: traffic, audience, events, sessions, funnels, alerts, meta." },
        { url: "https://clamp.sh/docs/mcp/prompts", title: "MCP prompts", desc: "Pre-built analytics workflows: weekly report, traffic diagnosis, conversion audit, channel breakdown, page performance." },
        { url: "https://clamp.sh/docs/mcp/examples", title: "MCP examples", desc: "Real questions and the tool calls they produce for traffic, revenue, engagement, funnels." },
        { url: "https://clamp.sh/docs/mcp/self-hosting", title: "MCP self-hosting", desc: "Run the Clamp MCP locally over stdio with a project API key. For CI, headless agents, and self-hosted Clamp." },
        { url: "https://clamp.sh/docs/install", title: "Install guides", desc: "Framework-specific install guides. Pick yours below for a copy-pasteable snippet." },
        { url: "https://clamp.sh/docs/install/nextjs", title: "Next.js install", desc: "Next.js app router and pages router setup." },
        { url: "https://clamp.sh/docs/install/vite-react", title: "Vite + React install", desc: "React SPA setup with Vite." },
        { url: "https://clamp.sh/docs/install/sveltekit", title: "SvelteKit install", desc: "SvelteKit setup." },
        { url: "https://clamp.sh/docs/install/nuxt", title: "Nuxt install", desc: "Nuxt 3 setup." },
        { url: "https://clamp.sh/docs/install/astro", title: "Astro install", desc: "Astro setup." },
      ];
      const q = query.toLowerCase();
      const terms = q.split(/\s+/).filter(Boolean);
      const scored = DOCS.map((d) => {
        const title = d.title.toLowerCase();
        const hay = `${title} ${d.desc.toLowerCase()}`;
        let score = 0;
        for (const term of terms) {
          if (title.includes(term)) score += 3;
          if (hay.includes(term)) score += 1;
        }
        return { ...d, score };
      })
        .filter((d) => d.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit ?? 5)
        .map(({ score: _s, ...rest }) => rest);
      return json({ query, results: scored });
  };
  server.tool("docs.search", searchDocsDescription, searchDocsSchema, { readOnlyHint: true }, searchDocsHandler);

  // ── Prompts ────────────────────────────────────────
  const style = responseStyle();
  const scopeHint =
    projects.length === 1
      ? `Target project: ${projects[0].name} (${projects[0].id}).`
      : projects.length === 0
        ? "No projects are accessible with this credential."
        : `Multiple projects available. If the user did not specify which one, ask them, or call projects.list to show the options. Pass the chosen \`project_id\` to every tool call.`;

  server.prompt(
    "weekly_report",
    "Generate a weekly analytics report summarizing traffic, top pages, referral sources, and geographic breakdown. Call this to get a comprehensive snapshot of the past 7 days compared to the prior week.",
    {},
    async () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `${style}

## Task: Weekly analytics report

${scopeHint}

Generate a comprehensive weekly report. Follow these steps:

1. Call **traffic.overview** with period="7d" to get headline metrics and week-over-week comparison.
2. Call **pages.top** with period="7d" and limit=10 for the most visited pages.
3. Call **referrers.top** with period="7d" and limit=10 for traffic sources.
4. Call **countries.top** with period="7d" and limit=10 for geographic distribution.
5. Call **traffic.timeseries** with period="7d" for the daily traffic trend.

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
    }),
  );

  server.prompt(
    "traffic_diagnosis",
    "Diagnose why traffic changed. Investigates which channels, countries, devices, and pages are responsible for a traffic increase or decrease. Use when a metric moved unexpectedly.",
    {
      period: z.string().optional().describe('Period to investigate. Defaults to "7d". Use "30d" for longer-term shifts.'),
    },
    async ({ period }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `${style}

## Task: Traffic diagnosis

${scopeHint}

Investigate what's driving traffic changes over ${period || "7d"}. Follow this diagnostic sequence:

1. Call **traffic.overview** with period="${period || "7d"}" — check which metrics changed vs the previous period. Identify the biggest mover (pageviews? visitors? bounce rate?).
2. Call **referrers.top** with period="${period || "7d"}" — see if a specific channel drove the change. Compare organic_search vs direct vs referral vs paid vs social.
3. Call **countries.top** with period="${period || "7d"}" — check if the change is concentrated in specific countries.
4. Call **devices.top** with period="${period || "7d"}" — check if it's a specific device type (mobile spike could mean social traffic).
5. Call **pages.top** with period="${period || "7d"}" — which pages are affected? Is it site-wide or concentrated on a few pages?
6. If a specific page stands out, call **traffic.overview** with that page's pathname filter to get its isolated metrics.

Present your diagnosis as:
- **What changed**: the primary metric shift, with magnitude
- **Root cause**: which dimension (channel, country, device, page) explains it
- **Evidence**: the specific numbers that support your conclusion
- **Recommendation**: what to do about it (or why it's fine)`,
          },
        },
      ],
    }),
  );

  server.prompt(
    "conversion_audit",
    "Audit conversion performance by analyzing funnels and custom events. Identifies the biggest drop-off points and suggests where to focus optimization efforts.",
    {
      funnel_name: z.string().optional().describe("Specific funnel name to analyze. If omitted, analyzes all funnels."),
    },
    async ({ funnel_name }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `${style}

## Task: Conversion audit

${scopeHint}

Analyze conversion performance. Steps:

1. Call **funnels.get** with period="30d"${funnel_name ? ` and name="${funnel_name}"` : ""} to get funnel step-by-step conversion data.
2. Call **events.list** with period="30d" to see all custom event volumes.
3. For the funnel with the biggest drop-off, call **funnels.get** with cohort filters to segment:
   - Try device_type="mobile" vs device_type="desktop" — is mobile converting worse?
   - Try the top 2-3 countries from countries.top — is conversion country-dependent?
   - Try the top channels — does organic_search convert differently than direct?
4. Call **traffic.timeseries** for key conversion events to spot trend changes.

Present your audit as:
- **Conversion summary**: overall funnel performance, headline rate
- **Biggest drop-off**: which step loses the most users, with the exact numbers
- **Segment differences**: which cohorts convert better/worse and by how much
- **Top opportunity**: the single change most likely to improve conversion, and why`,
          },
        },
      ],
    }),
  );

  server.prompt(
    "channel_breakdown",
    "Deep-dive into traffic channels to understand which sources drive real engagement vs just visits. Compares organic search, social, referral, direct, paid, and email traffic quality.",
    { period: z.string().optional().describe('Period to analyze. Defaults to "30d".') },
    async ({ period }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `${style}

## Task: Channel breakdown

${scopeHint}

Analyze traffic quality by channel over ${period || "30d"}. Steps:

1. Call **referrers.top** with period="${period || "30d"}" and limit=20 — get the full referrer picture.
2. For each major channel, call **traffic.overview** with the channel's typical utm_source to compare engagement:
   - What's the bounce rate per channel?
   - Which channels have the longest session duration?
3. Call **events.list** with period="${period || "30d"}" and utm_source filters for the top sources — which channels drive custom events (signups, clicks), not just pageviews?
4. Call **traffic.timeseries** for overall traffic, then note which referrers align with any spikes.

Present as:
- **Channel ranking**: table with each channel's visitors, pageviews, and engagement quality
- **Best quality traffic**: which channel sends visitors that actually engage
- **Volume vs quality**: flag any channels with high volume but low engagement (or vice versa)
- **Recommendation**: where to invest more effort based on the data`,
          },
        },
      ],
    }),
  );

  server.prompt(
    "page_performance",
    "Deep-dive into a specific page's performance: traffic trends, referral sources, device breakdown, and engagement metrics. Use to understand how a single page is performing.",
    {
      pathname: z.string().describe('The page path to analyze (e.g. "/pricing", "/blog/my-post").'),
      period: z.string().optional().describe('Period to analyze. Defaults to "30d".'),
    },
    async ({ pathname, period }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `${style}

## Task: Page performance deep-dive

${scopeHint}

Analyze the performance of page "${pathname}" over ${period || "30d"}. Steps:

1. Call **traffic.overview** with period="${period || "30d"}" and pathname="${pathname}" — get pageviews, visitors, bounce rate, avg duration for this specific page, plus comparison to prior period.
2. Call **traffic.timeseries** with period="${period || "30d"}" — overall traffic trend, then note where this page's traffic differs.
3. Call **referrers.top** with period="${period || "30d"}" and pathname="${pathname}" — where does this page's traffic come from specifically?
4. Call **countries.top** with period="${period || "30d"}" — context for who's visiting.
5. Call **devices.top** with period="${period || "30d"}" and group_by="device_type" — any mobile/desktop split issues for this page?
6. If relevant, call **events.list** with period="${period || "30d"}" — any custom events fired on this page?

Present as:
- **Page snapshot**: headline metrics with ↑↓→ vs prior period
- **Traffic trend**: how this page's traffic has moved over the period
- **Where visitors come from**: top referrers and channels for this specific page
- **Engagement quality**: bounce rate and duration vs site average (get the site average from overview without pathname filter)
- **Recommendation**: one thing to improve or investigate based on the data`,
          },
        },
      ],
    }),
  );
}
