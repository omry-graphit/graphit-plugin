#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REGISTRY_URL = "https://registry.npmjs.org/@graphit/cli/latest";
const TTL_MS = 24 * 60 * 60 * 1000;
const args = new Set(process.argv.slice(2));
const hookIndex = process.argv.indexOf("--hook");
const hookEvent = hookIndex >= 0 ? process.argv[hookIndex + 1] : null;
const pluginRoot =
  process.env.CLAUDE_PLUGIN_ROOT ??
  process.env.CODEX_PLUGIN_ROOT ??
  process.env.GRAPHIT_PLUGIN_ROOT ??
  dirname(dirname(fileURLToPath(import.meta.url)));
const cacheRoot =
  process.env.CLAUDE_PLUGIN_DATA ??
  process.env.CODEX_PLUGIN_DATA ??
  process.env.GRAPHIT_PLUGIN_DATA ??
  join(homedir(), ".graphit");

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

function writeCache(path, entry) {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(entry), "utf-8");
  } catch {
    // Cache writes should never break startup hooks.
  }
}

async function getLatestVersion(currentVersion) {
  if (args.has("--skip-network")) return null;

  const cachePath = join(cacheRoot, "plugin-status.json");
  const cache = readCache(cachePath);
  if (cache?.latestVersion && Date.now() - cache.checkedAt < TTL_MS) {
    return cache.latestVersion;
  }

  try {
    const response = await fetch(REGISTRY_URL, { signal: AbortSignal.timeout(1500) });
    if (!response.ok) return cache?.latestVersion ?? null;
    const data = await response.json();
    if (data && typeof data.version === "string") {
      writeCache(cachePath, { latestVersion: data.version, checkedAt: Date.now() });
      return data.version;
    }
  } catch {
    return cache?.latestVersion ?? null;
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
    ["skills/graphit/graphit.mdc", readFrontmatterVersion(join(pluginRoot, "skills", "graphit", "graphit.mdc"))],
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
      remediation: "Update Graphit through your assistant's plugin manager. Claude Code users can run `claude plugin update graphit`; Codex plugin users should use the Codex plugin update command. Standalone npm users can run `npm update -g @graphit/cli`.",
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

function formatHookContext(status) {
  if (status.findings.length === 0) return null;

  return [
    "Graphit plugin status check found actionable update/version information.",
    ...status.findings.map((finding) => `- ${finding.message}. ${finding.remediation}`),
  ].join("\n");
}

if (hookEvent && !shouldRunForPrompt()) {
  process.exit(0);
}

const status = await collectStatus();

if (args.has("--json")) {
  console.log(JSON.stringify(status, null, 2));
} else if (hookEvent) {
  const additionalContext = formatHookContext(status);
  if (additionalContext) {
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: hookEvent,
        additionalContext,
      },
    }));
  }
} else if (!args.has("--quiet") || status.findings.length > 0) {
  console.log(formatPlain(status));
}

process.exit(status.findings.length > 0 && args.has("--fail-on-findings") ? 1 : 0);
