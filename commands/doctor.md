---
description: Report Graphit plugin health - installed vs latest version, login status, and any issues needing action. Use when the user asks to check Graphit's status or health, "is Graphit working", "am I logged in to Graphit", "graphit doctor", or "what version of Graphit".
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/plugin-status.mjs" --json`

The JSON above is the current Graphit plugin health. Present it to the user as a short health report - do not dump the raw JSON:

- **Version:** compare `currentVersion` and `latestVersion`. If equal, say Graphit is up to date. If `latestVersion` is higher, note an update is available and mention `/graphit:update`.
- **Login:** if `auth.logged_in` is true, say "Logged in as {auth.email}". Otherwise say "Not logged in" and mention `/graphit:login`.
- **Issues:** if `findings` is empty, say everything looks healthy. Otherwise list each finding's `message` followed by its `remediation`.

Keep it to a few lines.
