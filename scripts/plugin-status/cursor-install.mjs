// Project #305: the Cursor installer and inspector. Cursor can load Graphit three
// ways: route A (Cursor imports the Claude Code plugin), route B (our copy in
// <cursor plugins>/local/graphit) and route C (a Cursor marketplace copy). Local
// plugins are never deduped against A or C, so a local copy next to either one
// loads every skill and hook twice. Setup, status and removal all decide from the
// one inspectCursor() result. File reads only, no network; never runs npm.

import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { realpathSync, renameSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { PLUGIN_ID, isStrictSemver, isWithinDirectory, readFrontmatterVersion, tryReadJson } from "./common.mjs";

export function cursorPluginsRoot(home = homedir()) {
  return process.env.CURSOR_PLUGINS_ROOT ?? join(home, ".cursor", "plugins");
}

function resolveRoots(options = {}) {
  const home = options.home ?? homedir();
  const workspaceRoots = [];
  for (const root of options.workspaceRoots ?? []) {
    // Hook-supplied roots are untrusted: absolute, existing directories only.
    if (typeof root !== "string" || !isAbsolute(root) || !isDirectory(root)) continue;
    if (!workspaceRoots.includes(root)) workspaceRoots.push(root);
  }
  return {
    home,
    claudePluginsRoot: options.claudePluginsRoot ?? process.env.CLAUDE_PLUGINS_ROOT ?? join(home, ".claude", "plugins"),
    cursorPluginsRoot: options.cursorPluginsRoot ?? cursorPluginsRoot(home),
    workspaceRoots,
  };
}

function attempt(read, fallback) {
  try {
    return read();
  } catch {
    return fallback;
  }
}

const isDirectory = (path) => attempt(() => statSync(path).isDirectory(), false);
const realpathOr = (path) => attempt(() => realpathSync(path), resolve(path));

// realpath of the nearest existing ancestor, plus the not-yet-created remainder.
function realpathNearest(path) {
  let current = resolve(path);
  const rest = [];
  for (;;) {
    try {
      return join(realpathSync(current), ...rest.reverse());
    } catch {
      const parent = dirname(current);
      if (parent === current) return resolve(path);
      rest.push(basename(current));
      current = parent;
    }
  }
}

function readJsonState(path) {
  if (!existsSync(path)) return { state: "missing" };
  const data = attempt(() => JSON.parse(readFileSync(path, "utf-8")), null);
  return data && typeof data === "object" && !Array.isArray(data) ? { state: "ok", data } : { state: "bad" };
}

function enabledValue(settings) {
  const value = settings?.enabledPlugins?.[PLUGIN_ID];
  return typeof value === "boolean" ? value : undefined;
}

function graphitEntries(installed) {
  const plugins = installed.plugins && typeof installed.plugins === "object" ? installed.plugins : installed;
  const raw = plugins?.[PLUGIN_ID];
  if (Array.isArray(raw)) return raw.filter((entry) => entry && typeof entry === "object");
  return raw && typeof raw === "object" ? [raw] : [];
}

// Cursor merges ~/.claude/settings.json, then <root>/.claude/settings.json, then
// settings.local.json; the last value set wins. Returns null when a file is unreadable.
function workspaceSettings(root) {
  const values = [];
  for (const name of ["settings.json", "settings.local.json"]) {
    const read = readJsonState(join(root, ".claude", name));
    if (read.state === "bad") return { bad: join(root, ".claude", name) };
    if (read.state === "ok") values.push(enabledValue(read.data));
  }
  return { values };
}

function mergedEnabled(userValue, values) {
  let enabled = userValue;
  for (const value of values) if (value !== undefined) enabled = value;
  return enabled === true;
}

function resolveRouteA({ home, claudePluginsRoot, workspaceRoots }, uncertain) {
  const none = { routeA: null, otherProjects: [] };
  const installedPath = join(claudePluginsRoot, "installed_plugins.json");
  const installed = readJsonState(installedPath);
  if (installed.state === "missing") {
    if (existsSync(claudePluginsRoot)) {
      uncertain.push(`Claude Code's plugin list is missing (${installedPath}), so Graphit's Claude Code plugin was not checked.`);
    }
    return none;
  }
  if (installed.state === "bad") {
    uncertain.push(`Claude Code's plugin list could not be read (${installedPath}), so Graphit's Claude Code plugin was not checked.`);
    return none;
  }
  const entries = graphitEntries(installed.data);
  if (entries.length === 0) return none;

  const userSettingsPath = join(home, ".claude", "settings.json");
  const user = readJsonState(userSettingsPath);
  const hasUserEntry = entries.some((entry) => (entry.scope ?? "user") === "user");
  if (user.state === "bad" || (user.state === "missing" && hasUserEntry)) {
    uncertain.push(`Graphit is installed in Claude Code, but ${userSettingsPath} is ${user.state === "bad" ? "unreadable" : "missing"}, so whether Cursor imports it is unknown.`);
    return none;
  }
  const userValue = user.state === "ok" ? enabledValue(user.data) : undefined;

  const perRoot = new Map();
  for (const root of workspaceRoots) {
    const settings = workspaceSettings(root);
    if (settings.bad) {
      uncertain.push(`${settings.bad} could not be read, so whether Cursor imports Graphit's Claude Code plugin there is unknown.`);
      return none;
    }
    perRoot.set(root, mergedEnabled(userValue, settings.values));
  }

  let userEntry = null;
  let userWide = false;
  const effectiveFor = new Set();
  const projectEntries = [];
  const otherProjects = [];
  for (const entry of entries) {
    const scope = entry.scope ?? "user";
    if (scope === "user") {
      userEntry = userEntry ?? entry;
      userWide = userWide || userValue === true;
      for (const [root, enabled] of perRoot) if (enabled) effectiveFor.add(root);
      continue;
    }
    if (typeof entry.projectPath !== "string" || !isAbsolute(entry.projectPath)) continue;
    const projectReal = realpathOr(entry.projectPath);
    const root = workspaceRoots.find((candidate) => realpathOr(candidate) === projectReal);
    if (root) {
      if (perRoot.get(root)) {
        effectiveFor.add(root);
        projectEntries.push(entry);
      }
      continue;
    }
    // Another project: read for the warning only; unreadable there is not our workspace.
    const settings = workspaceSettings(entry.projectPath);
    if (!settings.bad && mergedEnabled(userValue, settings.values)) otherProjects.push(entry.projectPath);
  }

  const chosen = userEntry && (userWide || effectiveFor.size > 0) ? userEntry : projectEntries[0];
  if (!chosen) return { routeA: null, otherProjects };
  return {
    routeA: {
      scope: chosen === userEntry ? "user" : "project",
      effectiveFor: workspaceRoots.filter((root) => effectiveFor.has(root)),
      userWide,
      version: typeof chosen.version === "string" ? chosen.version : null,
      installPath: typeof chosen.installPath === "string" ? chosen.installPath : null,
    },
    otherProjects,
  };
}

const listDirs = (path) =>
  attempt(() => readdirSync(path, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort(), []);

function resolveRouteC(cursorRoot) {
  const paths = [];
  for (const marketplace of listDirs(join(cursorRoot, "cache"))) {
    for (const version of listDirs(join(cursorRoot, "cache", marketplace, "graphit"))) {
      paths.push(join(cursorRoot, "cache", marketplace, "graphit", version));
    }
  }
  return paths.length > 0 ? { paths, certain: false } : null;
}

function readLocalVersion(path) {
  const version = tryReadJson(join(path, ".cursor-plugin", "plugin.json"))?.version;
  return typeof version === "string" ? version : null;
}

function resolveLocal(cursorRoot) {
  const path = join(cursorRoot, "local", "graphit");
  const stat = attempt(() => lstatSync(path), null);
  if (!stat) return null;
  const local = { path, version: readLocalVersion(path) };
  if (stat.isSymbolicLink()) local.symlink = true;
  return local;
}

export function inspectCursor(options = {}) {
  const roots = resolveRoots(options);
  const uncertain = [];
  const { routeA, otherProjects } = resolveRouteA(roots, uncertain);
  const routeC = resolveRouteC(roots.cursorPluginsRoot);
  const local = resolveLocal(roots.cursorPluginsRoot);
  const legacyRules = [];
  for (const base of [roots.home, ...roots.workspaceRoots]) {
    const rule = join(base, ".cursor", "rules", "graphit.mdc");
    if (!legacyRules.includes(rule) && existsSync(rule)) legacyRules.push(rule);
  }
  return {
    routeA,
    routeC,
    local,
    legacyRules,
    doubleLoad: !!local && ((routeA?.effectiveFor.length ?? 0) > 0 || !!routeC),
    uncertain,
    // Project-scoped Claude Code installs enabled in a project outside these roots.
    routeAOtherProjects: otherProjects,
  };
}

// Project #305: the only package entries a Cursor local copy gets. Never package.json,
// hooks/hooks.json, .claude-plugin, commands, bin or the frozen .mdc (no npm, no lifecycle scripts).
const ALLOWLIST = [
  ".cursor-plugin",
  "skills",
  join("hooks", "cursor-hooks.json"),
  // Feature #1099: the graphit-view MCP App's runtime files (never its sources).
  join("hooks", "query-view-app", "server.mjs"),
  join("hooks", "query-view-app", "query-view.html"),
  join("scripts", "plugin-status"),
  ...["plugin-status.mjs", "block-legacy-setup.mjs", "show-query-result.mjs"].map((name) => join("scripts", name)),
];
const SKILL_EXCLUDES = [join("skills", "graphit", "graphit.mdc"), join("skills", "graphit", "cursor")];

function defaultPackageRoot() {
  return dirname(dirname(dirname(fileURLToPath(import.meta.url))));
}

// The three stamped versions must agree, or the package is partial.
function readSourceVersion(packageRoot) {
  const manifest = readLocalVersion(packageRoot);
  const versionJson = tryReadJson(join(packageRoot, "skills", "graphit", "VERSION.json"))?.version;
  const skill = readFrontmatterVersion(join(packageRoot, "skills", "graphit", "SKILL.md"));
  return isStrictSemver(manifest) && manifest === versionJson && manifest === skill ? manifest : null;
}

function copyAllowlist(packageRoot, target) {
  for (const entry of ALLOWLIST) {
    const source = join(packageRoot, entry);
    if (!existsSync(source)) throw new Error(`the package is missing ${entry}`);
    mkdirSync(dirname(join(target, entry)), { recursive: true });
    cpSync(source, join(target, entry), {
      recursive: true,
      verbatimSymlinks: true,
      filter: (path) => {
        const rel = relative(packageRoot, path);
        // A link could point the installed copy outside the plugins folder.
        if (lstatSync(path).isSymbolicLink()) throw new Error(`the package has a symlink at ${rel}`);
        // Dot entries below an allowlist root (tool dirs like skills/.claude/) never ship.
        if (rel.split(sep).slice(1).some((part) => part.startsWith("."))) return false;
        return !SKILL_EXCLUDES.some((excluded) => rel === excluded || rel.startsWith(`${excluded}${sep}`));
      },
    });
  }
}

// The manifest and VERSION.json carry the version, and every script the Cursor
// hooks name exists. Runs on the staged copy and again after the swap (Feature #637).
function verifyBundle(dir, version) {
  if (readLocalVersion(dir) !== version) throw new Error(`${dir} has the wrong .cursor-plugin version`);
  if (tryReadJson(join(dir, "skills", "graphit", "VERSION.json"))?.version !== version) {
    throw new Error(`${dir} has the wrong skills/graphit/VERSION.json`);
  }
  const hooks = JSON.parse(readFileSync(join(dir, "hooks", "cursor-hooks.json"), "utf-8"));
  const scripts = Object.values(hooks.hooks ?? {}).flat().flatMap((entry) =>
    [...String(entry?.command ?? "").matchAll(/\$\{CURSOR_PLUGIN_ROOT\}\/([^"\s]+)/g)].map((match) => match[1]));
  if (scripts.length === 0) throw new Error("cursor-hooks.json names no scripts");
  for (const script of scripts) {
    const path = join(dir, script);
    if (!isWithinDirectory(path, dir) || !existsSync(path)) throw new Error(`hook script ${script} is missing`);
  }
  // Feature #1099: every manifest MCP server's plugin-root file exists too.
  const servers = tryReadJson(join(dir, ".cursor-plugin", "plugin.json"))?.mcpServers ?? {};
  for (const server of Object.values(servers)) {
    for (const arg of Array.isArray(server?.args) ? server.args : []) {
      const match = String(arg).match(/^\$\{CURSOR_PLUGIN_ROOT\}\/(.+)$/);
      if (!match) continue;
      const path = join(dir, match[1]);
      if (!isWithinDirectory(path, dir) || !existsSync(path)) throw new Error(`MCP server file ${match[1]} is missing`);
    }
  }
}

function contained(path, root) {
  return isWithinDirectory(realpathNearest(path), realpathNearest(root));
}

export function installCursorLocal(options = {}) {
  const { packageRoot = defaultPackageRoot(), update = false, dryRun = false, rename = renameSync } = options;
  const roots = resolveRoots(options);
  const state = options.inspection ?? inspectCursor(roots);
  const root = roots.cursorPluginsRoot;
  const path = join(root, "local", "graphit");
  const warnings = [];
  const result = (action, extra = {}) => ({ action, path, warnings, uncertain: state.uncertain, ...extra });

  if (state.routeA?.userWide) {
    // Enabled for all projects, but this workspace's .claude settings may turn it off.
    const disabledHere = roots.workspaceRoots.length > 0 && state.routeA.effectiveFor.length === 0;
    return result("skipped-route-a", { routeA: state.routeA, local: state.local, disabledHere });
  }
  if (state.routeC) return result("skipped-route-c", { paths: state.routeC.paths });
  if (state.routeA?.effectiveFor.length) {
    warnings.push(`Graphit's Claude Code plugin is enabled for ${state.routeA.effectiveFor.join(", ")}, so Cursor would load Graphit twice there.`);
  }
  for (const project of state.routeAOtherProjects ?? []) {
    warnings.push(`Graphit's Claude Code plugin is enabled for ${project}, so Cursor would load Graphit twice in that project.`);
  }

  const version = readSourceVersion(packageRoot);
  if (!version) return result("refused", { reason: `the package at ${packageRoot} has mismatched plugin versions` });
  if (state.local?.symlink) return result("refused", { reason: `${path} is a symlink (a dev link); remove it yourself first` });
  if (!contained(path, root)) return result("refused", { reason: `${path} resolves outside ${root}` });

  const previousVersion = state.local ? state.local.version : null;
  if (state.local && previousVersion === version) return result("noop", { version });
  if (state.local && !update) return result("exists", { version, previousVersion });
  if (dryRun) return result(state.local ? "would-update" : "would-install", { version, previousVersion });

  // Stage and park OUTSIDE local/: Cursor loads every non-dot dir there as a plugin.
  const stage = join(root, `.graphit-stage-${process.pid}`);
  const old = join(root, `.graphit-old-${process.pid}`);
  let parked = false;
  let swapped = false;
  try {
    mkdirSync(join(root, "local"), { recursive: true });
    if (!contained(path, root) || !contained(stage, root) || !contained(old, root)) {
      throw new Error(`a write target resolves outside ${root}`);
    }
    // A crashed run leaves dot dirs behind: a stage is disposable, a backup may be the user's only copy.
    for (const name of attempt(() => readdirSync(root), [])) {
      if (name.startsWith(".graphit-stage-")) rmSync(join(root, name), { recursive: true, force: true });
      else if (name.startsWith(".graphit-old-") && name !== basename(old)) {
        warnings.push(`An earlier install left a backup at ${join(root, name)}. If your Cursor copy is missing, move it back to ${path}; otherwise delete it.`);
      }
    }
    copyAllowlist(packageRoot, stage);
    verifyBundle(stage, version);
    if (state.local) {
      rmSync(old, { recursive: true, force: true });
      rename(path, old);
      parked = true;
    }
    rename(stage, path);
    swapped = true;
    verifyBundle(path, version);
  } catch (error) {
    let reason = error instanceof Error ? error.message : String(error);
    try {
      if (swapped) rmSync(path, { recursive: true, force: true });
      if (parked) rename(old, path);
    } catch {
      reason += `; restoring the previous copy also failed, so it is at ${old} - move it back to ${path}`;
    } finally {
      rmSync(stage, { recursive: true, force: true });
    }
    return result("failed", { version, previousVersion, reason });
  }
  if (parked) {
    try {
      rmSync(old, { recursive: true, force: true });
    } catch {
      warnings.push(`The previous copy is at ${old}; delete it yourself.`);
    }
  }
  return result(state.local ? "updated" : "installed", { version, previousVersion });
}

// Deletes the legacy .mdc rules and, with includeRedundantLocal, the local copy -
// but only while another copy loads in every project. The local copy is user-wide, so
// a Claude Code plugin enabled for this project alone never justifies removing it.
export function removeCursorLegacy(options = {}) {
  const roots = resolveRoots(options);
  const state = options.inspection ?? inspectCursor(roots);
  const removed = [];
  const wouldRemove = [];
  const kept = [];
  const failed = [];
  const remove = (path, recursive) => {
    if (options.dryRun) return wouldRemove.push(path);
    try {
      rmSync(path, { recursive, force: true });
      removed.push(path);
    } catch (error) {
      failed.push({ path, reason: error instanceof Error ? error.message : String(error) });
    }
  };

  for (const rule of state.legacyRules) remove(rule, false);
  const projectOnlyA = !state.routeA?.userWide && (state.routeA?.effectiveFor.length ?? 0) > 0;
  if (options.includeRedundantLocal && state.local) {
    const loadsEverywhere = !!state.routeA?.userWide || !!state.routeC;
    if (!loadsEverywhere && projectOnlyA) {
      kept.push({ path: state.local.path, reason: "Graphit's Claude Code plugin is on for this project only, and your other projects still need this copy" });
    } else if (!loadsEverywhere) kept.push({ path: state.local.path, reason: "it is the only Graphit copy Cursor loads" });
    else if (state.local.symlink) kept.push({ path: state.local.path, reason: "it is a symlink (a dev link)" });
    else if (!contained(state.local.path, roots.cursorPluginsRoot)) kept.push({ path: state.local.path, reason: "it resolves outside the Cursor plugins folder" });
    else remove(state.local.path, true);
  }
  // Only route C justified the removal, and whether Cursor enables it is unknown on disk.
  const reliesOnRouteC = !!state.routeC && !state.routeA?.userWide;
  const marketplacePaths = reliesOnRouteC && removed.includes(state.local?.path) ? state.routeC.paths : [];
  // A retired rule may have been the user's only Graphit in Cursor: say how to install the plugin.
  const ruleGone = state.legacyRules.some((rule) => removed.includes(rule) || wouldRemove.includes(rule));
  const copyLeft = (!!state.local && !removed.includes(state.local.path) && !wouldRemove.includes(state.local.path)) ||
    !!state.routeA?.userWide || projectOnlyA || !!state.routeC;
  return { removed, wouldRemove, kept, failed, uncertain: state.uncertain, marketplacePaths, installHint: ruleGone && !copyLeft };
}

const SETUP = "npx -y @graphit/cli setup --editor cursor";

const RELOAD = "Reload Cursor (Developer: Reload Window) to load it.";
// Versions here come from user-writable files: printed only when strict semver.
const v = (version) => (isStrictSemver(version) ? ` ${version}` : "");
const INSTALL_MESSAGES = {
  "skipped-route-a": (r) => [
    r.disabledHere
      ? `Cursor may already load Graphit through your Claude Code plugin (graphit@graphit-plugin${v(r.routeA.version)}): it is enabled for all projects but turned off in this workspace's .claude settings. Nothing to install.`
      : `Cursor already loads Graphit through your Claude Code plugin (graphit@graphit-plugin${v(r.routeA.version)}). Nothing to install.`,
    ...(r.local ? [`A local copy at ${r.local.path} also loads, so Cursor runs Graphit twice. Remove it with \`${SETUP} --remove-legacy-copies\`.`] : []),
  ],
  "skipped-route-c": (r) => [
    "Cursor may already load Graphit from its marketplace:",
    ...r.paths.map((path) => `  ${path}`),
    `Nothing was installed. To use the local copy instead, uninstall Graphit in Cursor's Plugins settings, then run \`${SETUP}\` again.`,
  ],
  noop: (r) => [`Graphit ${r.version} is already installed for Cursor at ${r.path}. Nothing to do.`],
  exists: (r) => [`Graphit${v(r.previousVersion)} is installed for Cursor at ${r.path}. Run \`${SETUP} --update\` to update it to ${r.version}.`],
  "would-install": (r) => [`Dry run - would install Graphit ${r.version} for Cursor at ${r.path}.`],
  "would-update": (r) => [`Dry run - would update Graphit${v(r.previousVersion)} to ${r.version} for Cursor at ${r.path}.`],
  installed: (r) => [`Installed Graphit ${r.version} for Cursor at ${r.path}.`, RELOAD],
  updated: (r) => [`Updated Graphit to ${r.version} for Cursor at ${r.path}.`, RELOAD],
};

function formatInstall(result) {
  const lines = INSTALL_MESSAGES[result.action]?.(result) ?? [`Graphit was not installed for Cursor: ${result.reason ?? result.action}.`];
  return [...lines, ...result.warnings.map((warning) => `Warning: ${warning}`)];
}

function formatRemoval(result, dryRun) {
  const lines = [];
  for (const path of result.wouldRemove) lines.push(`Would remove legacy Cursor copy: ${path}`);
  for (const path of result.removed) lines.push(`Removed legacy Cursor copy: ${path}`);
  for (const { path, reason } of result.kept) lines.push(`Kept ${path}: ${reason}.`);
  for (const { path, reason } of result.failed) lines.push(`Failed to remove ${path}: ${reason}`);
  if (result.marketplacePaths?.length) {
    lines.push(`Cursor now loads Graphit from its marketplace copy (${result.marketplacePaths.join(", ")}). If Graphit is gone after you reload Cursor, that copy is disabled: re-enable it in Cursor's Plugins settings.`);
  }
  if (result.installHint) lines.push(`Cursor has no other Graphit copy. Install the Cursor plugin with \`${SETUP}\`, then reload Cursor.`);
  if (lines.length === 0) lines.push(dryRun ? "Dry run - no legacy Cursor copies found." : "No legacy Cursor copies found.");
  return lines;
}

function main(argv) {
  const args = new Set(argv);
  const dryRun = args.has("--dry-run");
  const roots = { workspaceRoots: [process.cwd()] };
  let lines;
  let failed = false;
  let json;
  if (args.has("--install")) {
    const result = installCursorLocal({ ...roots, update: args.has("--update"), dryRun });
    json = { install: result };
    lines = formatInstall(result);
    failed = result.action === "failed" || result.action === "refused";
    // Flow 2: once the local copy is the one Cursor loads, retire the global .mdc rule.
    if (["installed", "updated", "noop", "would-install", "would-update"].includes(result.action)) {
      const removal = removeCursorLegacy({ workspaceRoots: [], dryRun: dryRun || result.action.startsWith("would-") });
      json.legacy = removal;
      if (removal.removed.length + removal.wouldRemove.length + removal.failed.length > 0) lines.push(...formatRemoval(removal, dryRun));
    }
    for (const reason of result.uncertain) lines.push(`Note: ${reason}`);
  } else if (args.has("--remove-legacy")) {
    const removal = removeCursorLegacy({ ...roots, includeRedundantLocal: true, dryRun });
    json = { legacy: removal };
    lines = formatRemoval(removal, dryRun);
    for (const reason of removal.uncertain) lines.push(`Note: ${reason}`);
    failed = removal.failed.length > 0;
  } else if (args.has("--inspect")) {
    json = inspectCursor(roots);
    lines = [JSON.stringify(json, null, 2)];
  } else {
    process.stderr.write("Usage: cursor-install.mjs --install [--update] [--dry-run] | --remove-legacy [--dry-run] | --inspect [--json]\n");
    return 2;
  }
  process.stdout.write(`${args.has("--json") ? JSON.stringify(json) : lines.join("\n")}\n`);
  return failed ? 1 : 0;
}

// realpath compare keeps a symlinked plugin root (a dev link) working: Node
// resolves import.meta.url through symlinks, argv[1] keeps the given path.
const isMainModule = () => attempt(() => import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href, false);

if (isMainModule()) {
  process.exitCode = main(process.argv.slice(2));
}
