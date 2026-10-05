// Project #305: where the running Graphit bundle was installed from, and the update
// advice that fits it. The install kind picks the remedy; the running host (Claude
// Code or Cursor, from the hook payload) gates host behavior elsewhere - route A puts
// Cursor's copy in the Claude cache, so the two answers differ there.
// Pure: no top-level side effects, no process.env reads; callers pass the roots in.
// Cursor facts (R-rows) are pinned in
// docs/workflow/projects/complete/305_cursor-plugin-parity/RESEARCH.md.

import { existsSync } from "node:fs";
import { join, relative, sep } from "node:path";

import {
  CLAUDE_MARKETPLACE_NAME,
  PACKAGE_NAME,
  compareVersions,
  isStrictSemver,
  isWithinDirectory,
  realpathSafe,
  versionIsBehind,
} from "./common.mjs";

// claude-cache: under the Claude Code plugins root (route A on Cursor lands here too).
// cursor-local: our `setup --editor cursor` copy. cursor-marketplace: a Cursor
// marketplace copy. npx: the npm package in npm's npx cache, run with no plugin root
// variable. package: anything else - a global install or a checkout (today's logic).
export function classifyBundle(pluginRoot, { claudePluginsRoot, cursorPluginsRoot, hasRootEnv }) {
  const real = realpathSafe(pluginRoot);
  const under = (dir) => isWithinDirectory(real, realpathSafe(dir));
  if (under(claudePluginsRoot)) return { kind: "claude-cache" };
  if (under(join(cursorPluginsRoot, "local"))) return { kind: "cursor-local" };
  const cursorCache = join(cursorPluginsRoot, "cache");
  if (under(cursorCache)) {
    // <cursor plugins>/cache/<marketplace>/graphit/<version>. Cursor auto-registers
    // Claude Code's graphit-plugin marketplace clone pinned to its SHA and never
    // refreshes it (R13), so that copy is updated by re-installing, not refreshing.
    const marketplace = relative(realpathSafe(cursorCache), real).split(sep)[0];
    const autoRegistered =
      marketplace === CLAUDE_MARKETPLACE_NAME &&
      existsSync(join(claudePluginsRoot, "marketplaces", CLAUDE_MARKETPLACE_NAME));
    return { kind: "cursor-marketplace", autoRegistered };
  }
  if (!hasRootEnv && real.split(sep).includes("_npx")) return { kind: "npx" };
  return { kind: "package" };
}

// The kinds whose bundle Claude Code manages; their advice is unchanged byte for byte.
export function isClaudeManagedKind(kind) {
  return kind === "claude-cache" || kind === "package";
}

const CLAUDE_STEPS =
  "In Claude Code run `/plugin marketplace update graphit-plugin`, then `/plugin update graphit@graphit-plugin`, " +
  "then restart Claude Code (asking to update Graphit runs the same steps via `/graphit:update`). " +
  "In Codex, update the Graphit plugin through its plugin manager.";
const CURSOR_REINSTALL =
  "Cursor installed this copy from Claude Code's graphit-plugin marketplace, which it pins and never refreshes: " +
  "re-install Graphit in Cursor's Plugins settings, then reload Cursor.";
const CURSOR_REFRESH =
  "In Cursor's Plugins settings, refresh the marketplace Graphit was installed from, then reload Cursor. " +
  "If your admin requires the plugin, ask them to update it.";

// Project #305: a version reaches a command only after the strict-semver check, and the
// package is only ever @graphit/cli; without a valid version the spec stays unpinned.
function cliSpec(version) {
  return isStrictSemver(version) ? `${PACKAGE_NAME}@${version}` : PACKAGE_NAME;
}

export function cursorSetupCommand(version, flag) {
  return `npx -y ${cliSpec(version)} setup --editor cursor ${flag}`;
}

// The update steps for the bundle's install kind. `latestVersion` is the version the
// update moves to; it is interpolated only when it is strict semver.
export function pluginUpdateSteps({ kind, autoRegistered = false }, latestVersion) {
  const cursorLocal = `run \`${cursorSetupCommand(latestVersion, "--update")}\`, then reload Cursor`;
  switch (kind) {
    case "cursor-local":
      return `In Cursor, ${cursorLocal}.`;
    case "cursor-marketplace":
      return autoRegistered ? CURSOR_REINSTALL : CURSOR_REFRESH;
    case "npx":
      // The npx package cannot tell which assistant loaded it: name every host's way.
      return (
        "Update the Graphit plugin in your assistant. In Claude Code run `/plugin marketplace update graphit-plugin`, " +
        "then `/plugin update graphit@graphit-plugin`, then restart Claude Code. In Codex, use its plugin manager. " +
        `In Cursor, ${cursorLocal} (a Cursor marketplace copy is re-installed or refreshed in Cursor's Plugins settings instead).`
      );
    default:
      return CLAUDE_STEPS;
  }
}

