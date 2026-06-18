# CLI Operations and Health

Load this when the concern is the Graphit CLI or plugin itself, not the analysis: the session-start banner, a health check, installing or updating, a permission error (403/404/423), or reporting a failure or partial result. Skip it on every healthy build or query turn.

## Contents

- [Session start banner](#session-start-banner)
- [Health gate](#health-gate)
- [Install and update](#install-and-update)
- [Legacy copied-file setup](#legacy-copied-file-setup)
- [Permission errors](#permission-errors)
- [Output contract](#output-contract)
- [Reporting failures and partial results](#reporting-failures-and-partial-results)

Governance is enforced server-side by the query gateway. There is no client-side query guard, so never claim to block a query locally; a query is rejected by the platform, not the CLI.

## Session start banner

Before anything else, run `graphit plugin status` and show a version banner:

```
Graphit
  Skill:  {skill_version from the router frontmatter}
  CLI:    {output of graphit --version}
  Status: {OK, or the action the plugin status reports}
```

If the status reports action needed, show the exact remediation it prints before proceeding. If it fails with "command not found" or "unknown command", the CLI is too old: show `CLI: {version} (outdated)` and tell the user to update with `npm install -g @graphit/cli@latest`. Do not proceed with an outdated CLI, because commands and flags in this skill may not exist in old versions.

## Health gate

ALWAYS run `graphit plugin status` before diagnosing, retrying, or inventing a workaround when CLI behavior looks wrong: unknown commands, unrecognized flags, missing commands this skill describes, stale-looking output, copied-skill warnings, non-zero exits with unclear messages, or the user saying Graphit, the CLI, the plugin, or the skill is not working.

If the status reports action needed, stop and tell the user the exact remediation first. Do not continue with stale instructions unless the user explicitly asks you to proceed anyway.

Do NOT suggest updating for normal operational failures: expired auth, bad SQL, a network timeout, or an entity not found. Those are runtime issues, not version drift.

## Install and update

Two separate artifacts ship to Claude Code and Codex: the **CLI binary** (`@graphit/cli`, installed and updated with npm) and the **skill bundle** (the plugin `graphit@graphit-plugin`, updated through the assistant's plugin manager). The plugin bundle does NOT contain the CLI binary, so updating one never updates the other.

`graphit plugin status` reports "update available" for the **npm CLI binary**. Update it with `npm install -g @graphit/cli@latest` (not `npm update -g`, which can keep you on an old release). If `graphit` resolves to a custom npm prefix - compare `command -v graphit` with `npm prefix -g` - reinstall to that prefix: `npm install -g @graphit/cli@latest --prefix <dir>`, where `<dir>` is the parent of the bin directory holding graphit. The **skill bundle** updates separately with `claude plugin update graphit@graphit-plugin`; that never touches the binary.

How you run the binary depends on the surface: on Claude Code the plugin's `graphit` wrapper runs it directly; on Codex, Cursor, a terminal, or CI, invoke it explicitly with `npx -y @graphit/cli@<version>` (or pin `npx -y @graphit/cli@<exact>` for a deterministic, reproducible run).

`graphit setup` is only for legacy or fallback copied-file installs, mainly Cursor or environments without plugin support. If `graphit plugin status` reports Claude Code or Codex copied snapshots, tell the user to remove them with `graphit setup --remove-legacy-copies` after confirming the plugin is installed. Use `graphit setup --legacy-copy` only when the plugin is unavailable.

For the exact flags, run the command with `--help` (for example `graphit setup --help`). Do not hand-author flag lists; the CLI is the source of truth.

## Legacy copied-file setup

After an intentional legacy copied-file setup completes, offer to add a Graphit section to the project instructions so future sessions know Graphit is available. Do not suggest legacy setup for Claude Code or Codex when the plugin is available. Suggested snippet:

```
## Graphit
Use the Graphit skill to build custom HTML dashboards from real data.
Run `graphit ds list` to see cached data sources before querying.
Run `graphit kb list metric` to explore available metrics and dimensions.
```

## Permission errors

The CLI enforces the same permission model as the platform. Three codes:

| Code | Meaning | What to tell the user |
|---|---|---|
| 403 | Analyst seat or admin role required | Most commands need an Analyst seat. Viewer-seat users can run `graphit auth` only; everything else is blocked, so they use the platform UI. Connector create and delete also need an org owner or admin role, so a non-admin analyst gets 403 there. |
| 404 | Not found, or no access | Returned for dashboards the user cannot reach (private ones owned by others, team dashboards they are not on). The API does not distinguish "does not exist" from "you cannot access it", to prevent ID enumeration. Do not assume the dashboard is gone. |
| 423 | Shared dashboard needs an active editing session | Shared-dashboard mutations need the user to open the dashboard on the platform and click Edit first; the CLI cannot acquire the session. See the shared-dashboard constraint in the router. |

For the exact remediation flags on the failed command, run it with `--help`.

## Output contract

Commands write only the result payload to stdout; all decoration (progress, tables, provenance, warnings, summaries, links) goes to stderr.

- `--output json` (default): stdout is exactly one valid JSON document - parse it directly, never strip a trailing line. Provenance and warnings live inside the JSON.
- Use json for anything you read back, especially nested output (`kb explore`, query rows, `kb get`). `--output table` is a quick flat human view; nested cells render as compact JSON, not `[object Object]`.
- `--output styled` is the interactive view - never parse it.

## Reporting failures and partial results

When a command fails or only part of a multi-step task succeeds, report it truthfully. The user cannot see the raw CLI output, so a bare "something went wrong" leaves them stuck. Verify each step before claiming it; never report a step as done that you did not confirm.

State three things: what succeeded, what failed (with the cause from the CLI output), and the single next step. Distinguish a transient failure (a network timeout, a mid-refresh data source - worth one retry) from a non-transient one (bad SQL, an entity not found, a permission code, a governance rejection - needs a fix, not a retry).

Failure template:

~~~
**Failed:** {what you tried, in plain terms}.

**Cause:** {the concrete reason from the CLI output - the error code, the rejected rule, the SQL error}.

**Next:** {the one action to take - fix the formula, enter Edit mode, run the named command, or ask the user a specific question}.
~~~

Partial-success template (some steps landed, some did not):

~~~
**Done:** {the steps that succeeded, named}.

**Not done:** {the steps that failed, each with its cause}.

**Next:** {the single next step to finish or recover}.
~~~

Worked example of a partial KB creation:

~~~
**Done:** Created **CPI** and **ROAS_D7** on **MARKETING_UA**; both validated on real data.

**Not done:** **LTV_CAC_RATIO** was blocked (422) - its formula references **LTV**, which does not exist yet.

**Next:** Create **LTV** first, then retry **LTV_CAC_RATIO**. Want me to define **LTV** now?
~~~
