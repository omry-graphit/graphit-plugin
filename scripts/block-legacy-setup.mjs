#!/usr/bin/env node
// PreToolUse(Bash) hook: block re-introducing a legacy copied install of the
// Graphit skill (`graphit setup ... --legacy-copy`) for Claude Code or Codex
// while the plugin bundle is the active source. The plugin bundle is the single
// source of truth on those two platforms; a copied snapshot drifts and shadows
// it, which is exactly the failure mode `graphit setup --remove-legacy-copies`
// exists to undo. When the about-to-run Bash command matches, this prints a
// remediation message and exits 2 (block). Every other command exits 0 (allow).
//
// Claude-Code-only progressive enhancement: Codex has no hook system, so this
// invariant is restated as prose in the skill rather than enforced there. The
// hook is purely additive - on the platforms that lack it, nothing changes.
//
// Defensive by contract: malformed input, a missing field, or any thrown error
// resolves to exit 0 (allow). The hook must never block an unrelated command or
// crash the agent's Bash flow on a parse error.

import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Mirrors the plugin-root resolution used by plugin-status.mjs so the script is
// portable across the Claude Code / Codex / standalone env layouts. Unused for
// the block decision today, but kept consistent so future remediation can point
// at bundle-relative paths without re-deriving the root.
const pluginRoot =
  process.env.CLAUDE_PLUGIN_ROOT ??
  process.env.CODEX_PLUGIN_ROOT ??
  process.env.GRAPHIT_PLUGIN_ROOT ??
  dirname(dirname(fileURLToPath(import.meta.url)));

function readStdin() {
  try {
    return readFileSync(0, "utf-8");
  } catch {
    return "";
  }
}

function tryParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

// Match `graphit setup` (or local dev `node dist/index.js setup`) combined with
// the `--legacy-copy` flag, in either order, tolerating env prefixes
// (GRAPHIT_API_URL=... graphit setup ...). Anchored on both the setup command
// and the legacy-copy flag so plain `graphit setup` and unrelated commands that
// merely mention "legacy" are never blocked.
function isLegacyCopySetup(command) {
  if (!command) return false;
  const isSetup = /(?:graphit|index\.js)\s+setup\b/.test(command);
  const hasLegacyCopyFlag = /--legacy-copy\b/.test(command);
  return isSetup && hasLegacyCopyFlag;
}

const REMEDIATION =
  "[Graphit plugin] Blocked `graphit setup --legacy-copy`. On Claude Code and " +
  "Codex the Graphit plugin bundle is the active source of truth for the skill; " +
  "a legacy copied snapshot drifts and shadows it. Do not re-introduce a copied " +
  "install. If a stale copy is already present, remove it with " +
  "`graphit setup --remove-legacy-copies` after confirming the plugin is " +
  "installed. Plugin root: " +
  pluginRoot;

function main() {
  const raw = readStdin();
  if (!raw) return 0;

  const payload = tryParseJson(raw);
  if (!payload || payload.tool_name !== "Bash") return 0;

  const command = payload.tool_input?.command ?? "";
  if (!isLegacyCopySetup(command)) return 0;

  process.stderr.write(`${REMEDIATION}\n`);
  return 2;
}

let exitCode = 0;
try {
  exitCode = main();
} catch {
  // Never block an unrelated command or crash the agent's Bash flow on error.
  exitCode = 0;
}
process.exit(exitCode);