// The plugin-update finding's remediation. The Claude Code wording is unchanged. Only
// Claude Code puts the plugin's bin/ on PATH, so only there can a global install shadow
// it; Cursor and an npx run call a pinned `npx -y @graphit/cli@<version>` instead.
export function pluginUpdateRemediation(bundle, currentVersion, latestVersion) {
  const steps = pluginUpdateSteps(bundle, latestVersion);
  if (isClaudeManagedKind(bundle.kind)) {
    return `The plugin runs the latest Graphit CLI automatically; what is behind is the plugin bundle itself (skills, hooks and commands at ${currentVersion}). ${steps} Do not install @graphit/cli globally: a global install shadows the plugin's CLI on PATH.`;
  }
  return `What is behind is the Graphit plugin bundle itself (skills and hooks at ${currentVersion}). ${steps}`;
}

// The hook's plugin-update line. The Claude Code wording is unchanged byte for byte.
export function pluginUpdateNudge(bundle, currentVersion, latestVersion) {
  const head = `- A newer Graphit plugin is available (${currentVersion} -> ${latestVersion}). `;
  if (isClaudeManagedKind(bundle.kind)) {
    return (
      head +
      "Tell the user once to update it with `/plugin marketplace update graphit-plugin`, then " +
      "`/plugin update graphit@graphit-plugin`, then restart Claude Code; the CLI itself already runs the latest release."
    );
  }
  return `${head}Tell the user once how to update it: ${pluginUpdateSteps(bundle, latestVersion)}`;
}

// The finding types cursorFindings() emits; the hook nudges surface them once a day.
export const CURSOR_FINDING_TYPES = ["cursor-double-load", "cursor-local-plugin-stale", "legacy-cursor-rule-present"];

// Project #305: the Cursor-side findings, from one inspectCursor() result. Report-only:
// each remedy is a command the user runs; nothing here deletes or installs.
export function cursorFindings(inspection, { pluginRoot, currentVersion, latestVersion }) {
  const target =
    isStrictSemver(latestVersion) && isStrictSemver(currentVersion) && compareVersions(latestVersion, currentVersion) > 0
      ? latestVersion
      : currentVersion;
  const removeCommand = cursorSetupCommand(target, "--remove-legacy-copies");
  const { local, routeA, routeC } = inspection;
  const findings = [];
  if (inspection.doubleLoad) {
    // Cursor never dedupes a local plugin against an imported or marketplace copy (R12).
    const others = [
      ...((routeA?.effectiveFor.length ?? 0) > 0 ? ["Claude Code's Graphit plugin, which Cursor imports"] : []),
      ...(routeC ? [`a Cursor marketplace copy (${routeC.paths.join(", ")})`] : []),
    ];
    // The local copy is user-wide: when only a project-enabled Claude Code plugin doubles it,
    // removing the copy would strip Graphit from every other project.
    const projectOnlyA = !routeA?.userWide && !routeC;
    findings.push({
      type: "cursor-double-load",
      message: `Cursor loads Graphit twice: the local copy at ${local.path} and ${others.join(" and ")}`,
      remediation: projectOnlyA
        ? "Every Graphit skill and hook runs twice in this project. Graphit's Claude Code plugin is on for this project only, and the local copy serves your other projects, so turn the Claude Code plugin off here with `claude plugin disable graphit@graphit-plugin` (run it in this project), then reload Cursor."
        : `Every Graphit skill and hook runs twice. Remove the redundant local copy with \`${removeCommand}\`, then reload Cursor.`,
    });
  } else if (local && realpathSafe(local.path) !== realpathSafe(pluginRoot) && versionIsBehind(local.version, target)) {
    // The running local copy is covered by the plugin-update finding instead.
    // Both versions come from user-writable files: interpolated only when strict semver.
    const found = isStrictSemver(local.version) ? ` is ${local.version}` : " is out of date";
    const expected = isStrictSemver(target) ? `, expected ${target}` : "";
    findings.push({
      type: "cursor-local-plugin-stale",
      message: `Cursor's local Graphit plugin at ${local.path}${found}${expected}`,
      remediation: `Run \`${cursorSetupCommand(target, "--update")}\`, then reload Cursor.`,
    });
  }
  for (const rule of inspection.legacyRules) {
    findings.push({
      type: "legacy-cursor-rule-present",
      message: `Cursor legacy Graphit rule exists at ${rule}`,
      remediation: `Cursor loads Graphit as a plugin now, so this copied rule is a stale duplicate. Remove it with \`${removeCommand}\` (run it in that project for a project rule).`,
    });
  }
  return findings;
}
