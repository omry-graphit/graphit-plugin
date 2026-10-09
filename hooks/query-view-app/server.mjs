#!/usr/bin/env node
// Feature #1099: graphit-view, the Cursor side of the query view. A stdio MCP
// server whose `show_query_result` tool points at an MCP App (`ui://` HTML), so
// Cursor draws the query card inline in chat. Its data comes from the Cursor
// postToolUse hook's hand-off file (query-view-handoff.mjs), so the shell
// `graphit query` stays the one query path.
//
// Dependency-free on purpose: the plugin mirror and the Cursor local copy ship
// no node_modules. Newline-delimited JSON-RPC 2.0 over stdio, the five methods
// an MCP App host needs.
//
// Migration (Project #302): the view only reads `structuredContent.result` (the
// CLI query envelope) and calls the two app-only tools with full arguments, so
// the remote `query` tool can serve the same HTML and this server is deleted.

import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";

import { buildMarkdown, extractFirstJsonObject } from "../../scripts/show-query-result.mjs";
import { createGraphitRunner, isMissingCommand } from "../../scripts/plugin-status/graphit-runner.mjs";
import { readHandoff } from "../../scripts/plugin-status/query-view-handoff.mjs";

const UI_URI = "ui://graphit/query-view.html";
const UI_MIME = "text/html;profile=mcp-app";
const UI_EXTENSION = "io.modelcontextprotocol/ui";
const READ_TIMEOUT_MS = 30000;
const MAX_PARALLEL_READS = 3;
const NAME = /^[A-Za-z0-9_.:-]{1,200}$/;

function pluginVersion() {
  try {
    const manifest = JSON.parse(readFileSync(new URL("../../.cursor-plugin/plugin.json", import.meta.url), "utf8"));
    return typeof manifest.version === "string" && /^\d+\.\d+\.\d+$/.test(manifest.version) ? manifest.version : "latest";
  } catch {
    return "latest";
  }
}

