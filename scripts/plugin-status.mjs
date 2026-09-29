#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  CACHE_SCHEMA_VERSION,
  CLAUDE_PLUGIN_NAME,
  PACKAGE_NAME,
  atomicWriteJson,
  compareVersions,
  isStrictSemver,
  readFrontmatterVersion,
  tryParseJson,
  tryReadJson,
} from "./plugin-status/common.mjs";
import { inspectClaudeInstalledPlugin } from "./plugin-status/claude-install.mjs";
import { cloudRefreshApplies, refreshPluginInCloud } from "./plugin-status/cloud-refresh.mjs";
import { armCutoff, buildHookNudges, shouldRunForPrompt, stampSessionMarker } from "./plugin-status/hook-io.mjs";

// Project #246: GRAPHIT_REGISTRY_URL lets tests point at a local server and
// supports private/enterprise registries; defaults to the public npm registry.
const REGISTRY_URL =
  process.env.GRAPHIT_REGISTRY_URL ?? "https://registry.npmjs.org/@graphit/cli/latest";
// Feature #1042: this list stays in the entry file - plugin-commands.test.mjs reads
// it from here to prove `--repair` keeps `commands`.
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
// Feature #1042: the budget every hook run had before hooks.json gave startup 120 s.
const LOCAL_HOOK_CUTOFF_MS = 5000;
const args = new Set(process.argv.slice(2));
const shouldRepair = args.has("--repair") || args.has("--auto-repair");
const isPreflight = args.has("--preflight");
const hookIndex = process.argv.indexOf("--hook");
const hookEvent = hookIndex >= 0 ? process.argv[hookIndex + 1] : null;
const pluginRootFromEnv =
  process.env.CLAUDE_PLUGIN_ROOT ??
  process.env.CODEX_PLUGIN_ROOT ??
  process.env.GRAPHIT_PLUGIN_ROOT;
const pluginRoot = pluginRootFromEnv ?? dirname(dirname(fileURLToPath(import.meta.url)));
// Issue #994: a plugin root variable means this run inspects the bundle an
// assistant loaded (hooks get CLAUDE_PLUGIN_ROOT, the bin/graphit wrapper exports
// GRAPHIT_PLUGIN_ROOT). That bundle's CLI already tracks npm latest through npx, so
// a newer release means the BUNDLE is behind. Without one, this run inspects the
// npm package it ships in - a CLI launched without the plugin, i.e. a global install.
const inspectsPluginBundle = pluginRootFromEnv !== undefined;
const PLUGIN_UPDATE_STEPS =
  "In Claude Code run `/plugin marketplace update graphit-plugin`, then `/plugin update graphit@graphit-plugin`, " +
  "then restart Claude Code (asking to update Graphit runs the same steps via `/graphit:update`). " +
  "In Codex, update the Graphit plugin through its plugin manager.";
// Project #246: the version cache must be shared between this SessionStart hook
// and the bin/graphit wrapper (agent Bash tool). CLAUDE_PLUGIN_DATA is set
// per-plugin/per-context by Claude Code and is NOT guaranteed identical across
// those two contexts, so it is intentionally excluded here - a fixed, graphit-
// owned dir guarantees both sides agree. GRAPHIT_PLUGIN_DATA overrides.
const cacheRoot = process.env.GRAPHIT_PLUGIN_DATA ?? join(homedir(), ".graphit");

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

function writeCache(path, latestVersion) {
  atomicWriteJson(path, {
    schemaVersion: CACHE_SCHEMA_VERSION,
    packageName: PACKAGE_NAME,
    latestVersion,
    checkedAt: Date.now(),
  });
}

