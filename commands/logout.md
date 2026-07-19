---
description: Log out of Graphit and clear stored credentials. Use ONLY when the user explicitly asks to log out or sign out of Graphit. Never run this on your own.
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/plugin-status.mjs" --json --skip-network`

The JSON above includes `auth.logged_in` and `auth.email`, read from the local credentials file with no network call.

- If `auth.logged_in` is false: tell the user they are not currently logged in - there is nothing to do.
- If `auth.logged_in` is true: run `graphit auth logout` as a Bash command. It revokes the session server-side (best effort) and clears the local credentials at `~/.graphit/credentials.json`. Confirm the user has been logged out (they were `auth.email`), and mention they can sign back in with `/graphit:login`.
