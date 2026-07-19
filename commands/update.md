---
description: Update the Graphit plugin and CLI to the latest version. Use ONLY when the user explicitly asks to update or upgrade Graphit. Never run this on your own in response to a startup notice or a "version available" message - only on a direct user request.
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/plugin-status.mjs" --json`

The JSON above is the current Graphit plugin state, before updating. Update Graphit to the latest version, then report what changed:

1. Note `currentVersion` and `latestVersion`. If they are already equal and `findings` is empty, tell the user Graphit is already up to date and stop - do not run the steps below.
2. Update the plugin bundle by running these two Bash commands in order:
   - `claude plugin marketplace update graphit-plugin`
   - `claude plugin update graphit@graphit-plugin`
3. If `findings` mentions a legacy global `@graphit/cli` install shadowing the plugin wrapper: explain it to the user and ask them to confirm before you run `npm uninstall -g @graphit/cli`. Run it only after they say yes.
4. If step 2 reports the plugin is already current but the status still shows a stale installed bundle, run `graphit plugin status --repair` as a fallback.
5. Report the before and after versions. Then tell the user: the plugin bundle is updated on disk, but they must restart Claude Code (quit and relaunch) for the new version to take effect in this session. The CLI binary itself updates automatically.
