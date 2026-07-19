---
description: Log in to Graphit (opens a browser for authentication). Use when the user asks to log in, sign in, or authenticate to Graphit, or when a Graphit action just failed because the user is not logged in.
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/plugin-status.mjs" --json --skip-network`

The JSON above includes `auth.logged_in` and `auth.email`, read from the local credentials file with no network call.

- If `auth.logged_in` is true: tell the user they are already logged in as `auth.email`. Do not start a new login unless they explicitly want to switch accounts.
- If `auth.logged_in` is false (or the user wants to switch accounts): run `graphit auth login` as a Bash command. It opens the user's browser for authentication and waits for them to finish (up to about two minutes). When it returns, confirm the logged-in email and organization from its output.

Never ask the user for a password or token in chat - authentication happens entirely in their browser.
