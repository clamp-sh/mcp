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

const server = new McpServer({ name: "clamp", version: "0.1.0" });
registerClampTools(server, {
  api,
  projectId: boot.projectId,
  projectName: boot.projectName,
  plan: boot.plan,
});

const transport = new StdioServerTransport();
await server.connect(transport);
