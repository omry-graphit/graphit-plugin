# Install and Update

Load this only when installing, updating, or repairing Graphit itself: a `plugin status` update notice, a version mismatch, a copied-snapshot warning, or a Cursor install, double-load or leftover-rule finding. Skip it on every normal build, query, or health turn - `operations.md` covers the session-start check and health gate.

## Install and update

Graphit has two parts: the **CLI** (`@graphit/cli` on npm) and the **plugin bundle** (`graphit@graphit-plugin`: skills, references, hooks, commands). In Claude Code the plugin's `graphit` wrapper runs the CLI through npx at the latest npm release, so the CLI stays current on its own; the bundle changes only when the plugin is updated.

`graphit plugin status --json` names what is behind by the finding's `type`:

- `plugin-update` - the plugin bundle is behind. Update it with `/plugin marketplace update graphit-plugin`, then `/plugin update graphit@graphit-plugin` (`/graphit:update` runs both; in Codex, use its plugin manager), then restart: the running session keeps the old skill until then. In Cursor, a local copy updates with `npx -y @graphit/cli@<version> setup --editor cursor --update`, then a Cursor reload. A copy installed from Cursor's Plugins updates there: the auto-imported `graphit-plugin` copy stays pinned until it is re-installed; another marketplace copy needs a marketplace refresh, or the admin if the plugin is required. Use the version the finding names. Never suggest a global `npm install -g @graphit/cli` here - it shadows the plugin's wrapper on PATH, and the user would run whatever version they installed.
- `package-update` - the CLI runs without any plugin, from a global npm install (never the case in Cursor, which runs a pinned npx). Update it with `npm install -g @graphit/cli@latest` (not `npm update -g`, which can keep you on an old release). If `graphit` resolves to a custom npm prefix - compare `command -v graphit` with `npm prefix -g` - reinstall to that prefix: `npm install -g @graphit/cli@latest --prefix <dir>`, where `<dir>` is the parent of the bin directory holding graphit. If the Graphit plugin is also installed, the global is shadowing it: offer `npm uninstall -g @graphit/cli` instead, and run it only after the user confirms.
- `cursor-double-load` - Cursor loads Graphit twice (a local copy plus the Claude Code plugin or a Cursor marketplace copy), so every skill and hook runs twice. Offer the remedy the finding names, and run it only after the user confirms: usually `npx -y @graphit/cli@<version> setup --editor cursor --remove-legacy-copies`, or, when the Claude Code plugin is on for this project only, `claude plugin disable graphit@graphit-plugin` in this project, since the local copy still serves the user's other projects.
- `cursor-local-plugin-stale` - the local Cursor copy is behind. Offer `npx -y @graphit/cli@<version> setup --editor cursor --update`, then a Cursor reload, and run it only after the user confirms.
- `legacy-cursor-rule-present` - an old `graphit.mdc` rule from before the Cursor plugin is still in a `.cursor/rules/` folder. Offer `npx -y @graphit/cli@<version> setup --editor cursor --remove-legacy-copies` (run it in that project for a project rule), and run it only after the user confirms.

How you run the binary depends on the surface: on Claude Code the plugin's `graphit` wrapper runs it directly; on Codex, Cursor, a terminal, or CI, invoke it explicitly with `npx -y @graphit/cli@<version>` (or pin `npx -y @graphit/cli@<exact>` for a deterministic, reproducible run).

`graphit setup` installs Graphit in Cursor: `npx -y @graphit/cli setup --editor cursor` copies the plugin to `~/.cursor/plugins/local/graphit`, then Cursor needs a reload. It installs nothing, and says so, when the Claude Code plugin is on for all projects or a Cursor marketplace copy may load Graphit; when the Claude Code plugin is on for one project only, it still installs and warns that Graphit loads twice there. For other editors, `setup` is only for legacy copied-file installs where the plugin is unavailable. If `graphit plugin status` reports Claude Code or Codex copied snapshots, tell the user to remove them with `graphit setup --remove-legacy-copies` after confirming the plugin is installed. Use `graphit setup --legacy-copy` only when the plugin is unavailable.

For the exact flags, run the command with `--help` (for example `graphit setup --help`). Do not hand-author flag lists; the CLI is the source of truth.

## Legacy copied-file setup

After an intentional legacy copied-file setup completes, offer to add a short Graphit section to the project instructions so future sessions know Graphit is available - what the skill does, plus `graphit ds list` and `graphit kb list metric` to explore. Do not suggest legacy copied-file setup for Claude Code or Codex when the plugin is available; Cursor always gets the plugin.
