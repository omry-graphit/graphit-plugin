# Dashboard Planning

Consult before building any multi-chart dashboard. Transforms vague requests into structured, cohesive dashboards.

## Frame the Question

Every dashboard answers ONE primary question. Name the shape first:

| Shape | Lead chart | Example question |
|---|---|---|
| Trend | line/area | "How is revenue changing?" |
| Comparison | sorted bar | "Revenue by segment?" |
| Ranking | sorted bar + top-N | "Top 10 customers?" |
| Composition | stacked bar/treemap | "Revenue share by product?" |
| Distribution | histogram | "Spread of order values?" |
| Correlation | scatter | "Spend vs conversion?" |
| Funnel | funnel + stage% | "Signup-to-purchase conversion?" |
| Cohort | heatmap/overlay lines | "D1/D7/D30 retention?" |
| Deviation | diverging bar | "Budget vs actual variance?" |

Compound intent ("what and why") - sequence trend then root-cause as two charts.

## Pick the Archetype

| Audience | Archetype | KPIs | Charts | Interactivity |
|---|---|---|---|---|
| Exec / "are we on track" | Strategic | 4-6 hero | 5-9 | Low |
| Analyst / "why is X" | Analytical | 3-5 | 6-12 + detail | High |
| Ops / "what's broken now" | Operational | 8-16 dense | 6-12 | Medium |

Never mix archetypes on a single page.

## Mandatory Rules

- **Time-series**: if data has a date column, include at least 1 line/area trend. A dashboard without a trend is a snapshot - it cannot answer "is it improving?"
- **Cohort**: if data has install/signup date + retention/LTV, add cohort curves (D0/D3/D7/D30). Period-over-period is NOT a substitute.
- **Diversity**: 4+ charts must use 3+ distinct chart types. All-bar or all-line wastes the visual encoding.
- **KPI-first**: lead with 1-3 KPI cards before detail charts unless the user says otherwise.
- **Distribution over averages**: heavy-tailed metrics (spend, session length, deal size) need percentile bands or tier breakdowns. Median + p90, never bare mean.
- **Insight titles**: state the takeaway ("Revenue grew 23% Q3"), not the metric name.
- **Reference lines**: goal-oriented metrics carry target/prior-period/benchmark lines. KPI cards need delta + comparison label.

## Metric Contract

Every KPI or measure needs all 6 properties:

1. **Definition** - what counts, what's excluded (bots, refunds, internal)
2. **Grain** - per-user-per-day, per-cohort, per-org-per-month
3. **Window** - rolling 7d/28d, MTD/QTD/YTD, cohort-anchored
4. **Population** - all users, payers, certified, segment
5. **Baseline** - vs prior period / target / cohort avg / benchmark
6. **Direction** - up=good or up=bad (drives color meaning)

Pair lagging + leading: revenue (lagging) needs retention (leading). Replace vanity cumulative counts ("total signups") with cohort/period rates. Never show AVG of a rate column - rates must be weighted. Show denominators on rates (or hide when N < 30).

## Anti-Patterns to Block

- Pie with 6+ slices (max 5, prefer 3)
- 3D charts of any kind
- Dual Y-axis without clear justification (use small multiples)
- Truncated bar baselines (always start at 0)
- Stacked bar with 5+ segments
- Gauge for unbounded KPIs (use bullet chart)
- Rainbow palette on ordinal data
- Red-green without shape encoding (accessibility)
- Aggregate-only without segment drill-down (Simpson's paradox)
- Rate without denominator visible
- KPI without baseline comparison
- Vanity cumulative counts ("total signups since launch")

## Asking Good Questions

Purpose before data. The first response should mirror the user's intent and ask ONE narrowing question - never start querying immediately.

**Batch related questions** - ask multiple things at once instead of sequential single questions. Each option should lead to a different path, not variations of the same thing.

**Use open questions for exploration** - "What business decision will this dashboard support?" beats presenting a restrictive multiple-choice.

**Clarification triggers:**
- User says "revenue" - ask: bookings, ARR, or GAAP recognized?
- User says "conversion" - ask: what's the start and end event?
- User says "active users" - ask: what defines active? (logged in? performed action? within what window?)
- User mentions MQL/SQL - ask: how does your org define the handoff? (Same column can mean 13% or 40%)

## Performance

`graphit.resolve()` is rate-limited to 120 requests/min per user per dashboard. Each call counts as one request. Design for efficiency:

- **Single refresh function.** All queries in ONE `Promise.all` inside one `refresh()` function. Never scatter `graphit.resolve()` across independent event handlers or timeouts - that turns one user action into multiple bursts.
- **Count your queries per interaction.** 6 charts = 6 requests per filter change = 20 changes/min budget. 12 charts = 10 changes/min. If you have 10+ charts with 3+ filters, consider debouncing filter changes (300ms) so rapid clicks don't each trigger a full refresh.
- **Reuse trend data for KPIs.** If you already fetch a weekly time series (`SELECT week, SUM(spend) ...`), derive the KPI total and sparkline from that result set in JS instead of running a separate aggregate query. One query serves both the chart and the KPI card.
- **Avoid redundant refreshes.** If a filter only affects some charts, split into targeted refresh functions (`refreshKPIs()`, `refreshCharts()`) so unchanged sections don't re-query.
- **No polling.** Never `setInterval(refresh, ...)`. Data sources update on their own schedule - a dashboard that polls wastes the entire rate budget.

## Pre-Build Checklist

Before generating the HTML:
- [ ] Question shape stated (trend, comparison, funnel, etc.)
- [ ] Archetype + audience identified
- [ ] Time-series present if date column exists
- [ ] Cohort view present if install/signup + retention data
- [ ] 3+ chart types for 4+ graphs
- [ ] Every KPI has definition + baseline + direction
- [ ] No anti-patterns present

## Presenting Dashboard & Connector Results

**After `graphit dashboard list`:**

~~~
**4 dashboards:**

| Name | ID | URL |
|---|---|---|
| **UA Command Center** | dash_abc | https://app.graphit-app.com/custom-dashboard/dash_abc |
| **Player Quality** | dash_def | https://app.graphit-app.com/custom-dashboard/dash_def |
~~~

**After `graphit connector list`:**

~~~
**2 connections:**

| Name | Account | Auth |
|---|---|---|
| **prod-snowflake** | xy12345.us-east-1 | OAuth |
| **staging-sf** | ab67890.us-east-1 | Keypair |
~~~
