# Parameterized Metrics

A parameterized metric is a template whose calculation contains `${PARAM:NAME}` tokens (dollar sign and curly braces). Each token maps to a named parameter with a list of values (a value name paired with the SQL fragment it substitutes in). The system auto-generates one validated child variant per combination of values - a ROAS template with REVENUE (9 values) and DN (4 values) produces 36 children.

## When to Parameterize

Parameterize when columns or formulas follow a variant pattern: `total_iap` / `total_iap_new_users` / `estimated_gross_iap` map to one REVENUE parameter; metrics that differ only by a WHERE window (D7, D30, D90) map to one DN parameter. Stay standalone when the metric has no natural variants, has only one or two (template overhead is not worth it), or when variants use fundamentally different formulas.

## Authoring a Template

Put `${PARAM:NAME}` tokens in the calculation, then pass the value map with `--parameters` (inline JSON array) or `--parameters-file <path>` on `graphit kb create metric` / `graphit kb update metric`. Run `graphit kb create metric --help` for the exact flag spelling.

```json
[
  {
    "name": "REVENUE",
    "values": {"ALL_BOOKINGS": "total_iap", "NEW_BOOKINGS": "total_iap_new_users"},
    "default_value": "ALL_BOOKINGS"
  },
  {
    "name": "DN",
    "values": {"D0": "", "D7": "WHERE day <= 7"},
    "default_value": "D0"
  }
]
```

Paired with a calculation such as `SUM(${PARAM:REVENUE}) / SUM(cost) * 100 ${PARAM:DN}`.

| Rule | Detail |
|------|--------|
| Token match | Every `${PARAM:NAME}` token in the calculation needs a matching parameter by name |
| Empty values | Valid as no-ops (e.g. D0 adds no filter) |
| Variant cap | Max 1000 (the Cartesian product of all parameter values) |
| Child naming | Auto-generated as `{PARENT}_{VALUE1}_{VALUE2}` (e.g. ROAS_ALL_BOOKINGS_D7) |
| Validation | Template create skips per-formula validation (children validate on generation) |

## Editing a Template

All edits go through the parent template; children are read-only. Run a fresh `--parameters` array to change the value sets.

| User intent | Edit action |
|-------------|-------------|
| Change formula | Update `--sql` on the template - children re-generate |
| Add a variant (e.g. D120) | Update `--parameters` with the new value added to the relevant parameter |
| Remove variants | Update `--parameters` with values removed from the relevant parameter |
| Change description or topics | Update those fields on the template - no child re-generation |

If the user targets a child for edit or delete, redirect to the parent: "ROAS_ALL_BOOKINGS_D7 is a variant of ROAS. Edit the parent template ROAS instead."

## Using a Variant in a Query

You never substitute tokens by hand. The server resolves a variant when you reference it with the parameter syntax in SQL.

1. Find the template. `graphit kb list metric` shows the collapsed inventory - templates and flat metrics only, never child variants - with a `params` column (the required parameter names, e.g. `REVENUE, DN`) and a `variant_count`; an empty `params` cell means the metric is flat. To enumerate a template's concrete variants, `graphit kb explore metric NAME`; reach for `graphit kb list metric --include-variants` only when you truly need every child row flat.
2. Map the user's words to parameter values: "D7 ROAS for new users" maps to `REVENUE=NEW_BOOKINGS` and `DN=D7`.
3. Reference it with `{{metric:NAME(K=V)}}` in the query SQL, e.g. `{{metric:ROAS(REVENUE=NEW_BOOKINGS, DN=D7)}}`. The server expands it to the pre-validated child calculation at query time.

```bash
graphit query "SELECT {{dim:INSTALL_MONTH}}, {{metric:ROAS(REVENUE=NEW_BOOKINGS, DN=D7)}} AS roas FROM MARKETING_UA_DS GROUP BY 1" --ds ds_abc123 --verbose
```

Defaults and errors:
- Omitting a parameter on a required metric returns a clear error naming the parameter and the valid values. Retry with a value or ask the user which one they meant.
- A pre-baked variant (ROAS_D7, ARPU_D30) has its value hardcoded in the name, so reference it plainly as `{{metric:ROAS_D7}}` with no parameter clause. Find its exact name via `graphit kb explore metric ROAS` (lists the variants) or `graphit kb list metric --include-variants` - the collapsed `kb list` does not show child variant names.

## Contrast: Wrong vs Right

| Wrong | Right |
|-------|-------|
| Replace `${PARAM:REVENUE}` with `total_iap` by hand and put that in the query SQL | Reference `{{metric:ROAS(REVENUE=ALL_BOOKINGS, DN=D7)}}` and let the server expand the validated child |
| Create ROAS_ALL_BOOKINGS and ROAS_NEW_BOOKINGS as separate standalone metrics | Create one ROAS template with a REVENUE parameter |
| Edit ROAS_ALL_BOOKINGS_D7 directly | Edit the parent ROAS template instead |

## Delete and Verify

Deleting the parent cascade-deletes every child; the blast radius includes all children plus their downstream references (graphs, rules, synonyms), so confirm before deleting. Verifying the parent sets `verified=true` on the parent and every child at once.
