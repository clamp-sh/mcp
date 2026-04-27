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
  'Filter by referrer hostname (e.g. "news.ycombinator.com", "twitter.com", "github.com"). Use this to see what traffic from a specific source did. Must match the value returned by `breakdown(dimension="referrer_host")` exactly (lowercase, no protocol or path).';

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

/** Supported dimensions for the generic `breakdown` tool. */
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
    `List all Clamp projects this credential can access. Returns each project's id, name, and plan ('free', 'pro', or 'growth'). Use this when the user asks "which sites do you see" or when the agent needs a project_id to disambiguate before calling another tool — most other tools auto-resolve when the credential has access to exactly one project, so explicit calls are only needed for multi-project setups.

Examples:
- "which sites are tracked" → projects.list
- before drilling into a specific project's data when several exist

Limitations: returns an empty array if the credential is org-scoped but has no projects yet. The plan field is the current billing plan, not a permission level.`,
    {},
    { readOnlyHint: true },
    async () =>
      json({ projects: projects.map((p) => ({ id: p.id, name: p.name, plan: p.plan })) }),
  );

  // ── Tool: traffic.overview ─────────────────────────────
  server.tool(
    "traffic.overview",
    `High-level snapshot of website traffic over a period: total pageviews, unique visitors, sessions, bounce rate (%), and average session duration (seconds). Always includes a comparison block with the same metrics for the previous period of equal length plus the absolute and percentage delta. Use this as the first call when the user asks how the site is doing, before drilling into channels, pages, or funnels.

Examples:
- "how is traffic this week" → period="7d"
- "overview for last month" → period="30d"
- "organic search performance this quarter" → period="90d", channel="organic_search"

Limitations: bounce_rate and avg_duration are derived from the SDK's pageview_end beacon — for SDK <0.3 they return null. Custom date ranges must be in YYYY-MM-DD:YYYY-MM-DD format. Maximum range is 365 days.`,
    { project_id: projectIdParam, period: periodParam, ...commonFilterShape },
    { readOnlyHint: true },
    async ({ project_id, ...rest }) => {
      const p = resolveProject(project_id);
      if (isErr(p)) return p;
      return json(await api(`/analytics/${p.projectId}/overview${qs(rest)}`));
    },
  );

  // ── Tool: events.list ───────────────────────────────
  server.tool(
    "events.list",
    `Get custom event counts. Without a \`name\` filter, returns every event name in the period with its total count and unique-visitor count (excludes "pageview" and the SDK-internal "pageview_end"). With a \`name\` filter, returns the count for that single event, optionally filtered by a custom property key/value pair and grouped by another property key. Custom events are tracked client-side via clamp.track("event_name", { key: "value" }) or server-side via @clamp-sh/analytics/server.

Property values can be strings, numbers, or booleans (each stored in a separate column). When filtering or grouping by a numeric or boolean property, set \`value_type\` / \`group_by_type\` so the lookup hits the right column — otherwise the default ("string") will silently miss native number/boolean data. Use the project's \`event-schema.yaml\` to know each property's type.

Examples:
- "what events are being tracked" → no params (lists all event names)
- "how many signups this week" → name="signup", period="7d"
- "signups grouped by plan" → name="signup", group_by="plan"
- "paid signups only" → name="signup", property="plan", value="pro"
- "checkouts where item count was 5" → name="checkout", property="count", value="5", value_type="number"
- "events grouped by a numeric tier_id" → name="upgrade", group_by="tier_id", group_by_type="number"

Limitations: only one property/value pair per call. group_by only works when a name filter is set. Returns at most \`limit\` rows per group (default 10, max 50). For revenue use revenue.sum, which understands the Money type.`,
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
          'Filter to events where the property key equals this value. Must be used together with the "property" parameter. Pass the value as a string regardless of underlying type; combine with "value_type" for numbers/booleans.',
        ),
      value_type: z
        .enum(["string", "number", "boolean"])
        .optional()
        .describe(
          'Type of the value being filtered. Defaults to "string". Set to "number" or "boolean" when the property is declared as such in event-schema.yaml — otherwise the lookup hits the wrong column and returns no matches.',
        ),
      group_by: z
        .string()
        .optional()
        .describe(
          'Group results by this custom property key (e.g. "plan" to see signups broken down by plan). Returns each unique value with its count. Must be used with a name filter.',
        ),
      group_by_type: z
        .enum(["string", "number", "boolean"])
        .optional()
        .describe(
          'Type of the group_by property. Defaults to "string". Set to "number"/"boolean" for numeric/boolean properties; results come back stringified ("5", "true") for transport.',
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
    `Sum revenue from Money-typed event properties. Returns per-currency totals, optionally grouped by a traffic dimension (referrer_host, channel, country, device_type, pathname, utm_source/medium/campaign). Different currencies are never mixed in a single sum — each row is one (group, currency) pair. Money properties are tracked via clamp.track("purchase", { total: { amount: 29, currency: "USD" } }) — see /docs/concepts/revenue for the full Money type.

Examples:
- "total revenue this month" → no group_by, period="30d"
- "revenue by channel" → group_by="channel", period="30d"
- "how much did Stripe purchases bring in from organic search" → event="purchase", channel="organic_search"
- "top revenue countries" → group_by="country"

Limitations: events without any Money property contribute zero. If \`property\` is set, only that one Money key is summed; omitted, every Money property on matched events is included. Stripe-typed revenue (recommended) flows through server-side webhooks; client-only revenue is subject to ad-blocker loss.`,
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
    `Event counts over time as date buckets. Returns [{ date, count }] sorted ascending. Granularity is automatic based on period length (hourly for ≤2 days, daily for ≤90 days, weekly for ≤365 days, monthly beyond) and can be overridden via \`granularity\`. Filterable to a specific event name (defaults to "pageview") and a single custom property key/value pair.

Examples:
- "pageview trend last week" → period="7d"
- "signups per day this month" → event="signup", period="30d", granularity="day"
- "hourly pageviews yesterday" → period="1d", granularity="hour"

Limitations: forcing granularity="hour" over a 90-day period produces hundreds of buckets and may be truncated server-side. Buckets with no matching events return zero (the series does not skip missing dates).`,
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
    `Create and immediately evaluate a conversion funnel. A funnel measures how many unique visitors complete an ordered sequence of steps. Returns step-by-step counts, per-step conversion rates (vs the previous step), and overall conversion (last step / first step). The funnel is saved by name and can be re-evaluated later or for different periods via funnels.get.

Step format: a custom event name like "signup", a pathname-scoped pageview like "pageview:/pricing", and optionally one or more property predicates appended in brackets — "cta_click[location=hero_primary]" matches only cta_click events whose location property equals "hero_primary". Stack predicates to AND them: "cta_click[location=hero_primary][plan=pro]". Predicates work on pageview steps too: "pageview:/pricing[utm_source=google]". Requires Pro plan.

Predicates default to string-typed comparisons (the property is read from the string column). For number- or boolean-typed properties (declared as such in event-schema.yaml), append a type tag: "purchase[count:n=5]" matches numeric 5; "checkout[refunded:b=false]" matches boolean false; "purchase[plan:s=5]" forces string matching when the value looks numeric. Tags: ":n" number, ":b" boolean (true|false|1|0), ":s" string (default).

Examples:
- pricing-to-signup → name="pricing-to-signup", steps=["pageview:/pricing", "signup"]
- which CTA actually converts → name="hero-cta-funnel", steps=["cta_click[location=hero_primary]", "signup_completed"]
- onboarding flow → name="onboarding", steps=["signup", "onboarding_started", "onboarding_completed", "first_purchase"]
- multi-item checkouts only → name="multi-item-checkout", steps=["pageview:/cart", "checkout_completed[items:n=3]"]
- non-refunded purchases → name="purchase-net", steps=["pageview:/pricing", "purchase[refunded:b=false]"]
- blog-to-newsletter → name="blog-newsletter", steps=["pageview:/blog", "newsletter_subscribed"]

Limitations: between 2 and 10 steps; step strings ≤500 chars; names ≤200 chars. Step order matters — once a session skips a step, it cannot complete later steps. Pageview pathnames match exact strings only (no wildcards). Predicate keys must be snake_case; string values may not contain ']' or '['. Number predicates require a finite value; boolean predicates require true|false|1|0. Funnel evaluation is per-session, not per-user across devices.`,
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
          'Ordered array of 2-10 funnel steps. Each step: a custom event name ("signup"), a pathname-scoped pageview ("pageview:/pricing"), or either form with property predicates appended in brackets ("cta_click[location=hero_primary]", "pageview:/pricing[utm_source=google]"). Stack predicates to AND them: "cta_click[location=hero_primary][plan=pro]". Predicates default to string matching; append ":n" for number ("checkout[items:n=3]"), ":b" for boolean ("purchase[refunded:b=false]"), or ":s" to force string when the value looks numeric ("plan:s=5").',
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
    `Retrieve and re-evaluate a previously created funnel against current data for the specified period. Without a \`name\`, lists all funnels saved for the project. With a \`name\`, returns the same step-by-step counts and conversion rates as funnels.create, recomputed for the requested period and any cohort filters. Cohort filters (channel, country, device_type, utm_*) let you compare conversion across segments — e.g. mobile users from the US who came via organic search.

Examples:
- list all funnels → no params
- "how is pricing-to-signup converting this month" → name="pricing-to-signup", period="30d"
- "mobile conversion for onboarding" → name="onboarding", device_type="mobile"
- "paid traffic vs organic conversion" → call twice with channel="paid" then channel="organic_search"

Limitations: returns 404 if no funnel exists by that name — call funnels.get with no name first to enumerate. Cohort filters apply at the session level, not retroactively per step. Funnel definitions are immutable after creation (re-create with a new name to change steps).`,
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
    `Create a metric alert that fires when a condition crosses its threshold. The alert monitors one metric (pageviews, visitors, sessions, bounce_rate, or avg_duration) over a rolling period and is re-evaluated every time an MCP session connects — alerts surface in-thread when the agent next checks, not as background pushes. Use to set lightweight monitoring like "alert me if pricing pageviews drop 50% week-over-week" or "alert me if bounce rate exceeds 70%". Requires Pro plan.

Examples:
- pricing pageview drop → metric="pageviews", condition="drops_by", threshold=50, pathname="/pricing"
- bounce rate ceiling → metric="bounce_rate", condition="above", threshold=70, period="7d"
- traffic surge → metric="visitors", condition="increases_by", threshold=100, period="1d"
- minimum-floor → metric="sessions", condition="below", threshold=100, period="1d"

Limitations: evaluation is on MCP session connect, not background — there are no push notifications, emails, or webhooks. Threshold for above/below is the absolute metric value; for drops_by/increases_by it is the percentage change vs the previous period of the same length. One alert per call — create multiple alerts for multiple conditions.`,
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
    `List all alerts configured for a project. Returns each alert's id (UUID), metric, condition, threshold, period, optional pathname scope, and created_at timestamp. Use before alerts.delete to find the id you want to remove, or to show the user every monitor currently active. Returns an empty array if no alerts have been created yet.

Examples:
- "what alerts do I have" → no extra params beyond project_id
- before deleting → call alerts.list, locate the id, pass it to alerts.delete

Limitations: alert state (currently firing vs not) is not included — that surfaces only when the alert is re-evaluated on MCP session connect. There is no pagination; projects with many alerts return all of them in one response.`,
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
    `Delete an alert by its id. Find the id by calling alerts.list first. The deletion is irreversible — there is no soft-delete or undo, and the agent should confirm intent with the user before calling this on a non-trivial alert. Returns 404 if no alert with that id exists for the project.

Examples:
- "remove the pricing alert" → alerts.list to find the matching id, then alerts.delete with that id
- "clear all alerts" → alerts.list, then alerts.delete for each id

Limitations: irreversible. Does not return the deleted alert's prior configuration — capture it from alerts.list first if you may need to recreate it. The alert_id must be the UUID returned by alerts.list, not a metric name.`,
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

  // ── Tool: breakdown ────────────────────────────────
  server.tool(
    "breakdown",
    `Aggregate visitors and pageviews grouped by a single dimension. The \`dimension\` parameter chooses what to group by — page paths, traffic sources, geography, devices, or marketing attribution. Results are sorted by visitors descending and capped by \`limit\` (default 10, max 50). Some dimensions return additional joined columns: dimension="referrer_host" includes the channel for each referrer; dimension="city" includes the ISO country code. All other dimensions return only {name, pageviews, visitors}. Filters narrow the set before aggregation.

Examples:
- "top pages last week" → dimension="pathname", period="7d"
- "who is sending traffic" → dimension="referrer_host"
- "mobile vs desktop split" → dimension="device_type"
- "best UTM campaigns" → dimension="utm_campaign"
- "top cities in Germany" → dimension="city", country="DE"
- "browser version distribution" → dimension="browser_version"

Limitations: aggregates pageview events only — for custom event breakdowns use events.list with \`group_by\`. The \`name\` column is the raw stored value (lowercase ISO codes for country, exact pathname strings including trailing slash). Per-page time-on-page or bounce rate is not included here — use pages.engagement for that.`,
    {
      project_id: projectIdParam,
      dimension: z
        .enum(BREAKDOWN_DIMENSIONS)
        .describe(
          'What to group by. Page paths: "pathname", "entry_page", "exit_page". Traffic sources: "referrer_host" (returns channel too), "channel", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term". Geography: "country", "region", "city" (returns country too). Devices: "device_type", "browser", "browser_version", "os", "os_version".',
        ),
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
    `Compare one metric across two arbitrary periods side-by-side. Returns both period values plus absolute delta and percentage delta. Periods do not need to be the same length — the percentage delta normalizes by ratio so longer/shorter comparisons remain meaningful. Use when the user asks month-over-month, before-vs-after-launch, or "how does this week compare to last".

Examples:
- "this month vs last month" → metric="visitors", a="2026-04-01:2026-04-25", b="2026-03-01:2026-03-31"
- "is /pricing converting better since the redesign" → metric="pageviews", a="2026-04-16:2026-04-25", b="2026-04-01:2026-04-15", pathname="/pricing"

Limitations: one metric per call — for multi-metric comparison either call repeatedly or use traffic.overview (which always includes the previous period). Period strings must be a preset ("today", "yesterday", "7d", "30d", "90d") or a YYYY-MM-DD:YYYY-MM-DD range; relative phrases like "last quarter" are not parsed.`,
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
    `Aggregate (entry_page → exit_page) session pairs. Returns the top pairs with how many sessions followed each path, average pages per session, average duration in seconds, and a bounce flag. Use to answer "what do visitors do after landing on /pricing", "where do sessions end", or "which entry pages lead to the deepest engagement". Aggregate-only — no per-user traces, no full pageview chains, no individual session reconstruction.

Examples:
- "top entry → exit pairs last week" → period="7d"
- "longest sessions starting from the blog" → pathname="/blog", min_pages=3
- "where do paid-traffic visitors end up" → channel="paid"

Limitations: shows entry and exit only, not the full pageview chain in between (use events.list for granular event analysis). min_pages=1 (default) includes single-page sessions which always show as bounces; set min_pages=2 to exclude them. Sessions ending without a pageview_end beacon (e.g. browser crash) may have null durations.`,
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
    `Per-page metrics with a selectable detail level. The \`view\` parameter chooses what comes back:

- view="summary" (default): pathname, pageviews, visitors. Cheap; use as the standard "top pages" call.
- view="engagement": adds avg_engagement_seconds (active tab time from the SDK's pageview_end beacon) and bounce_rate (% of single-page sessions that started on this path). Use to answer "which pages hold attention" or "which pages bounce".
- view="sections": returns per-section view counts for the specified pathname. Requires \`pathname\` to be set. Each section is a data-clamp-section element on that page, counted once per session when at least 40% scrolls into view. Use to answer "which parts of /pricing get seen" or "is the FAQ being read".

Examples:
- "top pages this week" → view omitted (or "summary"), period="7d"
- "which pages bounce hardest" → view="engagement", then sort by bounce_rate
- "how far down /pricing do people scroll" → view="sections", pathname="/pricing"

Limitations: avg_engagement_seconds is null for pages without pageview_end data (SDK <0.3 or pages closed during navigation). view="sections" requires the section-views SDK extension installed (see /docs/sdk/extensions/section-views) and only counts elements with the data-clamp-section attribute — pages with no instrumented sections return []. view="sections" without \`pathname\` returns 400.`,
    {
      project_id: projectIdParam,
      period: periodParam,
      limit: limitParam,
      view: z
        .enum(["summary", "engagement", "sections"])
        .optional()
        .describe(
          'Detail level. "summary" (default) returns pathname/pageviews/visitors only. "engagement" adds avg_engagement_seconds and bounce_rate. "sections" returns per-section view counts for the pathname (requires pathname).',
        ),
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
    `See who is on the site in the last N minutes. Returns the active visitor count plus top pages, top referrers, and top countries within that window. Defaults to 5 minutes; max 60. Use during incidents ("is anyone hitting the broken page right now"), launches ("is the new post getting traffic"), or whenever the user asks "who is on the site".

Examples:
- "who is on the site right now" → window_minutes=5
- "has anyone visited in the last hour" → window_minutes=60
- "is the launch page getting hits" → window_minutes=15

Limitations: ingestion lag is ~30 seconds, so "live" is approximate. Visitor count is unique anonymous_ids in the window, not active sessions. For historical questions ("who visited last week"), use traffic.overview instead.`,
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
  const searchDocsDescription = `Keyword-search the Clamp documentation index for setup, SDK, MCP, concepts, and skills pages. Returns ranked entries with url, title, and a short description. Each match scores higher when query terms appear in the title than the description; results are capped by \`limit\` (default 5, max 10). Use when the user asks how to do something — install Clamp in Next.js, add the section-views extension, set up Money revenue, write an alert — rather than what their data shows. For data questions use the analytics tools above.

Examples:
- "how do I install Clamp in Vite" → query="vite install"
- "how do I track revenue from Stripe" → query="stripe revenue server"
- "what does the section-views extension do" → query="section views extension"
- "how do I set up an alert" → query="alerts setup"

Limitations: keyword (substring) matching only — no semantic search, so synonyms ("webhook" vs "callback") will not match. The index is hand-maintained inside the MCP server and updates only when the server is redeployed. Returns an empty array if no matches; broaden the query rather than retrying with the same terms.`;
  const searchDocsSchema = {
    query: z.string().min(1).max(200).describe("Search query."),
    limit: z.coerce.number().int().min(1).max(10).optional().describe("Max results. Defaults to 5."),
  };
  const searchDocsHandler = async ({ query, limit }: { query: string; limit?: number }) => {
      const DOCS = [
        { url: "https://clamp.sh/docs", title: "Quick start", desc: "Two pasteable agent prompts (basic install and full SaaS end-to-end), plus a 5-step manual setup. SDK + MCP + Skills." },
        { url: "https://clamp.sh/docs/sdk", title: "SDK overview", desc: "Install snippets, quickstart, npm version. Links to tracking, server, extensions, and API reference. Setup prompts live on Quick start." },
        { url: "https://clamp.sh/docs/sdk/tracking", title: "SDK tracking", desc: "What's captured automatically, custom events, typed events, Money properties, property limits. Includes an agent prompt to add 3-5 high-signal track() calls." },
        { url: "https://clamp.sh/docs/sdk/server", title: "SDK server-side", desc: "Track from Node.js. Link browser and server events with an anonymous ID. Authoritative revenue from webhooks. Includes a Stripe-revenue agent prompt." },
        { url: "https://clamp.sh/docs/sdk/extensions", title: "SDK extensions overview", desc: "Catalog of outbound links, downloads, 404 detection, data attributes, web vitals. Path exclusions and debug mode. Each extension has its own subpage." },
        { url: "https://clamp.sh/docs/sdk/extensions/outbound-links", title: "Outbound links extension", desc: "Auto-track clicks on links to a different hostname. Event schema, what counts as outbound, edge cases." },
        { url: "https://clamp.sh/docs/sdk/extensions/downloads", title: "File downloads extension", desc: "Auto-track clicks on links to known file extensions. Default extension list, override via { extensions: [...] }, edge cases." },
        { url: "https://clamp.sh/docs/sdk/extensions/not-found", title: "404 detection extension", desc: "Detect 404 pages in SPAs by matching document.title. Default pattern, custom regex, SPA navigation behavior." },
        { url: "https://clamp.sh/docs/sdk/extensions/data-attributes", title: "Data-attributes extension", desc: "Click tracking from HTML with data-clamp-event. No JS required. Money shorthand, examples, when to use vs track()." },
        { url: "https://clamp.sh/docs/sdk/extensions/web-vitals", title: "Web Vitals extension", desc: "LCP, CLS, INP, FCP, TTFB capture. Peer dependency, sampling, per-page analysis via the pathname property." },
        { url: "https://clamp.sh/docs/sdk/extensions/section-views", title: "Section views extension", desc: "Fires section_viewed once per session when a data-clamp-section element scrolls into view. Engagement signal for which page sections actually get seen." },
        { url: "https://clamp.sh/docs/sdk/reference", title: "SDK API reference", desc: "Every export from browser, React, and server packages. Types and script-tag build. Includes excludePaths option." },
        { url: "https://clamp.sh/docs/concepts/events", title: "Events", desc: "Pageviews, custom events, event shape, property rules, naming." },
        { url: "https://clamp.sh/docs/concepts/properties", title: "Properties", desc: "Property shape, limits, typed events, Money values, naming conventions." },
        { url: "https://clamp.sh/docs/concepts/revenue", title: "Revenue", desc: "Attach Money-typed properties and query revenue by source, country, campaign with revenue.sum. Includes an agent prompt to add Money to existing payment events." },
        { url: "https://clamp.sh/docs/concepts/engagement", title: "Engagement and sessions", desc: "How visible time is measured, pageview_end beacon, bounce rate, pages.engagement, sessions.paths." },
        { url: "https://clamp.sh/docs/concepts/funnels", title: "Funnels", desc: "Create and evaluate multi-step conversion funnels. Pro plan. Includes an agent prompt to instrument signup → activation → paid." },
        { url: "https://clamp.sh/docs/mcp", title: "MCP overview", desc: "What the MCP server does, remote vs stdio, and links to setup, tools, prompts, examples." },
        { url: "https://clamp.sh/docs/mcp/setup", title: "MCP setup", desc: "One-click install the remote MCP in Cursor, VS Code, Claude Code, Claude Desktop. OAuth sign-in on first use." },
        { url: "https://clamp.sh/docs/mcp/tools", title: "MCP tools reference", desc: "Every tool grouped by what it does: traffic, audience, events, sessions, funnels, alerts, meta." },
        { url: "https://clamp.sh/docs/mcp/prompts", title: "MCP prompts", desc: "Pre-built analytics workflows: weekly report, traffic diagnosis, conversion audit, channel breakdown, page performance." },
        { url: "https://clamp.sh/docs/mcp/examples", title: "MCP examples", desc: "Real questions and the tool calls they produce for traffic, revenue, engagement, funnels." },
        { url: "https://clamp.sh/docs/mcp/self-hosting", title: "MCP self-hosting", desc: "Run the Clamp MCP locally over stdio with a project API key. For CI, headless agents, and self-hosted Clamp." },
        { url: "https://clamp.sh/docs/skills", title: "Analytics skills", desc: "Six model-invoked agent skills (analytics-profile-setup, analytics-diagnostic-method, traffic-change-diagnosis, channel-and-funnel-quality, metric-context-and-benchmarks, event-schema-author). Calibrated benchmarks instead of generic averages." },
        { url: "https://clamp.sh/docs/event-schema", title: "Event Schema", desc: "Portable, typed YAML format for declaring product analytics events. Authored in event-schema.yaml; the @clamp-sh/event-schema CLI validates it and generates a .d.ts so track() calls are autocompleted and type-checked at build time." },
        { url: "https://clamp.sh/docs/install", title: "Install guides", desc: "Framework-specific install guides. Pick yours below for a copy-pasteable snippet." },
        { url: "https://clamp.sh/docs/install/nextjs", title: "Next.js install", desc: "Next.js App Router and Pages Router setup. Includes an agent prompt." },
        { url: "https://clamp.sh/docs/install/vite-react", title: "Vite + React install", desc: "React SPA setup with Vite. Includes an agent prompt." },
        { url: "https://clamp.sh/docs/install/sveltekit", title: "SvelteKit install", desc: "SvelteKit setup. Includes an agent prompt." },
        { url: "https://clamp.sh/docs/install/nuxt", title: "Nuxt install", desc: "Nuxt 3 setup. Includes an agent prompt." },
        { url: "https://clamp.sh/docs/install/astro", title: "Astro install", desc: "Astro setup. Includes an agent prompt." },
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
2. Call **pages.engagement** with period="7d" and limit=10 for the most visited pages.
3. Call **breakdown** with dimension="referrer_host", period="7d", limit=10 for traffic sources.
4. Call **breakdown** with dimension="country", period="7d", limit=10 for geographic distribution.
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
2. Call **breakdown** with dimension="referrer_host", period="${period || "7d"}" — see if a specific source drove the change. Compare organic_search vs direct vs referral vs paid vs social (channel comes back joined per row).
3. Call **breakdown** with dimension="country", period="${period || "7d"}" — check if the change is concentrated in specific countries.
4. Call **breakdown** with dimension="device_type", period="${period || "7d"}" — check if it's a specific device type (mobile spike could mean social traffic).
5. Call **pages.engagement** with period="${period || "7d"}" — which pages are affected? Is it site-wide or concentrated on a few pages?
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
   - Try the top 2-3 countries from breakdown(dimension="country") — is conversion country-dependent?
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

1. Call **breakdown** with dimension="referrer_host", period="${period || "30d"}", limit=20 — get the full referrer picture (channel comes back joined per row).
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
3. Call **breakdown** with dimension="referrer_host", period="${period || "30d"}", pathname="${pathname}" — where does this page's traffic come from specifically?
4. Call **breakdown** with dimension="country", period="${period || "30d"}" — context for who's visiting.
5. Call **breakdown** with dimension="device_type", period="${period || "30d"}" — any mobile/desktop split issues for this page?
6. Call **pages.engagement** with view="sections", pathname="${pathname}", period="${period || "30d"}" — which parts of the page actually get seen (requires the section-views SDK extension).
7. If relevant, call **events.list** with period="${period || "30d"}" — any custom events fired on this page?

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
