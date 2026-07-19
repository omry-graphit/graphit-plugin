#!/usr/bin/env node

import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Project #246: GRAPHIT_REGISTRY_URL lets tests point at a local server and
// supports private/enterprise registries; defaults to the public npm registry.
const REGISTRY_URL =
  process.env.GRAPHIT_REGISTRY_URL ?? "https://registry.npmjs.org/@graphit/cli/latest";
const PACKAGE_NAME = "@graphit/cli";
const PLUGIN_ID = "graphit@graphit-plugin";
const CLAUDE_MARKETPLACE_NAME = "graphit-plugin";
const CLAUDE_PLUGIN_NAME = "graphit";
const REPAIRABLE_BUNDLE_ENTRIES = [
  ".claude-plugin",
  ".codex-plugin",
  "skills",
  "hooks",
  "scripts",
  "commands",
  "bin",
  "README.md",
  "package.json",
];
// Project #246: ~4h TTL (was 24h) so a single-source bump reaches returning
// sessions within one window (ARCH-2, PERF-2).
const TTL_MS = 4 * 60 * 60 * 1000;
// Project #246: version-cache schema. Bump when the cache shape changes; older
// caches are then treated as a miss and refetched (self-healing).
const CACHE_SCHEMA_VERSION = 1;
// Strict semver. The wrapper enforces the same shape (SEC-6); keep them in sync.
const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const args = new Set(process.argv.slice(2));
const shouldRepair = args.has("--repair") || args.has("--auto-repair");
const isPreflight = args.has("--preflight");
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

