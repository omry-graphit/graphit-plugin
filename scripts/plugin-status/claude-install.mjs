// Feature #1042: the Claude Code installed-plugin inspection and `--repair`, split
// out of plugin-status.mjs unchanged. The entry script passes its plugin root and
// REPAIRABLE_BUNDLE_ENTRIES in (the list stays in the entry file, where a test reads it).

import { chmodSync, cpSync, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import {
  CLAUDE_MARKETPLACE_NAME,
  CLAUDE_PLUGIN_NAME,
  PLUGIN_ID,
  atomicWriteJson,
  isStrictSemver,
  isWithinDirectory,
  readFrontmatterVersion,
  sanitizePathPart,
  tryReadJson,
  versionIsBehind,
} from "./common.mjs";

export function claudePluginsRoot() {
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
  // Project #305: a source without a current Cursor manifest would strip it from
  // the repaired cache, and Cursor's Claude import would load the crashing hooks.
  const cursorPlugin = tryReadJson(join(sourceRoot, ".cursor-plugin", "plugin.json"))?.version;
  return skillVersion === currentVersion && versionJson === currentVersion && claudePlugin === currentVersion &&
    cursorPlugin === currentVersion;
}

function copyRepairableBundle(sourceRoot, targetRoot, repairableEntries) {
  if (!isWithinDirectory(targetRoot, claudePluginsRoot())) {
    throw new Error(`Refusing to repair outside Claude plugins directory: ${targetRoot}`);
  }

  const tmpRoot = `${targetRoot}.tmp-${process.pid}-${Date.now()}`;
  rmSync(tmpRoot, { recursive: true, force: true });
  mkdirSync(tmpRoot, { recursive: true });
  try {
    for (const entry of repairableEntries) {
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

export function inspectClaudeInstalledPlugin(currentVersion, repair, { pluginRoot, repairableEntries }) {
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
      copyRepairableBundle(pluginRoot, targetPath, repairableEntries);
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