// Feature #1042: `fresh` skips a cache hit - a cloud startup decides whether to update
// from it, and a snapshot can carry a cache written before the latest release.
async function getLatestVersion(currentVersion, { fresh = false } = {}) {
  if (args.has("--skip-network")) return null;

  const cachePath = join(cacheRoot, "plugin-status.json");
  const cache = tryReadJson(cachePath);
  const cachedVersion = isValidVersionCache(cache) ? cache.latestVersion : null;
  if (!fresh && cachedVersion && Date.now() - cache.checkedAt < TTL_MS) {
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

// Feature #1042: the hook's stdin can be read only once, so it is read here for
// both hook events that use it, and only in hook mode - `graphit plugin status`
// in a terminal must never wait on a TTY. raw is null when the read fails.
function readHookInput() {
  if (hookEvent !== "SessionStart" && hookEvent !== "UserPromptSubmit") {
    return { raw: "", parsed: null };
  }
  try {
    const raw = readFileSync(0, "utf-8");
    return { raw, parsed: tryParseJson(raw) };
  } catch {
    return { raw: null, parsed: null };
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

  // Issue #994: only the npm package (and the repo's cli/ dir) carries package.json
  // and the npm-shaped marketplace.json that sync:version stamps. A bundle installed
  // from the git marketplace ships that repo's own catalog (source "./", no
  // metadata) by design, so the catalog checks are publisher checks - CI gates them
  // (`check:version`, `sync-plugin-marketplace.sh verify`) - and a customer who hits
  // real drift needs a plugin update, not a publish step.
  const isPackageLayout = existsSync(join(pluginRoot, "package.json"));
  const driftRemediation = isPackageLayout
    ? "Run `npm run sync:version` before publishing @graphit/cli."
    : `This installed Graphit plugin bundle is inconsistent. Update or reinstall it: ${PLUGIN_UPDATE_STEPS}`;

  const versionChecks = [
    [".claude-plugin/plugin.json", claudePlugin?.version],
    [".codex-plugin/plugin.json", codexPlugin?.version],
    ...(isPackageLayout
      ? [[".claude-plugin/marketplace.json metadata", marketplace?.metadata?.version]]
      : []),
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
        remediation: driftRemediation,
      });
    }
    metadata.push({ label, version: version ?? null });
  }

  const marketplaceSource = marketplacePlugin?.source;
  metadata.push({
    label: ".claude-plugin/marketplace.json source",
    version: marketplaceSource?.version ?? null,
    source: marketplaceSource ?? null,
  });
  const sourceMatches =
    marketplaceSource?.source === "npm" &&
    marketplaceSource.package === packageName &&
    marketplaceSource.version === currentVersion;
  if (!isPreflight && isPackageLayout && !sourceMatches) {
    findings.push({
      type: "metadata-drift",
      message: `.claude-plugin/marketplace.json source is ${
        marketplaceSource ? JSON.stringify(marketplaceSource) : "missing"
      }, expected npm source ${packageName}@${currentVersion}`,
      remediation: driftRemediation,
    });
  }

  const latestVersion = await getLatestVersion(currentVersion);
  if (!isPreflight && latestVersion && compareVersions(latestVersion, currentVersion) > 0) {
    findings.push(
      inspectsPluginBundle
        ? {
            type: "plugin-update",
            message: `Graphit plugin update available: ${currentVersion} -> ${latestVersion}`,
            remediation: `The plugin runs the latest Graphit CLI automatically; what is behind is the plugin bundle itself (skills, hooks and commands at ${currentVersion}). ${PLUGIN_UPDATE_STEPS} Do not install @graphit/cli globally: a global install shadows the plugin's CLI on PATH.`,
          }
        : {
            type: "package-update",
            message: `@graphit/cli update available: ${currentVersion} -> ${latestVersion}`,
            remediation: "This update is for the npm CLI binary (@graphit/cli), a separate artifact from the skill bundle. Update the binary with `npm install -g @graphit/cli@latest` (not `npm update -g`, which respects the original semver range and can miss the latest). If `graphit` resolves to a custom npm prefix (compare `command -v graphit` with `npm prefix -g`), reinstall to that prefix with `npm install -g @graphit/cli@latest --prefix <dir>` (<dir> = the parent of the bin dir holding graphit). The Claude Code/Codex skill bundle updates separately via `claude plugin update graphit@graphit-plugin` and does NOT update the binary.",
          },
    );
  }

  const claudeInstall = inspectClaudeInstalledPlugin(currentVersion, shouldRepair, {
    pluginRoot,
    repairableEntries: REPAIRABLE_BUNDLE_ENTRIES,
  });
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
  const hookInput = readHookInput();
  if (hookEvent && !shouldRunForPrompt(hookEvent, hookInput.raw, hookInput.parsed)) {
    process.exit(0);
  }

  const cloudStartup = cloudRefreshApplies({ hookEvent, source: hookInput.parsed?.source, env: process.env });
  if (hookEvent && !cloudStartup) armCutoff(LOCAL_HOOK_CUTOFF_MS);

  // Feature #743: record that the plugin loaded this session (SessionStart only).
  stampSessionMarker(hookEvent, hookInput.parsed, cacheRoot);

  // Feature #1042: update before the status read, so a cloud startup reports the
  // version it leaves on disk rather than asking the agent for /plugin update.
  let refreshLine = null;
  if (cloudStartup) {
    const installed = readBundleInfo(pluginRoot).currentVersion;
    try {
      refreshLine = await refreshPluginInCloud({
        pluginRoot,
        installed,
        fetchLatest: () => getLatestVersion(installed, { fresh: true }),
        env: process.env,
      });
    } catch (error) {
      // A startup hook must never fail the session; the installed version keeps running.
      refreshLine = `Graphit plugin: update failed, running ${installed}: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  const status = await collectStatus();

  if (args.has("--json")) {
    console.log(JSON.stringify(status, null, 2));
  } else if (hookEvent) {
    const nudge = buildHookNudges(status, { cacheRoot, pluginRoot, suppressPluginUpdate: cloudStartup });
    const context = [refreshLine, nudge?.context].filter(Boolean).join("\n");
    if (context) {
      console.log(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: hookEvent,
          additionalContext: context,
        },
      }));
      nudge?.persist();
    }
  } else if (!args.has("--quiet") || status.findings.length > 0) {
    console.log(formatPlain(status));
  }

  process.exit(status.findings.length > 0 && args.has("--fail-on-findings") ? 1 : 0);
}
