// Feature #1099: the hand-off between the Cursor postToolUse hook and the
// graphit-view MCP server. The hook saves a query result under a random id and
// names it in the agent's context; the server reads it back by that id only.
// Files live under the plugin data root and are pruned after 48 hours.

import { randomBytes } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const HANDOFF_ID = /^q_[0-9a-f]{12}$/;
const MAX_AGE_MS = 48 * 60 * 60 * 1000;
// The mod's READ_LIMIT: a larger result is not handed off at all.
export const MAX_HANDOFF_BYTES = 4 * 1024 * 1024;

// An empty GRAPHIT_PLUGIN_DATA counts as unset, as in query-view-marker.mjs.
export function handoffDir(env = process.env) {
  return join(env.GRAPHIT_PLUGIN_DATA || join(homedir(), ".graphit"), "query-view");
}

// Returns the new id, or null when the result is too large or the write fails.
export function writeHandoff(command, result, env = process.env) {
  const body = JSON.stringify({ command, result });
  if (Buffer.byteLength(body) > MAX_HANDOFF_BYTES) return null;
  const id = `q_${randomBytes(6).toString("hex")}`;
  try {
    const dir = handoffDir(env);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeFileSync(join(dir, `${id}.json`), body, { mode: 0o600 });
    pruneHandoffs(env);
    return id;
  } catch {
    return null;
  }
}

// The path is built only from a validated id, never from caller text.
export function readHandoff(id, env = process.env) {
  if (typeof id !== "string" || !HANDOFF_ID.test(id)) return { error: "invalid" };
  try {
    const parsed = JSON.parse(readFileSync(join(handoffDir(env), `${id}.json`), "utf8"));
    if (!parsed || typeof parsed !== "object" || !parsed.result) return { error: "missing" };
    return { command: String(parsed.command ?? ""), result: parsed.result };
  } catch {
    return { error: "missing" };
  }
}

export function pruneHandoffs(env = process.env, now = Date.now()) {
  const dir = handoffDir(env);
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    if (!HANDOFF_ID.test(name.replace(/\.json$/, ""))) continue;
    const path = join(dir, name);
    try {
      if (now - statSync(path).mtimeMs > MAX_AGE_MS) unlinkSync(path);
    } catch {
      // Raced by another prune.
    }
  }
}
