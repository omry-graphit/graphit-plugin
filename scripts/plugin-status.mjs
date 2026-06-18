#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Project #246: GRAPHIT_REGISTRY_URL lets tests point at a local server and
// supports private/enterprise registries; defaults to the public npm registry.
const REGISTRY_URL =
  process.env.GRAPHIT_REGISTRY_URL ?? "https://registry.npmjs.org/@graphit/cli/latest";
const PACKAGE_NAME = "@graphit/cli";
// Project #246: ~4h TTL (was 24h) so a single-source bump reaches returning
// sessions within one window (ARCH-2, PERF-2).
const TTL_MS = 4 * 60 * 60 * 1000;
// Project #246: version-cache schema. Bump when the cache shape changes; older
// caches are then treated as a miss and refetched (self-healing).
const CACHE_SCHEMA_VERSION = 1;
// Strict semver. The wrapper enforces the same shape (SEC-6); keep them in sync.
const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const args = new Set(process.argv.slice(2));
const hookIndex = process.argv.indexOf("--hook");
const hookEvent = hookIndex >= 0 ? process.argv[hookIndex + 1] : null;
const pluginRoot =
  process.env.CLAUDE_PLUGIN_ROOT ??
  process.env.CODEX_PLUGIN_ROOT ??
  process.env.GRAPHIT_PLUGIN_ROOT ??
  dirname(dirname(fileURLToPath(import.meta.url)));
// Project #246: the version cache must be shared between this SessionStart hook
// and the bin/graphit wrapper (agent Bash tool). CLAUDE_PLUGIN_DATA is set
// per-plugin/per-context by Claude Code and is NOT guaranteed identical across
// those two contexts, so it is intentionally excluded here - a fixed, graphit-
// owned dir guarantees both sides agree. GRAPHIT_PLUGIN_DATA overrides.
const cacheRoot = process.env.GRAPHIT_PLUGIN_DATA ?? join(homedir(), ".graphit");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function tryReadJson(path) {
  try {
    if (!existsSync(path)) return null;
    return readJson(path);
  } catch {
    return null;
  }
}

function readFrontmatterVersion(path) {
  try {
    const content = readFileSync(path, "utf-8");
    return content.match(/^skill_version:\s*["']?([^"'\n]+)["']?\s*$/m)?.[1] ?? null;
  } catch {
    return null;
  }
}

function compareVersions(left, right) {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);

  for (let index = 0; index < 3; index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;
    if (leftPart > rightPart) return 1;
    if (leftPart < rightPart) return -1;
  }

  return 0;
}

function copiedSkillTargets(home = homedir(), cwd = process.cwd()) {
  return [
    { kind: "claude-code", label: "Claude Code global", scope: "global", path: join(home, ".claude", "skills", "graphit", "SKILL.md") },
    { kind: "codex", label: "Codex global", scope: "global", path: join(home, ".codex", "skills", "graphit", "SKILL.md") },
    { kind: "cursor", label: "Cursor global", scope: "global", path: join(home, ".cursor", "rules", "graphit.mdc") },
    { kind: "claude-code", label: "Claude Code project", scope: "project", path: join(cwd, ".claude", "skills", "graphit", "SKILL.md") },
    { kind: "codex", label: "Codex project", scope: "project", path: join(cwd, ".codex", "skills", "graphit", "SKILL.md") },
    { kind: "cursor", label: "Cursor project", scope: "project", path: join(cwd, ".cursor", "rules", "graphit.mdc") },
  ];
}

function isPluginManagedKind(kind) {
  return kind === "claude-code" || kind === "codex";
}

function readCopiedSkillVersion(path) {
  if (!existsSync(path)) return null;
  const versionJson = path.endsWith("SKILL.md")
    ? tryReadJson(join(dirname(path), "VERSION.json"))
    : null;
  return versionJson?.version ?? readFrontmatterVersion(path);
}

function readCache(path) {
  try {
    if (!existsSync(path)) return null;
    return readJson(path);
  } catch {
    return null;
  }
}

function isStrictSemver(value) {
  return typeof value === "string" && SEMVER_RE.test(value);
}

// SEC-6: the cache file is user-writable. Treat it as untrusted - require the
// expected schema version, package name, a strict-semver version, and a numeric
// timestamp. Anything else is treated as a miss (refetch / fall back).
function isValidVersionCache(cache) {
  return (
    !!cache &&
    cache.schemaVersion === CACHE_SCHEMA_VERSION &&
    cache.packageName === PACKAGE_NAME &&
    isStrictSemver(cache.latestVersion) &&
    typeof cache.checkedAt === "number"
  );
}

// SEC-4: atomic write (tmp + rename) so concurrent SessionStart writers can never
// leave a torn/partial file for the wrapper or a later read.
function atomicWriteJson(path, obj) {
  const tmpPath = `${path}.${process.pid}.tmp`;
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(tmpPath, JSON.stringify(obj), "utf-8");
    renameSync(tmpPath, path);
  } catch {
    // Writes here must never break startup hooks; clean up any temp file.
    try {
      rmSync(tmpPath, { force: true });
    } catch {
      // ignore
    }
  }
}

