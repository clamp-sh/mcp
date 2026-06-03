#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerClampTools } from "./tools.js";

// ── Config ───────────────────────────────────────────

const API_BASE = process.env.CLAMP_API_URL ?? "https://api.clamp.sh";
const API_KEY = process.env.CLAMP_API_KEY ?? "";

if (!API_KEY) {
  throw new Error("CLAMP_API_KEY is required. Set it in your MCP config env.");
}

// ── Bootstrap ────────────────────────────────────────

interface Bootstrap {
  projectId: string;
  projectName: string;
  plan: string;
}

async function bootstrap(): Promise<Bootstrap> {
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
  return (await res.json()) as Bootstrap;
}

// ── HTTP helper ──────────────────────────────────────

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-clamp-key": API_KEY,
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(formatApiError(res.status, body, path));
  }
  return res.json() as Promise<T>;
}

function formatApiError(status: number, body: string, path: string): string {
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
  if (status === 403) return `Forbidden${detail ? `: ${detail}` : ""}.`;
  if (status === 404) {
    if (!parsed) {
      return `Endpoint not found (${path}). Your MCP client may be on an older version — try updating @clamp-sh/mcp.`;
    }
    return `Not found${detail ? `: ${detail}` : ""}.`;
  }
  if (status === 429) return `Rate limited${detail ? `: ${detail}` : ""}. Try again in a moment.`;
  if (status >= 500) {
    return `Clamp API is having trouble (${status}). Try again in a moment; if it persists, check status.clamp.sh.`;
  }
  return `API ${status}${detail ? `: ${detail}` : ""}`;
}

// ── Start ────────────────────────────────────────────

const boot = await bootstrap();

// The `instructions` string is injected into the agent's system prompt at
// connection time per the MCP spec. Use it to nudge skill loading rather
// than relying purely on each skill's semantic match.
const SERVER_INSTRUCTIONS = `Clamp Analytics MCP. Use these tools to read pageviews, custom events, funnels, cohorts, retention, revenue, errors, and user journeys for a single project.

Before INTERPRETING any analytics result from these tools, load the relevant analytics-skills skill(s). Skills enforce methodology — sample-size discipline, Simpson's paradox detection, causal-reasoning hygiene, mix-shift checks — that pure tool calls cannot.

Skill loading map:
- Any analytics interpretation question → load \`analytics-skills:analytics-diagnostic-method\` (the spine; load this first).
- "Why did traffic change / drop / spike?" → also load \`analytics-skills:traffic-change-diagnosis\`.
- "Is this metric good? Is bounce/CVR/churn normal?" → load \`analytics-skills:metric-context-and-benchmarks\`.
- Funnel reading, channel comparison, "which is best" → load \`analytics-skills:channel-and-funnel-quality\`.
- A/B test reading, "did the variant win?" → load \`analytics-skills:experiment-result-reader\` (+ \`bayesian-experiment-reader\` for posterior P(better)/expected-loss; + \`sequential-monitoring\` for safe peeking).
- "Did X cause Y?" on observational data (no holdback) → load \`analytics-skills:causal-query-classifier\` first to rung-tag the question; then \`causal-dag-builder\` to make assumptions explicit; then \`causal-evidence-checklist\` (Bradford Hill) before recommending an action.
- Cohort comparison, funnel-by-cohort, "this segment converts X% higher" → load \`analytics-skills:causal-dag-builder\` to surface confounders before declaring causation.
- Time-series anomaly questions, contested change dates, two fingerprints matching → load \`analytics-skills:anomaly-detection-time-series\`.
- First time talking to a new project → run \`analytics-skills:analytics-profile-setup\` once so subsequent answers calibrate to the user's industry and business model.

If the user is interpreting a number AND no analytics-skills skill has been loaded, prefer to load the relevant skill and re-read with discipline rather than answer ad-hoc. The skill descriptions specify their triggers; match by question shape, not vendor.`;

const server = new McpServer(
  { name: "clamp", version: "0.1.0" },
  { instructions: SERVER_INSTRUCTIONS },
);
registerClampTools(server, {
  api,
  projects: [{ id: boot.projectId, name: boot.projectName, plan: boot.plan }],
});

const transport = new StdioServerTransport();
await server.connect(transport);
