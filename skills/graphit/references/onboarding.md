# First Run: From an Empty Workspace to a First Dashboard

Load this when the user is signed in but visible groups/models and `graphit ds list` are empty. If a repository is to own the Knowledge Base instead, that first run is `repo-setup.md`. Onboarding is the job, not a blocker: walk through it one step at a time and surface each result. Once a source and semantic assets exist, return to the normal loop.

## The arc

1. Connect a source.
2. Ask what they want to investigate.
3. Create the data source for it.
4. Apply the selected intent's semantic work.
5. Offer a dashboard.
6. On the first dashboard, show what they got for free.

One step at a time - do it, show the result, let the user react, then the next. Don't run the whole chain silently and drop a finished workspace at the end.

## 1. Connect a source

Two ways in. Lead with the warehouse; offer the file as the lighter path.

**Warehouse (recommended).** Run `graphit connector list` first. If a connection already exists, use it. If none:

- Creating a connection needs an org admin. If the user is not an admin, connector creation returns 403 - point them to the Graphit web app or to ask an admin, and do not retry the command.
- Snowflake keypair from the CLI: `graphit connector add snowflake-keypair` needs `--account --user --key --warehouse --role --database` (all required), plus optional `--name` for a friendly label (it defaults to `Snowflake (<account>)`). It validates the connection before saving, so a success really did connect.
- OAuth and GitHub connections are set up in the Graphit web app, not the CLI - name that handoff when it applies.

**File (lighter).** For a quick start with no warehouse, `graphit ds create --file ./data.csv --domain <NAME>` uploads a CSV or Excel file and creates a data source directly - no connector needed.

Present the outcome: which connection is live, or the exact web-app / admin step the user has to finish.

## 2. Ask what to investigate

Use the business question already supplied. Ask one structured question only if the goal is still unclear; do not repeat the entry's opening choice. The goal determines the source and any requested artifacts.

## 3. Create the data source

Explain that answering the question fast needs a cached data source over the connection, not repeated live-warehouse queries.

**Use the selected intent.** Explore scratch work and Private first Build create sources with `--domain Private`, without a group interview or group creation. In Share, agree audience/group and use the uppercase policy key returned by `graphit status` or `domain_keys`; `kb-scope.md` owns exact placement and permissions. Create a shared group only when authorized. An empty workspace does not imply org commons.

**Read the table before you write its SQL.** You cannot author a source SELECT without knowing the columns, and guessing them wastes a round trip. Read them straight off the warehouse:

```bash
graphit metadata columns --connection <id> --schema <name> --table <name>
```

This needs no governed reference. An aggregate or `GROUP BY` against a warehouse table that is not yet in the knowledge base is a different matter, so use it for shape rather than probing with a query.

For private work, create the source and activate it (Share uses the agreed policy key):

```bash
graphit ds create --name "MY_DS" --domain Private --sql "SELECT ..." --connection <id>
graphit ds verify <id> --accept-schema
```

Shape it for the question - grain, only the columns dashboards use, low cardinality (see data-sources.md). Show the scanned schema and confirm before moving on.

## 4. Create the KB assets

The scan supplies the bound model. Explore answers without authoring definitions; Private first Build uses it and keeps a private metric only on request. Share applies the readiness gate: show missing prerequisites and proposed definitions, obtain required approval, then save and read back via kb-structure.md and kb-actions.md. Onboarding does not override the selected workflow.

## 5. Offer a dashboard

Ask whether the user wants a quick query answer or a deployed HTML dashboard. Build the dashboard only if they want one - a genuine one-off doesn't need it.

## 6. First-dashboard reveal (first time only)

After the first dashboard is deployed, tell the user - concisely - what they get for free on it. Keep this to the first dashboard; it never needs repeating, because onboarding stops firing once the workspace has data.

- **Each graph's 3-dot (hamburger) menu**: "view details" opens a panel with the SQL, live query results, and the trust tier plus any enforced rules (the KB assets it lists open as explorable tabs).
- **The dashboard's own hamburger** (top bar): share it, schedule a recurring email or Slack report (or ask Graphit to schedule it), export to PNG or PDF, and browse version history.
- **Themes and colors** are automatic - dark and light mode, and the brand palette, with no extra work.

Then continue in the normal loop; the workspace is no longer empty.