function writeCache(path, latestVersion) {
  atomicWriteJson(path, {
    schemaVersion: CACHE_SCHEMA_VERSION,
    packageName: PACKAGE_NAME,
    latestVersion,
    checkedAt: Date.now(),
  });
}

function realpathSafe(path) {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

// 4.1 (SEC-5): find a `graphit` on PATH that is NOT this plugin's bundled wrapper -
// i.e. a legacy global @graphit/cli install. Because plugin executables are
// appended to PATH (Phase 2 finding), any global install shadows the wrapper, so
// its mere presence is the migration trigger. Returns the first such path or null.
function detectForeignGraphit() {
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

// Nudge throttle (US-3.2 / US-4.1: ~once/day). State is graphit-owned and atomic.
const NUDGE_TTL_MS = 24 * 60 * 60 * 1000;
const nudgeStatePath = join(cacheRoot, "nudge-state.json");

function readNudgeState() {
  const state = tryReadJson(nudgeStatePath);
  if (state && state.schemaVersion === CACHE_SCHEMA_VERSION && state.nudges && typeof state.nudges === "object") {
    return state;
  }
  return { schemaVersion: CACHE_SCHEMA_VERSION, nudges: {} };
}

function nudgeAllowed(state, key) {
  const last = state.nudges[key];
  return typeof last !== "number" || Date.now() - last >= NUDGE_TTL_MS;
}

function persistNudges(state, keys) {
  if (keys.length === 0) return;
  for (const key of keys) state.nudges[key] = Date.now();
  atomicWriteJson(nudgeStatePath, state);
}

async function getLatestVersion(currentVersion) {
  if (args.has("--skip-network")) return null;

  const cachePath = join(cacheRoot, "plugin-status.json");
  const cache = readCache(cachePath);
  const cachedVersion = isValidVersionCache(cache) ? cache.latestVersion : null;
  if (cachedVersion && Date.now() - cache.checkedAt < TTL_MS) {
    return cachedVersion;
  }

  try {
    const response = await fetch(REGISTRY_URL, { signal: AbortSignal.timeout(1500) });
    if (!response.ok) return cachedVersion;
    const data = await response.json();
    if (data && isStrictSemver(data.version)) {
      writeCache(cachePath, data.version);
      return data.version;
    }
  } catch {
    return cachedVersion;
  }

  return currentVersion;
}

function shouldRunForPrompt() {
  if (hookEvent !== "UserPromptSubmit") return true;

  let input = "";
  try {
    input = readFileSync(0, "utf-8");
  } catch {
    return false;
  }

  const parsed = tryParseJson(input);
  const prompt = String(parsed?.prompt ?? parsed?.user_prompt ?? input).toLowerCase();
  return (
    prompt.includes("graphit") &&
    /\b(update|version|status|doctor|plugin|stale|staleness)\b/.test(prompt)
  );
}

function tryParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function collectStatus() {
  const packageJson = readJson(join(pluginRoot, "package.json"));
  const currentVersion = packageJson.version;
  const findings = [];
  const metadata = [];
  const claudePlugin = tryReadJson(join(pluginRoot, ".claude-plugin", "plugin.json"));
  const codexPlugin = tryReadJson(join(pluginRoot, ".codex-plugin", "plugin.json"));
  const marketplace = tryReadJson(join(pluginRoot, ".claude-plugin", "marketplace.json"));
  const marketplacePlugin = marketplace?.plugins?.find((plugin) => plugin.name === "graphit");

  const versionChecks = [
    [".claude-plugin/plugin.json", claudePlugin?.version],
    [".codex-plugin/plugin.json", codexPlugin?.version],
    [".claude-plugin/marketplace.json metadata", marketplace?.metadata?.version],
    [".claude-plugin/marketplace.json plugin", marketplacePlugin?.version],
    ["skills/graphit/VERSION.json", tryReadJson(join(pluginRoot, "skills", "graphit", "VERSION.json"))?.version],
    ["skills/graphit/SKILL.md", readFrontmatterVersion(join(pluginRoot, "skills", "graphit", "SKILL.md"))],
    // The Cursor source file (skills/graphit/graphit.mdc) is frozen and no longer
    // version-stamped, so it is intentionally excluded here. The copied-Cursor-home
    // staleness checks below still run for existing Cursor users.
  ];

  for (const [label, version] of versionChecks) {
    if (version !== currentVersion) {
      findings.push({
        type: "metadata-drift",
        message: `${label} is ${version ?? "missing"}, expected ${currentVersion}`,
        remediation: "Run `npm run sync:version` before publishing @graphit/cli.",
      });
    }
    metadata.push({ label, version: version ?? null });
  }

  const marketplaceSource = marketplacePlugin?.source;
  const sourceMatches =
    marketplaceSource?.source === "npm" &&
    marketplaceSource.package === packageJson.name &&
    marketplaceSource.version === currentVersion;
  metadata.push({
    label: ".claude-plugin/marketplace.json source",
    version: marketplaceSource?.version ?? null,
    source: marketplaceSource ?? null,
  });
  if (!sourceMatches) {
    findings.push({
      type: "metadata-drift",
      message: `.claude-plugin/marketplace.json source is ${
        marketplaceSource ? JSON.stringify(marketplaceSource) : "missing"
      }, expected npm source ${packageJson.name}@${currentVersion}`,
      remediation: "Run `npm run sync:version` before publishing @graphit/cli.",
    });
  }

  const latestVersion = await getLatestVersion(currentVersion);
  if (latestVersion && compareVersions(latestVersion, currentVersion) > 0) {
    findings.push({
      type: "package-update",
      message: `@graphit/cli update available: ${currentVersion} -> ${latestVersion}`,
      remediation: "This update is for the npm CLI binary (@graphit/cli), a separate artifact from the skill bundle. Update the binary with `npm install -g @graphit/cli@latest` (not `npm update -g`, which respects the original semver range and can miss the latest). If `graphit` resolves to a custom npm prefix (compare `command -v graphit` with `npm prefix -g`), reinstall to that prefix with `npm install -g @graphit/cli@latest --prefix <dir>` (<dir> = the parent of the bin dir holding graphit). The Claude Code/Codex skill bundle updates separately via `claude plugin update graphit@graphit-plugin` and does NOT update the binary.",
    });
  }

  for (const target of copiedSkillTargets()) {
    const { label, path } = target;
    if (!existsSync(path)) continue;
    const version = readCopiedSkillVersion(path);
    if (isPluginManagedKind(target.kind)) {
      findings.push({
        type: "legacy-copied-skill-present",
        message: `${label} legacy copied skill exists at ${path} (${version ?? "unversioned"})`,
        remediation: "Claude Code and Codex should use the Graphit plugin bundle. Remove legacy copied snapshots with `graphit setup --remove-legacy-copies` after confirming the plugin is installed.",
      });
      continue;
    }

    if (!version || compareVersions(version, currentVersion) < 0) {
      findings.push({
        type: "copied-skill-stale",
        message: `${label} copied skill is ${version ?? "unversioned"}, expected ${currentVersion}`,
        remediation: "Cursor currently uses copied rules; refresh them with `graphit setup --editor cursor --update`.",
      });
    }
  }

  return {
    packageName: packageJson.name,
    sourceOfTruth: "plugin-bundle",
    currentVersion,
    latestVersion,
    metadata,
    findings,
  };
}

function formatPlain(status) {
  if (status.findings.length === 0) {
    return `Graphit plugin status OK (${status.currentVersion}).`;
  }

  return [
    `Graphit plugin status needs attention (${status.currentVersion}):`,
    ...status.findings.map((finding) => `- ${finding.message}\n  ${finding.remediation}`),
  ].join("\n");
}

// Build the SessionStart agent nudges. Unlike --json (full diagnostics), the hook
// surfaces only user-actionable, throttled items: the migration nudge (4.1), the
// thin-layer /plugin update nudge (4.3), and legacy copied-skill cleanup. It does
// NOT emit founder-only publish drift, nor the npm-install-g binary message - under
// the plugin model the binary auto-updates via npx, so the bundle nudge is correct.
function buildHookNudges(status) {
  const state = readNudgeState();
  const lines = [];
  const shown = [];

  // 4.1 Migration: a global @graphit/cli shadows the plugin's npx-backed wrapper.
  const foreignGraphit = detectForeignGraphit();
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
  if (
    status.latestVersion &&
    compareVersions(status.latestVersion, status.currentVersion) > 0 &&
    nudgeAllowed(state, "plugin-update")
  ) {
    lines.push(
      `- A newer Graphit plugin is available (${status.currentVersion} -> ${status.latestVersion}). ` +
        "Tell the user once to update the bundle with `/plugin update graphit@graphit-plugin`; " +
        "the CLI binary itself updates automatically.",
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
    persist: () => persistNudges(state, shown),
  };
}

if (hookEvent && !shouldRunForPrompt()) {
  process.exit(0);
}

const status = await collectStatus();

if (args.has("--json")) {
  console.log(JSON.stringify(status, null, 2));
} else if (hookEvent) {
  const nudge = buildHookNudges(status);
  if (nudge) {
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: hookEvent,
        additionalContext: nudge.context,
      },
    }));
    nudge.persist();
  }
} else if (!args.has("--quiet") || status.findings.length > 0) {
  console.log(formatPlain(status));
}

process.exit(status.findings.length > 0 && args.has("--fail-on-findings") ? 1 : 0);
