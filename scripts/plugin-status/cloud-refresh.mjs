// Feature #1042: on a cloud session's fresh start, update the installed plugin to the
// latest release before the session uses it. Cloud environments reuse a setup-script
// snapshot for about a week, and the agent itself may not run `claude plugin update`
// (auto mode denies it) or `/reload-plugins` (user-only); a hook is configured code, and
// a cloud VM is thrown away after the run, so an update there touches nothing that lasts.
// Laptops never reach this module: their sessions keep today's "update available" notice.

import { execFile } from "node:child_process";
import { basename, dirname, join, resolve } from "node:path";

import { compareVersions, isStrictSemver, tryParseJson, tryReadJson } from "./common.mjs";

const DEFAULT_BUDGET_MS = 90_000;

export function cloudRefreshApplies({ hookEvent, source, env }) {
  return (
    hookEvent === "SessionStart" &&
    source === "startup" &&
    env.CLAUDE_CODE_REMOTE === "true" &&
    env.GRAPHIT_PLUGIN_SELF_UPDATE !== "0"
  );
}

// Claude Code installs a marketplace plugin at <plugins>/cache/<marketplace>/<plugin>/<version>
// and keeps the marketplace clone at <plugins>/marketplaces/<marketplace>. Anything else
// (a --plugin-dir checkout, the npm package) is not ours to update.
function pluginCacheLayout(pluginRoot) {
  const pluginDir = dirname(resolve(pluginRoot));
  const marketplaceDir = dirname(pluginDir);
  const cacheDir = dirname(marketplaceDir);
  if (basename(cacheDir) !== "cache") return null;
  return { pluginsRoot: dirname(cacheDir), marketplace: basename(marketplaceDir), plugin: basename(pluginDir) };
}

function marketplaceVersion({ pluginsRoot, marketplace, plugin }) {
  const clone = join(pluginsRoot, "marketplaces", marketplace, ".claude-plugin");
  const plugins = tryReadJson(join(clone, "marketplace.json"))?.plugins;
  const listed = Array.isArray(plugins) ? plugins.find((entry) => entry?.name === plugin) : null;
  return listed?.version ?? tryReadJson(join(clone, "plugin.json"))?.version ?? null;
}

function installedVersionFromList(stdout, id) {
  const parsed = tryParseJson(stdout);
  const entries = Array.isArray(parsed) ? parsed : parsed?.plugins ?? parsed?.installed ?? [];
  if (!Array.isArray(entries)) return null;
  const entry = entries.find((item) => item?.id === id || `${item?.name}@${item?.marketplace}` === id);
  return isStrictSemver(entry?.version) ? entry.version : null;
}

function runClaude(args, deadline) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) return Promise.resolve({ error: "timeout" });
  return new Promise((done) => {
    execFile("claude", args, { timeout: remaining, killSignal: "SIGKILL", maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (!error) return done({ stdout });
      if (error.code === "ENOENT") return done({ error: "claude not found" });
      if (error.killed) return done({ error: "timeout" });
      const lastLine = String(stderr ?? "").trim().split("\n").pop();
      return done({ error: lastLine || `exit ${error.code}` });
    });
  });
}

// Returns the one line the hook prints at a cloud startup. Never throws: every failure
// leaves the installed version in place and says why.
export async function refreshPluginInCloud({ pluginRoot, installed, fetchLatest, env }) {
  const line = (text) => `Graphit plugin: ${text}`;
  if (!isStrictSemver(installed)) return line("update skipped: the installed version is unreadable");

  // Stage 1 - the cheap gate: nothing newer published, nothing to do.
  const latest = await fetchLatest();
  if (!isStrictSemver(latest)) return line(`update failed, running ${installed}: could not read the published version`);
  if (compareVersions(latest, installed) <= 0) return line(`current (${installed})`);

  const layout = pluginCacheLayout(pluginRoot);
  if (!layout) return line(`update skipped, running ${installed}: not a plugin-cache install`);
  const id = `${layout.plugin}@${layout.marketplace}`;
  const budget = Number(env.GRAPHIT_PLUGIN_REFRESH_BUDGET_MS);
  const deadline = Date.now() + (budget > 0 ? budget : DEFAULT_BUDGET_MS);

  // Stage 2 - npm publishes before the marketplace; update only what the marketplace offers.
  const catalog = await runClaude(["plugin", "marketplace", "update", layout.marketplace], deadline);
  if (catalog.error) return line(`update failed, running ${installed}: ${catalog.error}`);
  const offered = marketplaceVersion(layout);
  if (isStrictSemver(offered) && compareVersions(offered, installed) <= 0) {
    return line(`marketplace still at ${offered} (npm has ${latest})`);
  }

  // Stage 3 - the update itself, then the version now on disk.
  const update = await runClaude(["plugin", "update", id], deadline);
  if (update.error) return line(`update failed, running ${installed}: ${update.error}`);
  const list = await runClaude(["plugin", "list", "--json"], deadline);
  const after = list.error ? null : installedVersionFromList(list.stdout, id);
  if (!after) return line(`updated ${installed} -> unknown on disk (could not read the installed version)`);
  if (compareVersions(after, installed) <= 0) return line(`update failed, running ${installed}: version unchanged after update`);
  return line(`updated ${installed} -> ${after} on disk`);
}
