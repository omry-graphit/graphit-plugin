# Install and Update

Load this only when installing, updating, or repairing Graphit itself: a `plugin status` update notice, a version mismatch, a copied-snapshot warning, or a legacy Cursor-style setup. Skip it on every normal build, query, or health turn - `operations.md` covers the session-start check and health gate.

## Install and update

Graphit has two parts: the **CLI** (`@graphit/cli` on npm) and the **plugin bundle** (`graphit@graphit-plugin`: skills, references, hooks, commands). In Claude Code the plugin's `graphit` wrapper runs the CLI through npx at the latest npm release, so the CLI stays current on its own; the bundle changes only when the plugin is updated.

`graphit plugin status --json` names what is behind by the finding's `type`:

- `plugin-update` - the plugin bundle is behind. Update it with `/plugin marketplace update graphit-plugin`, then `/plugin update graphit@graphit-plugin` (`/graphit:update` runs both; in Codex, use its plugin manager), then restart: the running session keeps the old skill until then. Never suggest a global `npm install -g @graphit/cli` here - it shadows the plugin's wrapper on PATH, and the user would run whatever version they installed.
- `package-update` - the CLI runs without the plugin, from a global npm install. Update it with `npm install -g @graphit/cli@latest` (not `npm update -g`, which can keep you on an old release). If `graphit` resolves to a custom npm prefix - compare `command -v graphit` with `npm prefix -g` - reinstall to that prefix: `npm install -g @graphit/cli@latest --prefix <dir>`, where `<dir>` is the parent of the bin directory holding graphit. If the Graphit plugin is also installed, the global is shadowing it: offer `npm uninstall -g @graphit/cli` instead, and run it only after the user confirms.

How you run the binary depends on the surface: on Claude Code the plugin's `graphit` wrapper runs it directly; on Codex, Cursor, a terminal, or CI, invoke it explicitly with `npx -y @graphit/cli@<version>` (or pin `npx -y @graphit/cli@<exact>` for a deterministic, reproducible run).

`graphit setup` is only for legacy or fallback copied-file installs, mainly Cursor or environments without plugin support. If `graphit plugin status` reports Claude Code or Codex copied snapshots, tell the user to remove them with `graphit setup --remove-legacy-copies` after confirming the plugin is installed. Use `graphit setup --legacy-copy` only when the plugin is unavailable.

For the exact flags, run the command with `--help` (for example `graphit setup --help`). Do not hand-author flag lists; the CLI is the source of truth.

## Legacy copied-file setup

After an intentional legacy copied-file setup completes, offer to add a short Graphit section to the project instructions so future sessions know Graphit is available - what the skill does, plus `graphit ds list` and `graphit kb list metric` to explore. Do not suggest legacy setup for Claude Code or Codex when the plugin is available.