const TOOLS = [
  {
    name: "show_query_result",
    title: "Show Graphit query result",
    description:
      "Show the result of a `graphit query` that just ran as an interactive card in the chat: results, SQL, " +
      "graph, lineage, KB definitions and rules. Call it with the result id the Graphit plugin named after the " +
      "query output. Afterwards refer to the card and add analysis only; do not re-print its table.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "The result id the Graphit plugin named, e.g. q_0123456789ab." } },
      required: ["id"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: { ui: { resourceUri: UI_URI } },
  },
  {
    name: "kb_definition",
    title: "Read a KB metric definition",
    description: "Used by the query card: reads one KB metric definition through the graphit CLI.",
    inputSchema: {
      type: "object",
      properties: { kind: { type: "string", enum: ["metric"] }, name: { type: "string" } },
      required: ["kind", "name"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: { ui: { resourceUri: UI_URI, visibility: ["app"] } },
  },
  {
    name: "query_upstream",
    title: "Read a query's upstream lineage",
    description: "Used by the query card: reads the source, its refresh history, the semantic models and the referenced metrics.",
    inputSchema: {
      type: "object",
      properties: {
        source_name: { type: "string" },
        metric_names: { type: "array", items: { type: "string" }, maxItems: 20 },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: { ui: { resourceUri: UI_URI, visibility: ["app"] } },
  },
];

// ---- graphit CLI reads (pane tools) ------------------------------------------

let running = 0;
const waiting = [];
async function withReadSlot(task) {
  if (running >= MAX_PARALLEL_READS) await new Promise((resolve) => waiting.push(resolve));
  running += 1;
  try {
    return await task();
  } finally {
    running -= 1;
    waiting.shift()?.();
  }
}

// No shell, except on Windows where a .cmd shim cannot start without one -
// safe there because every argument is a fixed verb or matches NAME.
const win = process.platform === "win32";
function runFile(file, args) {
  return new Promise((resolve) => {
    const options = { timeout: READ_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024, windowsHide: true, shell: win };
    execFile(file, args, options, (error, stdout, stderr) => {
      resolve({
        missing: error?.code === "ENOENT",
        code: typeof error?.code === "number" ? error.code : 0,
        stdout: String(stdout ?? ""),
        stderr: String(stderr ?? ""),
      });
    });
  });
}

const runCli = createGraphitRunner({ runFile, version: pluginVersion() });
function runGraphit(args) {
  return withReadSlot(() => runCli(args));
}

// The CLI may print a warning before its JSON and a footer after it.
function firstJson(text) {
  const json = extractFirstJsonObject(text);
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

async function kbDefinition(args) {
  if (args?.kind !== "metric" || typeof args?.name !== "string" || !NAME.test(args.name)) {
    return toolError("Pass kind \"metric\" and a KB metric name.");
  }
  const ran = await runGraphit(["kb", "get", "metric", "--", args.name]);
  if (isMissingCommand(ran, process.platform)) return toolError("The graphit CLI could not be started (not on PATH, and npx is unavailable).");
  return { content: [{ type: "text", text: `KB metric ${args.name}` }], structuredContent: { stdout: ran.stdout, stderr: ran.stderr } };
}

async function queryUpstream(args) {
  const source = typeof args?.source_name === "string" && NAME.test(args.source_name) ? args.source_name : undefined;
  const names = (Array.isArray(args?.metric_names) ? args.metric_names : []).filter((n) => typeof n === "string" && NAME.test(n)).slice(0, 20);
  const read = async (cli) => {
    const ran = await runGraphit(cli);
    return { json: firstJson(ran.stdout), stderr: ran.stderr, missing: isMissingCommand(ran, process.platform) };
  };
  const [dsList, models, ...metrics] = await Promise.all([
    read(["ds", "list", "--limit", "200"]),
    read(["kb", "list", "semantic-model"]),
    ...names.map((n) => read(["kb", "get", "metric", "--", n])),
  ]);
  if (dsList.missing) return toolError("The graphit CLI could not be started (not on PATH, and npx is unavailable).");
  const ds = (dsList.json?.data_sources ?? []).find((d) => source && String(d?.name ?? "").toLowerCase() === source.toLowerCase());
  const history = ds?.id && NAME.test(String(ds.id)) ? (await read(["ds", "refresh-history", "--", String(ds.id)])).json : null;
  return {
    content: [{ type: "text", text: "Upstream lineage read." }],
    structuredContent: {
      dsList: dsList.json,
      history,
      models: models.json,
      metrics: metrics.map((m) => m.json),
      notFound: dsList.json && source && !ds ? source : undefined,
      stderr: dsList.json || models.json ? "" : dsList.stderr || models.stderr,
    },
  };
}

// ---- MCP methods --------------------------------------------------------------

let clientRendersUi = false;

function toolError(text) {
  return { content: [{ type: "text", text }], isError: true };
}

function showQueryResult(args) {
  const saved = readHandoff(args?.id);
  if (saved.error === "invalid") return toolError("Not a Graphit result id. Use the id the Graphit plugin named after the query.");
  if (saved.error) return toolError("That Graphit result has expired. Run the query again.");
  const rows = Array.isArray(saved.result.rows) ? saved.result.rows : [];
  const count = saved.result.row_count ?? saved.result.total_rows ?? rows.length;
  if (!clientRendersUi) {
    // A host without MCP Apps gets the same table the hook would have shown.
    return { content: [{ type: "text", text: buildMarkdown(saved.result) }] };
  }
  return {
    content: [{ type: "text", text: `The result is shown to the user as an interactive card (${count} rows). Do not reproduce its table; refer to it and add analysis only.` }],
    structuredContent: { command: saved.command, result: saved.result },
    _meta: { ui: { resourceUri: UI_URI } },
  };
}

function readView() {
  return readFileSync(new URL("./query-view.html", import.meta.url), "utf8");
}

async function handle(method, params) {
  switch (method) {
    case "initialize":
      clientRendersUi = Boolean(params?.capabilities?.extensions?.[UI_EXTENSION]);
      return {
        protocolVersion: typeof params?.protocolVersion === "string" ? params.protocolVersion : "2025-06-18",
        capabilities: { tools: {}, resources: {} },
        serverInfo: { name: "graphit-view", version: pluginVersion() },
      };
    case "ping":
      return {};
    case "tools/list":
      return { tools: TOOLS };
    case "tools/call": {
      const args = params?.arguments ?? {};
      if (params?.name === "show_query_result") return showQueryResult(args);
      if (params?.name === "kb_definition") return kbDefinition(args);
      if (params?.name === "query_upstream") return queryUpstream(args);
      throw rpcError(-32602, `Unknown tool: ${String(params?.name).slice(0, 80)}`);
    }
    case "resources/list":
      return { resources: [{ uri: UI_URI, name: "Graphit query view", mimeType: UI_MIME }] };
    case "resources/read":
      if (params?.uri !== UI_URI) throw rpcError(-32602, "Unknown resource");
      return { contents: [{ uri: UI_URI, mimeType: UI_MIME, text: readView() }] };
    default:
      throw rpcError(-32601, "Method not found");
  }
}

function rpcError(code, message) {
  return Object.assign(new Error(message), { rpcCode: code });
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

createInterface({ input: process.stdin }).on("line", async (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    return;
  }
  if (msg?.id === undefined || msg.id === null) return; // a notification
  try {
    send({ jsonrpc: "2.0", id: msg.id, result: await handle(msg.method, msg.params) });
  } catch (error) {
    send({ jsonrpc: "2.0", id: msg.id, error: { code: error.rpcCode ?? -32603, message: error.rpcCode ? error.message : "Internal error" } });
  }
});
