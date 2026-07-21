# CLI Operations and Health

Load this when the concern is the Graphit CLI or plugin itself, not the analysis: the session-start check, a health check, a permission error (403/404/423), the output contract, or local working artifacts. Skip it on every healthy build or query turn.

## Contents

- [Session start](#session-start)
- [Health gate](#health-gate)
- [Permission errors](#permission-errors)
- [Output contract](#output-contract)
- [Working artifacts](#working-artifacts)

Depth that lives elsewhere: installing, updating, or repairing Graphit -> references/install-update.md. Reporting a failure or a partial result -> references/reporting.md.

Governance itself is enforced server-side by the query gateway: a governed query is rejected by the platform, not the CLI, so never claim to have blocked a query locally. The one local guard is a session tripwire - until this skill attests at session start (below), the CLI declines commands that change org state or that assert a governance decision (`--adhoc-reason`, `--override-rules`, `--skip-conditional`). That guard is about this session, never about the query itself, and dropping those flags does not skip governance - the server still decides.

## Session start

Before anything else, two calls in this order:

1. `graphit plugin status --skill-ack` - the session attestation: it records that this skill is driving the session. Best-effort - if it errors, continue without retrying. Do raise it if a later command comes back BLOCKED: a failed attestation is the one cause that block cannot fix by itself.
2. `graphit plugin status --json` - returns the version state and an `auth` block (`logged_in`, `email`).

Those two are the whole startup check - chain nothing else. Read whether an update is available and whether the session is live, then greet and act on the 2x2:

- Current + signed in: "Hi {auth.email}, what can we do today?" - proceed.
- Current + signed out: "Let's get you signed in," then run `graphit auth login` for them, once. It opens a browser and blocks on a localhost callback (~2 min) and cannot complete in a non-interactive, headless, or sandboxed context - if it fails or cannot run, fall back to telling the user to run it themselves; never loop. Re-check, then proceed.
- Update available + signed in: "Hi {auth.email} - a new version is out. Update first?" Any gap counts (major, minor, or patch). On yes, update, then proceed.
- Update available + signed out: "You're not signed in and there's a new version. Update first, then sign in?" Update, then sign in, then proceed.

Updates are always a one-tap ask, never silent; auto sign-in only when the version is current. Never report ready off the version check alone - readiness means a live session. Update mechanics (which command, custom prefixes, plugin vs binary) live in references/install-update.md.

Staleness is judged on the `--json` call only: if THAT call errors with "command not found" / "unknown command", the CLI is too old - show `CLI: {version} (outdated)` and update with `npm install -g @graphit/cli@latest` first. An "unknown option" error from the attestation call means only that this CLI predates it; that is not a staleness signal and needs no action.

## Health gate

ALWAYS run `graphit plugin status` before diagnosing, retrying, or inventing a workaround when CLI behavior looks wrong: unknown commands, unrecognized flags, missing commands this skill describes, stale-looking output, copied-skill warnings, non-zero exits with unclear messages, or the user saying Graphit, the CLI, the plugin, or the skill is not working.

If the status reports action needed, stop and tell the user the exact remediation first. Do not continue with stale instructions unless the user explicitly asks you to proceed anyway.

Do NOT suggest updating for normal operational failures: expired auth, bad SQL, a network timeout, or an entity not found. Those are runtime issues, not version drift.

## Permission errors

The CLI enforces the same permission model as the platform. Three codes:

| Code | Meaning | What to tell the user |
|---|---|---|
| 403 | Analyst seat or admin role required | Most commands need an Analyst seat. Viewer-seat users can run `graphit auth` only; everything else is blocked, so they use the platform UI. Connector create and delete also need an org owner or admin role, so a non-admin analyst gets 403 there. |
| 404 | Not found, or no access | Returned for dashboards the user cannot reach (private ones owned by others, team dashboards they are not on). The API does not distinguish "does not exist" from "you cannot access it", to prevent ID enumeration. Do not assume the dashboard is gone. |
| 423 | Shared dashboard needs an active editing session | Catch one from the CLI: `graphit dashboard edit <id>` acquires the session and starts a draft; make the edits, then `graphit dashboard publish <id>` to go live (or `graphit dashboard release <id> --yes` to abandon). 409 = someone else is editing; 423 = locked; 403 = view-only. Private dashboards need no session. |

For the exact remediation flags on the failed command, run it with `--help`.

## Output contract

Commands write only the result payload to stdout; all decoration (progress, tables, provenance, warnings, summaries, links) goes to stderr.

- `--output json` (default): stdout is exactly one valid JSON document - parse it directly, never strip a trailing line. Provenance and warnings live inside the JSON.
- Use json for anything you read back, especially nested output (`kb explore`, query rows, `kb get`). `--output table` is a quick flat human view; nested cells render as compact JSON, not `[object Object]`.
- `--output styled` is the interactive view - never parse it.

## Working artifacts

Keep every local file you create in one place: a `./.graphit/` directory in the working dir (distinct from the `~/.graphit/` credential store). Scratch HTML written before `graphit dashboard update-html <id> --file`, output redirected from `graphit dashboard get-html`, exported PNG/PDF, throwaway SQL - all under `.graphit/`, never scattered across the user's repo. `graphit dashboard export` already defaults its output there (no `--output` needed) and drops a self-ignoring `.gitignore`, so the dir is never committed.

These are ephemeral. The platform dashboard is the source of truth and the durable artifact; anything local re-materializes on demand (`graphit dashboard get-html <id>` for the HTML, `graphit dashboard export <id> --format png|pdf` for a rendered image). When you finish a piece of work, offer to remove `.graphit/` - nothing of value is lost. Keep it a soft suggestion, not a forced step.
