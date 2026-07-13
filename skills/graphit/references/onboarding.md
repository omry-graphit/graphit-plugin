# First Run: From an Empty Workspace to a First Dashboard

Load this when the user is signed in but the workspace is empty - `graphit kb list domains` (and `graphit ds list`) come back with nothing. That means no data is connected yet. Onboarding IS the job here, not a blocker: walk the user through it one step at a time, surfacing each result. This flow self-limits - once a data source and KB assets exist, `kb list domains` is no longer empty and you land in the normal loop instead.

## The arc

1. Connect a source.
2. Ask what they want to investigate.
3. Create the data source for it.
4. Create the KB assets it needs.
5. Offer a dashboard.
6. On the first dashboard, show what they got for free.

One step at a time - do it, show the result, let the user react, then the next. Don't run the whole chain silently and drop a finished workspace at the end.

## 1. Connect a source

Two ways in. Lead with the warehouse; offer the file as the lighter path.

**Warehouse (recommended).** Run `graphit connector list` first. If a connection already exists, use it. If none:

- Creating a connection needs an org admin. If the user is not an admin, connector creation returns 403 - point them to the Graphit web app or to ask an admin, and do not retry the command.
- Snowflake keypair from the CLI: `graphit connector add snowflake-keypair` needs `--account --user --key --warehouse --role --database` (all required), plus optional `--name` for a friendly label (it defaults to `Snowflake (<account>)`). It validates the connection before saving, so a success really did connect.
- OAuth and GitHub connections are set up in the Graphit web app, not the CLI - name that handoff when it applies.

**File (lighter).** For a quick start with no warehouse, `graphit ds create --file ./data.csv` uploads a CSV or Excel file and creates a data source directly - no connector needed.

Present the outcome: which connection is live, or the exact web-app / admin step the user has to finish.

## 2. Ask what to investigate

Before creating anything, ask what business question the user wants to answer. The goal drives which data source and which KB assets you build - don't create assets in a vacuum. One structured question is enough to start.

## 3. Create the data source

Explain that answering the question fast needs a cached data source over the connection, not repeated live-warehouse queries. Create it, then activate it:

```bash
graphit ds create --name "MY_DS" --sql "SELECT ..." --connection <id>
graphit ds verify <id> --accept-schema
```

Shape it for the question - grain, only the columns dashboards use, low cardinality (see data-sources.md). Show the scanned schema and confirm before moving on.

## 4. Create the KB assets

Explain that governed answers need KB assets - the metrics, dimensions, and rules the question implies. This is the readiness gate, narrated as first-run teaching, never skipped. Show a short gap list (what is missing, the proposed definition), get approval, then create and verify (see kb-structure.md, kb-actions.md).

## 5. Offer a dashboard

Ask whether the user wants a quick query answer or a deployed HTML dashboard. Build the dashboard only if they want one - a genuine one-off doesn't need it.

## 6. First-dashboard reveal (first time only)

After the first dashboard is deployed, tell the user - concisely - what they get for free on it. Keep this to the first dashboard; it never needs repeating, because onboarding stops firing once the workspace has data.

- **Each graph's 3-dot (hamburger) menu**: "view details" opens a panel with the SQL, live query results, and the trust tier plus any enforced rules (the KB assets it lists open as explorable tabs); "save as template" reuses that graph elsewhere.
- **The dashboard's own hamburger** (top bar): share it, schedule a recurring email report, export to PNG or PDF, and browse version history.
- **Themes and colors** are automatic - dark and light mode, and the brand palette, with no extra work.

Then continue in the normal loop; the workspace is no longer empty.