function readBundleInfo(root) {
  const packageJson = tryReadJson(join(root, "package.json"));
  const versionJson = tryReadJson(join(root, "skills", "graphit", "VERSION.json"));
  const claudePlugin = tryReadJson(join(root, ".claude-plugin", "plugin.json"));
  const marketplace = tryReadJson(join(root, ".claude-plugin", "marketplace.json"));
  const marketplacePlugin = marketplace?.plugins?.find((plugin) => plugin.name === CLAUDE_PLUGIN_NAME);
  return {
    packageName: packageJson?.name ?? versionJson?.package ?? PACKAGE_NAME,
    currentVersion:
      packageJson?.version ??
      versionJson?.version ??
      claudePlugin?.version ??
      marketplacePlugin?.version ??
    marketplace?.metadata?.version ??
      readFrontmatterVersion(join(root, "skills", "graphit", "SKILL.md")) ??
      null,
    claudePlugin: claudePlugin ?? null,
    marketplace: marketplace ?? null,
    marketplacePlugin: marketplacePlugin ?? null,
  };
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

function versionIsBehind(version, currentVersion) {
  if (!isStrictSemver(currentVersion)) return false;
  if (!version || !isStrictSemver(version)) return true;
  return compareVersions(version, currentVersion) < 0;
}

function sanitizePathPart(value) {
  return value.replace(/[^a-zA-Z0-9\-_.]/g, "-");
}

function isWithinDirectory(child, parent) {
  const parentResolved = resolve(parent);
  const childResolved = resolve(child);
  const rel = relative(parentResolved, childResolved);
  return rel === "" || (!!rel && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
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

function claudePluginsRoot() {
  return process.env.CLAUDE_PLUGINS_ROOT ?? join(homedir(), ".claude", "plugins");
}

function claudeInstalledPluginsPath(root = claudePluginsRoot()) {
  return join(root, "installed_plugins.json");
}

function claudeVersionedCachePath(version, root = claudePluginsRoot()) {
  return join(
    root,
    "cache",
    CLAUDE_MARKETPLACE_NAME,
    CLAUDE_PLUGIN_NAME,
    sanitizePathPart(version),
  );
}

function readClaudeInstalledFile(root = claudePluginsRoot()) {
  const path = claudeInstalledPluginsPath(root);
  const data = tryReadJson(path);
  if (!data || typeof data !== "object") return null;
  return { path, data };
}

function graphitInstallEntries(installedData) {
  const plugins = installedData.plugins && typeof installedData.plugins === "object"
    ? installedData.plugins
    : installedData;
  const raw = plugins?.[PLUGIN_ID];
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .filter((entry) => entry && typeof entry === "object")
      .map((entry) => ({ entry }));
  }
  if (typeof raw === "object") {
    return [{ entry: raw }];
  }
  return [];
}

function pluginEntryVersion(entry) {
  if (!entry || typeof entry !== "object") return null;
  const installPath = typeof entry.installPath === "string" ? entry.installPath : null;
  const skillVersion = installPath
    ? readFrontmatterVersion(join(installPath, "skills", "graphit", "SKILL.md"))
    : null;
  const versionJson = installPath
    ? tryReadJson(join(installPath, "skills", "graphit", "VERSION.json"))?.version
    : null;
  return {
    installPath,
    entryVersion: typeof entry.version === "string" ? entry.version : null,
    skillVersion,
    versionJson: versionJson ?? null,
    effectiveVersion: skillVersion ?? versionJson ?? (typeof entry.version === "string" ? entry.version : null),
  };
}

function repairSourceLooksCurrent(sourceRoot, currentVersion) {
  if (!isStrictSemver(currentVersion)) return false;
  const skillVersion = readFrontmatterVersion(join(sourceRoot, "skills", "graphit", "SKILL.md"));
  const versionJson = tryReadJson(join(sourceRoot, "skills", "graphit", "VERSION.json"))?.version;
  const claudePlugin = tryReadJson(join(sourceRoot, ".claude-plugin", "plugin.json"))?.version;
  return skillVersion === currentVersion && versionJson === currentVersion && claudePlugin === currentVersion;
}

function copyRepairableBundle(sourceRoot, targetRoot) {
  if (!isWithinDirectory(targetRoot, claudePluginsRoot())) {
    throw new Error(`Refusing to repair outside Claude plugins directory: ${targetRoot}`);
  }

  const tmpRoot = `${targetRoot}.tmp-${process.pid}-${Date.now()}`;
  rmSync(tmpRoot, { recursive: true, force: true });
  mkdirSync(tmpRoot, { recursive: true });
  try {
    for (const entry of REPAIRABLE_BUNDLE_ENTRIES) {
      const source = join(sourceRoot, entry);
      if (!existsSync(source)) continue;
      cpSync(source, join(tmpRoot, entry), {
        recursive: true,
        force: true,
        verbatimSymlinks: true,
      });
    }
    try {
      chmodSync(join(tmpRoot, "bin", "graphit"), 0o755);
    } catch {
      // Windows or missing wrapper; integrity checks catch real packaging drift.
    }
    mkdirSync(dirname(targetRoot), { recursive: true });
    rmSync(targetRoot, { recursive: true, force: true });
    renameSync(tmpRoot, targetRoot);
  } catch (error) {
    rmSync(tmpRoot, { recursive: true, force: true });
    throw error;
  }
}

function updateClaudeInstalledEntriesOnDisk(installedFile, staleRecords, targetPath, currentVersion) {
  const now = new Date().toISOString();
  for (const record of staleRecords) {
    record.entry.installPath = targetPath;
    record.entry.version = currentVersion;
    record.entry.lastUpdated = now;
    if (typeof record.entry.installedAt !== "string") {
      record.entry.installedAt = now;
    }
  }
  atomicWriteJson(installedFile.path, installedFile.data);
}

function inspectClaudeInstalledPlugin(currentVersion, repair) {
  const installedFile = readClaudeInstalledFile();
  if (!installedFile) return { findings: [], metadata: [] };

  const metadata = [];
  const entries = graphitInstallEntries(installedFile.data);
  if (entries.length === 0) return { findings: [], metadata };

  const staleRecords = [];
  for (const record of entries) {
    const versionInfo = pluginEntryVersion(record.entry);
    metadata.push({
      label: `Claude Code installed ${PLUGIN_ID}`,
      version: versionInfo.effectiveVersion,
      installPath: versionInfo.installPath,
      entryVersion: versionInfo.entryVersion,
      skillVersion: versionInfo.skillVersion,
      scope: record.entry.scope ?? "user",
      projectPath: record.entry.projectPath ?? null,
    });

    if (
      versionIsBehind(versionInfo.effectiveVersion, currentVersion) ||
      versionIsBehind(versionInfo.entryVersion, currentVersion)
    ) {
      staleRecords.push({ ...record, versionInfo });
    }
  }

  if (staleRecords.length === 0) return { findings: [], metadata };

  const staleVersions = [...new Set(staleRecords.map((record) => record.versionInfo.effectiveVersion ?? "unknown"))].join(", ");
  const targetPath = claudeVersionedCachePath(currentVersion);

  if (!repair) {
    return {
      metadata,
      findings: [
        {
          type: "claude-installed-plugin-stale",
          message: `Claude Code installed Graphit plugin is stale (${staleVersions}), expected ${currentVersion}`,
          remediation: "Run `graphit plugin status --repair`, then restart/reload Claude Code. If you prefer the native plugin manager, run `/plugin marketplace update graphit-plugin`, then `/plugin update graphit@graphit-plugin`, then restart/reload.",
        },
      ],
    };
  }

  try {
    if (!repairSourceLooksCurrent(pluginRoot, currentVersion)) {
      throw new Error(`current npm/plugin bundle at ${pluginRoot} is missing synced ${currentVersion} plugin files`);
    }
    const targetSkillVersion = readFrontmatterVersion(join(targetPath, "skills", "graphit", "SKILL.md"));
    if (targetSkillVersion !== currentVersion) {
      copyRepairableBundle(pluginRoot, targetPath);
    }
    updateClaudeInstalledEntriesOnDisk(installedFile, staleRecords, targetPath, currentVersion);
    return {
      metadata,
      findings: [
        {
          type: "claude-installed-plugin-repaired",
          message: `Claude Code installed Graphit plugin was stale (${staleVersions}); repaired disk cache to ${currentVersion}`,
          remediation: `Restart/reload Claude Code so it loads the repaired plugin cache at ${targetPath}. The already-running session may still have the old SKILL.md in memory until then.`,
          repaired: true,
          installPath: targetPath,
        },
      ],
    };
  } catch (error) {
    return {
      metadata,
      findings: [
        {
          type: "claude-installed-plugin-stale",
          message: `Claude Code installed Graphit plugin is stale (${staleVersions}), expected ${currentVersion}; auto-repair failed: ${error instanceof Error ? error.message : String(error)}`,
          remediation: "Run `/plugin marketplace update graphit-plugin`, then `/plugin update graphit@graphit-plugin`, then restart/reload Claude Code. `graphit plugin status --repair` can repair from the npm bundle once the local files are writable.",
        },
      ],
    };
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

// Feature #743: stamp a per-session marker so the CLI can tell whether the plugin
// actually loaded THIS session. This SessionStart hook only runs when Claude Code
// loaded the plugin at session start - a mid-session install never runs it, so the
// marker is absent and the CLI can warn. The SessionStart payload carries session_id
// (the same value as the Bash tool's CLAUDE_CODE_SESSION_ID - both from getSessionId()),
// and the marker is keyed by it so concurrent sessions never clobber each other.
function stampSessionMarker() {
  if (hookEvent !== "SessionStart") return;
  let sessionId = "";
  try {
    sessionId = String(tryParseJson(readFileSync(0, "utf-8"))?.session_id ?? "").trim();
  } catch {
    return;
  }
  // The id becomes a filename, so accept only an id-shaped token (path-safety).
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(sessionId)) return;
  const dir = join(cacheRoot, "sessions");
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, sessionId), String(Date.now()), "utf-8");
    pruneOldSessionMarkers(dir);
  } catch {
    // Best-effort: a missing marker only costs an extra (harmless) CLI warning.
  }
}

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

