# KB Actions (CLI)

Every KB asset has full create / update / delete through the `graphit kb` commands - this is the authoring reference. SKILL.md's command table is the quick glance; this file adds the create flags and the task recipes that take more than one command. All names are UPPER_SNAKE_CASE.

## Create

| Asset | Command |
|---|---|
| Metric | `graphit kb create metric --name X --sql "<expr>" --table T` (optional `--topics "A,B"`, `--default-dimensions "D1,D2"`, `--skip-validate`) |
| Dimension | `graphit kb create dimension --name X --expr "<expr>" --table T` (type auto-inferred; override with `--type` / `--output-type`, `--skip-validate`) |
| Rule | `graphit kb create rule --name X --sql "<text>" --table T` (optional `--apply-on table:USERS metric:ARPU`, `--skip-validate`) |
| Synonym | `graphit kb create synonym --term X --canonical Y --type metric` |
| Domain | `graphit kb create domain --name X` (optional `--color "#4DB6AC"`) |
| Topic | `graphit kb create topic --name X` |
| Relationship | `graphit kb create relationship --name X --primary-table T --primary-column C --related-table T2 --related-column C2` |

## Pre-Creation Validation

Metric, dimension, and rule creates validate the formula against real data before writing to Firestore. On success, the response includes sample results. On failure, creation is blocked with a 422 error showing the failing query.

- **Metric**: runs `SELECT {formula} FROM {table} GROUP BY {default_dims} LIMIT 5`
- **Dimension**: runs `SELECT {expr} AS val, COUNT(*) AS cnt FROM {table} GROUP BY 1 ORDER BY cnt DESC LIMIT 10` (reports cardinality, NULL rate)
- **Rule**: runs `SELECT COUNT(*) FROM {table} WHERE {rule}` (warns if zero rows match)

Skip conditions (validation returns "skipped", asset still created):
- Template metrics with `${PARAM:X}` placeholders
- Constraint-based rules (non-empty `--constraint`)
- Table has no data source and no Snowflake connections
- Data source mid-refresh or unverified

Use `--skip-validate` on any create command to bypass validation entirely (useful for batch creation where speed matters more than per-asset checks).

### Presenting validation results to the user

The JSON response from every metric/dimension/rule create includes a `validation` object. You MUST present it to the user after each create:

```
validation: {
  status: "pass" | "fail" | "skipped",
  sample_query: "SELECT ...",        // the SQL that ran
  sample_data: [{...}, ...],         // rows from real data
  sample_columns: ["col1", "col2"],  // column names
  warnings: ["..."],                 // quality warnings
  skip_reason: "...",                // why validation was skipped
}
```

How to present each status:
- **pass**: render `sample_data` as a markdown table using `sample_columns` as headers. For metrics, this shows computed values. For dimensions, this shows top values with row counts. For rules, this shows the matching row count. Surface any `warnings` below the table.
- **skipped**: tell the user validation was skipped and quote the `skip_reason`.
- **fail** (HTTP 422, create was blocked): show the error message and `sample_query`. The asset was NOT created. Fix the formula and retry.

Never silently swallow validation results. The user needs to see that their formula actually works against real data.

## Update and Delete

- Update a field: `graphit kb update <type> NAME --<field> value` (e.g. `--sql`, `--expr`, `--description`, `--table`).
- Delete: `graphit kb delete <type> NAME --yes`.

## Topic and Reference Recipes (lists REPLACE, so don't clobber)

`--topics`, `--secondary-tables`, and `--default-dimensions` replace the existing list, they do not append. To change one value without losing the others, read the current list first, then write the full intended list:

- **Add a topic**: `graphit kb get metric NAME` to read current topics, then `graphit kb update metric NAME --topics "EXISTING1,EXISTING2,NEW"`.
- **Remove a topic**: update with the list minus the one removed.
- **Reference an asset onto another table**: `graphit kb update metric NAME --secondary-tables "OTHER_TABLE"` (works on dimension and rule too). Read-only pointer marked `*`; metrics and dimensions need every referenced column to exist on the target, rules need only the table to exist.

Topics are horizontal - one topic can tag assets across many domains (see `kb-structure.md`).

## Domain Recipes (the home is on the table and cascades)

Domain is set on the TABLE, never per asset, and cascades to every asset on it (see `kb-structure.md` for the model):

- **Re-home a whole table**: `graphit kb update table NAME --domain MARKETING` - moves every asset on that table at once. Change it once on the table, never asset by asset.

## Navigation

To find what exists and how it connects (what depends on a table, what joins, what is in a domain or topic), use the traversal recipes in `kb-traversal.md`. Note: `graphit kb list domains` reports every domain including empty ones - report them all, do not drop ones with a zero asset count.

## UI-Only (no CLI command)

These are platform-UI state or platform-only, not KB data the CLI changes:
- View mode (Tree / By Topic / By Table / Flat), filter dropdowns, expand / collapse, drag-drop onto a topic.
- Cross-cutting synonym domains (extra relevance beyond the home domain) are set in the platform UI - there is no CLI flag for them yet.
