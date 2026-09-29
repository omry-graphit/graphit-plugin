// Feature #1042: the hook-only paths of plugin-status.mjs, split out unchanged
// except that stdin is read once by the entry script and passed in (it can be read
// only once, and the cloud refresh also needs the SessionStart payload).

import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";

import {
  CACHE_SCHEMA_VERSION,
  atomicWriteJson,
  compareVersions,
  realpathSafe,
  tryReadJson,
} from "./common.mjs";

// Nudge throttle (US-3.2 / US-4.1: ~once/day). State is graphit-owned and atomic.
const NUDGE_TTL_MS = 24 * 60 * 60 * 1000;

function nudgeStatePath(cacheRoot) {
  return join(cacheRoot, "nudge-state.json");
}

function readNudgeState(cacheRoot) {
  const state = tryReadJson(nudgeStatePath(cacheRoot));
  if (state && state.schemaVersion === CACHE_SCHEMA_VERSION && state.nudges && typeof state.nudges === "object") {
    return state;
  }
  return { schemaVersion: CACHE_SCHEMA_VERSION, nudges: {} };
}

function nudgeAllowed(state, key) {
  const last = state.nudges[key];
  return typeof last !== "number" || Date.now() - last >= NUDGE_TTL_MS;
}

function persistNudges(cacheRoot, state, keys) {
  if (keys.length === 0) return;
  for (const key of keys) state.nudges[key] = Date.now();
  atomicWriteJson(nudgeStatePath(cacheRoot), state);
}

// 4.1 (SEC-5): find a `graphit` on PATH that is NOT this plugin's bundled wrapper -
// i.e. a legacy global @graphit/cli install. Because plugin executables are
// appended to PATH (Phase 2 finding), any global install shadows the wrapper, so
// its mere presence is the migration trigger. Returns the first such path or null.
function detectForeignGraphit(pluginRoot) {
  const pathValue = process.env.PATH ?? "";
  if (!pathValue) return null;
  const names = process.platform === "win32" ? ["graphit.cmd", "graphit.ps1", "graphit"] : ["graphit"];
  // On Windows the plugin ships graphit.cmd / graphit.ps1 alongside the POSIX
  // `graphit`, so excluding only `bin/graphit` would leave our own .cmd/.ps1
  // wrappers looking like a foreign global. Exclude every bundled wrapper name.
  const ownWrapperReals = new Set(
    names.map((name) => realpathSafe(join(pluginRoot, "bin", name))),
  );
  for (const dir of pathValue.split(delimiter).filter(Boolean)) {
    for (const name of names) {
      const candidate = join(dir, name);
      if (!existsSync(candidate)) continue;
      const real = realpathSafe(candidate);
      if (ownWrapperReals.has(real)) continue; // our own bundled wrapper
      if (/[/\\]plugins[/\\]/.test(real)) continue; // a plugin-cache wrapper
      return candidate;
    }
  }
  return null;
}

// `raw` is the hook's stdin (null when it could not be read). A UserPromptSubmit run
// continues only for a Graphit update/status question; every other run continues.
export function shouldRunForPrompt(hookEvent, raw, parsed) {
  if (hookEvent !== "UserPromptSubmit") return true;
  if (raw === null) return false;

  const prompt = String(parsed?.prompt ?? parsed?.user_prompt ?? raw).toLowerCase();
  return (
    prompt.includes("graphit") &&
    /\b(update|version|status|doctor|plugin|stale|staleness)\b/.test(prompt)
  );
}

// Feature #743: stamp a per-session marker so the CLI can tell whether the plugin
// actually loaded THIS session. This SessionStart hook only runs when Claude Code
// loaded the plugin at session start - a mid-session install never runs it, so the
// marker is absent and the CLI can warn. The SessionStart payload carries session_id
// (the same value as the Bash tool's CLAUDE_CODE_SESSION_ID - both from getSessionId()),
// and the marker is keyed by it so concurrent sessions never clobber each other.
export function stampSessionMarker(hookEvent, parsed, cacheRoot) {
  if (hookEvent !== "SessionStart") return;
  const sessionId = String(parsed?.session_id ?? "").trim();
  // The id becomes a filename, so accept only an id-shaped token (path-safety).
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(sessionId)) return;
  const dir = join(cacheRoot, "sessions");
  try {
    mkdirSync(dir, { recursive: true });
    // Feature #765: marker CONTENT is a capability signal. The CLI arms the
    // skill-invocation tripwire only when the marker declares skill-ack; legacy
    // markers (bare timestamp) keep it dormant, so a new npm CLI over an old
    // bundle can never block a session that cannot stamp.
    //
    // This is an implication, NOT an equivalence: within the plugin-bundle install
    // path the hook, SKILL.md, and CLI bin ship together, so caps => the loaded
    // SKILL.md teaches the attestation. It does NOT hold for legacy copied
    // snapshots (`graphit setup --legacy-copy`, see src/skill-version.ts), where a
    // stale copied SKILL.md can be loaded alongside a current plugin hook. Those
    // sessions are why every block message carries the "already invoked?" escape.
    writeFileSync(
      join(dir, sessionId),
      JSON.stringify({ caps: ["skill-ack"], ts: Date.now() }),
      "utf-8",
    );
    pruneOldSessionMarkers(dir);
  } catch {
    // Best-effort: a missing marker only costs an extra (harmless) CLI warning.
  }
}