// Feature #675: read session liveness locally (zero network) so the single
// startup check covers version AND auth. logged_in = a credentials file holding
// a refresh_token is present; email powers the greeting. The real token refresh
// stays lazy (first API call), so this is a liveness + identity signal, not a
// guarantee the token still validates. Pure (takes parsed creds) for testing;
// the file read (homedir/.graphit/credentials.json) mirrors auth/credentials.ts.
export function readAuthState(creds) {
  if (
    !creds ||
    typeof creds !== "object" ||
    typeof creds.refresh_token !== "string" ||
    creds.refresh_token.length === 0
  ) {
    return { logged_in: false, email: null };
  }
  return {
    logged_in: true,
    email: typeof creds.email === "string" && creds.email ? creds.email : null,
  };
}

async function collectStatus() {
  const bundleInfo = readBundleInfo(pluginRoot);
  const packageName = bundleInfo.packageName;
  const currentVersion = bundleInfo.currentVersion;
  const auth = readAuthState(tryReadJson(join(homedir(), ".graphit", "credentials.json")));
  if (!currentVersion) {
    return {
      packageName,
      sourceOfTruth: "plugin-bundle",
      currentVersion: null,
      latestVersion: null,
      auth,
      metadata: [],
      findings: [
        {
          type: "metadata-drift",
          message: `Could not determine Graphit plugin version from ${pluginRoot}`,
          remediation: "Reinstall the Graphit plugin from the marketplace, then rerun `graphit plugin status`.",
        },
      ],
    };
  }
  const findings = [];
  const metadata = [];
  const claudePlugin = bundleInfo.claudePlugin;
  const codexPlugin = tryReadJson(join(pluginRoot, ".codex-plugin", "plugin.json"));
  const marketplace = bundleInfo.marketplace;
  const marketplacePlugin = bundleInfo.marketplacePlugin;

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
    if (!isPreflight && version !== currentVersion) {
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
    marketplaceSource.package === packageName &&
    marketplaceSource.version === currentVersion;
  metadata.push({
    label: ".claude-plugin/marketplace.json source",
    version: marketplaceSource?.version ?? null,
    source: marketplaceSource ?? null,
  });
  if (!isPreflight && !sourceMatches) {
    findings.push({
      type: "metadata-drift",
      message: `.claude-plugin/marketplace.json source is ${
        marketplaceSource ? JSON.stringify(marketplaceSource) : "missing"
      }, expected npm source ${packageName}@${currentVersion}`,
      remediation: "Run `npm run sync:version` before publishing @graphit/cli.",
    });
  }

  const latestVersion = await getLatestVersion(currentVersion);
  if (!isPreflight && latestVersion && compareVersions(latestVersion, currentVersion) > 0) {
    findings.push({
      type: "package-update",
      message: `@graphit/cli update available: ${currentVersion} -> ${latestVersion}`,
      remediation: "This update is for the npm CLI binary (@graphit/cli), a separate artifact from the skill bundle. Update the binary with `npm install -g @graphit/cli@latest` (not `npm update -g`, which respects the original semver range and can miss the latest). If `graphit` resolves to a custom npm prefix (compare `command -v graphit` with `npm prefix -g`), reinstall to that prefix with `npm install -g @graphit/cli@latest --prefix <dir>` (<dir> = the parent of the bin dir holding graphit). The Claude Code/Codex skill bundle updates separately via `claude plugin update graphit@graphit-plugin` and does NOT update the binary.",
    });
  }

  const claudeInstall = inspectClaudeInstalledPlugin(currentVersion, shouldRepair);
  metadata.push(...claudeInstall.metadata);
  findings.push(...claudeInstall.findings);

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
    packageName,
    sourceOfTruth: "plugin-bundle",
    currentVersion,
    latestVersion,
    auth,
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

// Feature #675: run the CLI/hook flow only when executed directly (the `plugin
// status` command and the hooks both invoke `node plugin-status.mjs ...`), not
// when a test imports this module for the exported pure helpers - otherwise the
// top-level process.exit would kill the test runner.
function isMainModule() {
  try {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return true;
  }
}

if (isMainModule()) {
  if (hookEvent && !shouldRunForPrompt()) {
    process.exit(0);
  }

  // Feature #743: record that the plugin loaded this session (SessionStart only;
  // reads stdin before anything else would consume it).
  stampSessionMarker();

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
}
