# Install and Update

Load this only when installing, updating, or repairing Graphit itself: a `plugin status` update notice, a version mismatch, a copied-snapshot warning, or a legacy Cursor-style setup. Skip it on every normal build, query, or health turn - `operations.md` covers the session-start check and health gate.

## Install and update

Two separate artifacts ship to Claude Code and Codex: the **CLI binary** (`@graphit/cli`, installed and updated with npm) and the **skill bundle** (the plugin `graphit@graphit-plugin`, updated through the assistant's plugin manager). The plugin bundle does NOT contain the CLI binary, so updating one never updates the other.

`graphit plugin status` reports "update available" for the **npm CLI binary**. Update it with `npm install -g @graphit/cli@latest` (not `npm update -g`, which can keep you on an old release). If `graphit` resolves to a custom npm prefix - compare `command -v graphit` with `npm prefix -g` - reinstall to that prefix: `npm install -g @graphit/cli@latest --prefix <dir>`, where `<dir>` is the parent of the bin directory holding graphit. The **skill bundle** updates separately with `claude plugin update graphit@graphit-plugin`; that never touches the binary.

How you run the binary depends on the surface: on Claude Code the plugin's `graphit` wrapper runs it directly; on Codex, Cursor, a terminal, or CI, invoke it explicitly with `npx -y @graphit/cli@<version>` (or pin `npx -y @graphit/cli@<exact>` for a deterministic, reproducible run).

`graphit setup` is only for legacy or fallback copied-file installs, mainly Cursor or environments without plugin support. If `graphit plugin status` reports Claude Code or Codex copied snapshots, tell the user to remove them with `graphit setup --remove-legacy-copies` after confirming the plugin is installed. Use `graphit setup --legacy-copy` only when the plugin is unavailable.

For the exact flags, run the command with `--help` (for example `graphit setup --help`). Do not hand-author flag lists; the CLI is the source of truth.

## Legacy copied-file setup

After an intentional legacy copied-file setup completes, offer to add a short Graphit section to the project instructions so future sessions know Graphit is available - what the skill does, plus `graphit ds list` and `graphit kb list metric` to explore. Do not suggest legacy setup for Claude Code or Codex when the plugin is available.