// Feature #765: the `--skill-ack` session attestation is stamped in src/skill-guard.ts
// (`stampSkillAck`), called from the `plugin status` command BEFORE it delegates here.
// It deliberately does NOT live in this script: stamping must not depend on a second
// artifact, or a package missing this file could leave the gate armed with no way to
// clear it. A failed write is reported there rather than swallowed.

function pruneOldSessionMarkers(dir) {
  const cutoff = Date.now() - 48 * 60 * 60 * 1000;
  try {
    for (const name of readdirSync(dir)) {
      try {
        if (statSync(join(dir, name)).mtimeMs < cutoff) unlinkSync(join(dir, name));
      } catch {
        /* skip an unreadable entry */
      }
    }
  } catch {
    /* dir missing or unreadable - nothing to prune */
  }
}

// Feature #1042: the SessionStart hook's Claude Code timeout is 120 s so the cloud
// refresh fits, which also applies to a laptop's startup. Every other hook run arms
// this cutoff, so a laptop can never wait longer than the 5 s it did before. unref'd:
// it never keeps a finished run alive.
export function armCutoff(ms, exit = (code) => process.exit(code)) {
  const timer = setTimeout(() => exit(0), ms);
  timer.unref();
  return timer;
}

// Build the SessionStart agent nudges. Unlike --json (full diagnostics), the hook
// surfaces only user-actionable, throttled items: the migration nudge (4.1), the
// thin-layer /plugin update nudge (4.3), and legacy copied-skill cleanup. It does
// NOT emit founder-only publish drift, nor the npm-install-g binary message - under
// the plugin model the binary auto-updates via npx, so the bundle nudge is correct.
export function buildHookNudges(status, { cacheRoot, pluginRoot, suppressPluginUpdate = false }) {
  const state = readNudgeState(cacheRoot);
  const lines = [];
  const shown = [];

  // 4.1 Migration: a global @graphit/cli shadows the plugin's npx-backed wrapper.
  const foreignGraphit = detectForeignGraphit(pluginRoot);
  if (foreignGraphit && nudgeAllowed(state, "legacy-global")) {
    lines.push(
      `- A legacy global \`graphit\` (@graphit/cli) at ${foreignGraphit} shadows the plugin's bundled CLI ` +
        "(plugin executables are appended to PATH, so a global install wins). The plugin now delivers the CLI " +
        "automatically via npx - tell the user once and offer to run `npm uninstall -g @graphit/cli` so it takes over.",
    );
    shown.push("legacy-global");
  }

  // 4.3 Thin-layer: the plugin bundle is behind npm latest (the binary itself
  // auto-updates via npx; only the skill/hook/wrapper bundle needs a manual update).
  // Feature #1042: a cloud startup already updated (or reported why not), and its
  // agent cannot run /plugin update anyway, so the notice is left out there.
  if (
    !suppressPluginUpdate &&
    status.latestVersion &&
    compareVersions(status.latestVersion, status.currentVersion) > 0 &&
    nudgeAllowed(state, "plugin-update")
  ) {
    lines.push(
      `- A newer Graphit plugin is available (${status.currentVersion} -> ${status.latestVersion}). ` +
        "Tell the user once to update it with `/plugin marketplace update graphit-plugin`, then " +
        "`/plugin update graphit@graphit-plugin`, then restart Claude Code; the CLI itself already runs the latest release.",
    );
    shown.push("plugin-update");
  }

  // Legacy copied skill snapshots are real user-side issues - surface until removed.
  for (const finding of status.findings) {
    if (finding.type === "legacy-copied-skill-present" || finding.type === "copied-skill-stale") {
      lines.push(`- ${finding.message}. ${finding.remediation}`);
    }
  }

  if (lines.length === 0) return null;
  return {
    context: ["Graphit plugin status check found actionable update/version information.", ...lines].join("\n"),
    persist: () => persistNudges(cacheRoot, state, shown),
  };
}
