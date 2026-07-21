# Reporting Failures and Partial Results

Load this when a command failed, when only part of a multi-step task landed, or when you are about to explain an error to the user. Skip it on a clean run.

## Reporting failures and partial results

When a command fails or only part of a multi-step task succeeds, report it truthfully. The user cannot see the raw CLI output, so a bare "something went wrong" leaves them stuck. Verify each step before claiming it; never report a step as done that you did not confirm.

State three things: what succeeded, what failed (with the cause from the CLI output), and the single next step. Distinguish a transient failure (a network timeout, a mid-refresh data source - worth one retry) from a non-transient one (bad SQL, an entity not found, a permission code, a governance rejection - needs a fix, not a retry).

A passing CLI probe does not clear a failing dashboard graph. The browser dashboard runtime resolves queries with named parameters attached, while `graphit query` inlines literal values, so a query that succeeds from the CLI does not prove the graph's query path works. When graphs fail in the browser but CLI probes pass, suspect the resolve/parameters path or server-side state, and say so - do not conclude browser cache.

A bare "Internal server error" from a CLI query is a masked server-side exception, not evidence of data corruption or an outage. Do not build corruption theories or trigger data-source refreshes off a bare 500 alone; state that the error is opaque and needs the platform team or server logs.

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
