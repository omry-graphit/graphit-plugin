# Query Governance

Server-side governance ensures consistent, auditable queries across all channels.

## Reference Syntax

Use KB references instead of inline formulas for governed queries:

```sql
-- Governed: server expands to KB-defined formulas
SELECT {{dim:INSTALL_MONTH}}, {{metric:CPI}} as cpi
FROM MARKETING_UA_DS
GROUP BY 1

-- Parameterized metric (ARPU requires DAY parameter)
SELECT {{metric:ARPU(DAY=7)}} as arpu FROM MARKETING_UA_DS

-- Raw expression (no outer aggregate)
SELECT {{metric_raw:REVENUE}} FROM orders
```

The server compiles references to actual expressions, injects rule constraints, stamps trust tier, and caches results. Reference syntax works in both `graphit query` and `graphit.resolve()`.

**Parameterized metrics:** Some metrics (ARPU, ROAS, RETENTION) require parameters. Check `graphit kb list metric` - the `params` column shows required names. Pre-baked variants (ARPU_D7, ROAS_D30) have values hardcoded and need no parameters. Omitting required parameters returns a clear error with the exact syntax to use.

## Trust Tiers

| Tier | Meaning | Badge |
|------|---------|-------|
| **governed** | Used `{{metric:X}}` / `{{dim:X}}` references | Teal dot |
| **verified** | Raw SQL matches KB definitions (AST matching) | Amber dot |
| **ad_hoc** | Inline formulas, no KB match | Gray dot |

## Governance Modes

| Mode | Behavior |
|------|----------|
| `observe` | All queries pass, tiers are tracked |
| `warn` | Ad-hoc queries on governed DSes produce warnings |
| `strict` | Ad-hoc queries on governed DSes are blocked |

```bash
graphit governance status     # View mode and conformance stats
graphit governance set warn   # Change mode (admin only)
graphit governance audit      # View audit log
```

## Enforceable Rules

Rules with typed constraints are enforced automatically via SQL injection:

| Type | What it does |
|------|-------------|
| `required_where` | Injects a WHERE predicate |
| `forbidden_column` | NULLifies a column in SELECT |
| `value_restriction` | Restricts column to allowed values |
| `required_filter` | Validates column appears in WHERE |
| `required_aggregation` | Validates GROUP BY includes column |

User-context variables (`${user.team_id}`, `${user.email}`) are resolved server-side for row-level security.

## Override Flow

```bash
# Override a specific rule
graphit query "SELECT * FROM events" --ds ds_123 --override-rules EXCLUDE_RETARGETING

# Multiple overrides
graphit query "SELECT * FROM events" --ds ds_123 --override-rules RULE1 RULE2
```

Override is checked against the rule's `override_policy` (anyone/analyst_only/admin_only/never) and the user's role. Overrides are always logged to the audit trail.

## Per-DS Settings

```bash
graphit ds update <id> --governed-mode on    # Enable governed mode
graphit ds update <id> --governed-mode off   # Disable
graphit ds update <id> --max-rows 10000      # Set row cap
```

## Presenting Governance Results

**After `graphit governance status`:**

~~~
**Governance mode:** strict

**7-day conformance:**

| Tier | Queries | Share |
|---|---:|---:|
| Governed | 847 | 72% |
| Ad-hoc | 328 | 28% |
| Blocked | 12 | 1% |

5 active rules across 3 governed data sources.
~~~

**After governance errors:**

~~~
**Error:** Query blocked by governance.

Rule **EXCLUDE_ORGANIC** (override policy: `never`) cannot be overridden. Contact your admin to change the policy, or rewrite the query to include the required filter.
~~~
