# Domain Lenses

Consult when the user's data signals match a specific business domain. Each lens provides domain-specific metrics, chart types, and anti-patterns that make dashboards feel expert-built.

Detect the domain from column names and user intent. Apply universal planning rules first (see dashboard-planning.md), then layer domain-specific patterns.

Several high-value lens charts - **waterfall** (P&L / ARR bridges), **bullet** (KPI vs target), **Lorenz** (revenue concentration), and **histogram** (attainment distribution) - are NOT native `graphit.chart()` types, so `graphit.chart()` throws on those names. Build them as hand-rolled SVG (see `chart-selection.md` for the native-vs-hand-rolled split). The native lens charts (line, bar, stacked-bar, heatmap, funnel, KPI, sparkline) render through `graphit.chart` / `graphit.kpi`.

---

## Marketing & Attribution

**Signals:** utm_*, channel, creative_id, spend, cpi, impressions, clicks, roas, cac, ltv, attribution_*, skan_*, conversions, ctr.

**Key metrics:**

| Metric | Formula pattern | Chart |
|---|---|---|
| Blended CAC / Paid CAC | spend / new_customers | bar/KPI, target + YoY |
| ROAS D7/D30/D90 | revenue_D0-N / spend | cumulative cohort line + 100% breakeven |
| MER | revenue / marketing_spend | KPI |
| LTV:CAC Ratio | LTV / CAC | bar, floor 3:1 |
| Payback Period | days to recoup CAC | cumulative line |

**Must-have charts:** Cumulative cohort ROAS curve with 100% breakeven line. Channel-mix sorted bar (never pie for 6+). Creative scorecard table. Attribution model comparison stacked bar.

**Anti-patterns:** Mismatched attribution windows across channels (7d vs 30d = 30% artifact). ROAS without payback context. Summing self-reported channel conversions without dedup (totals 110-180%). Spend without incrementality context. Creative table without refresh ratio.

**Clarify first:** Attribution model + window? ROAS gross or margin-adjusted?

---

## Financial / Executive

**Signals:** revenue, mrr, arr, cogs, gross_margin, opex, ebitda, budget, forecast, actual, variance, runway, burn, cash_balance, gl_account.

**Key metrics:**

| Metric | Formula pattern | Chart |
|---|---|---|
| P&L Cascade | Rev->COGS->GP->Opex->EBITDA->Net | waterfall |
| Variance $/% | Actual-Plan, sign-aware per line type | semantic-color bar |
| GM% by segment | (Rev-COGS)/Rev per product/cohort | line + small multiples |
| Burn Multiple | net_burn / net_new_ARR | KPI + trend |
| Runway Months | Cash / abs(Net Burn) | KPI color-banded |
| Rule of 40 | Growth% + EBITDA margin% | KPI + trend |

**Must-have charts:** Waterfall (P&L, variance bridge, ARR bridge). Bullet chart for KPI vs target. Plan vs Forecast vs Actual (3 series, never 2). Variance bars with semantic color (green=favorable, red=unfavorable regardless of direction).

**Anti-patterns:** Direction-based green/red instead of favorable/unfavorable. Blended GM hiding AI inference cost compression. YTD comparison in Jan/Dec (use TTM). Cash burn without runway. Revenue without ASC 606 distinction. "Three-line" missing Forecast (Plan vs Actual vs Forecast = 3).

**Clarify first:** Revenue = bookings, ARR, or GAAP recognized?

---

## Product / Growth

**Signals:** install_date, signup_at, cohort_*, retention_d*, dau, mau, activation_*, payer_*, funnel_step, session_*, ltv, arpu, arpdau.

**Key metrics:**

| Metric | Formula pattern | Chart |
|---|---|---|
| D1/D7/D30 Retention | active_dN / cohort_size | heatmap or overlay |
| Stickiness | DAU/MAU | line + ref bands |
| ARPDAU | revenue_day / DAU_day | line + 7d MA |
| Payer Conversion D7 | first_payers_d7 / cohort | cumulative line |
| Whale Share | sum(rev) top-X% / total_rev | Lorenz / decile bar |
| Activation Rate | reached_aha / signups | cohort heatmap |

**Must-have charts:** Cohort retention heatmap (X=days since signup, Y=cohort, color=retention%). Cumulative cohort overlay (max 6 series). Lorenz/decile bar for revenue concentration. FTUE funnel with per-cohort drift.

**Anti-patterns:** Period retention instead of cohort retention. Bare ARPU without distribution (whales break every mean). Mean on heavy-tailed metrics (use median + p90). LTV without cohort horizon day. Vanity cumulative tiles.

---

## Operational Monitoring

**Signals:** latency, p50/p95/p99, error_rate, slo, uptime, mttr, throughput, oee, cycle_time, otif, fill_rate, stockout, deployment_frequency.

**Key metrics:**

| Metric | Formula pattern | Chart |
|---|---|---|
| Latency p50/p95/p99 | percentile buckets | multi-percentile line + SLO |
| Error Budget | 100% - (errors/total) rolling 28d | bullet chart |
| DORA Quartet | deploy freq, lead time, CFR, recovery | 4-tile KPI |
| OEE | Availability x Performance x Quality | KPI + 3-tile decomp |
| OTIF | on-time AND in-full | trend + decomp stacked bar |

**Must-have charts:** Multi-percentile line + SLO threshold band. Bullet chart (not gauge). Latency heatmap. Error sources Pareto.

**Anti-patterns:** Averages without percentiles. KPI without threshold band. Vanity uptime % (use error-budget framing). Aggregating across segments (global 0.4% hides a region at 8%).

---

## Sales / Pipeline

**Signals:** opp_id, stage, amount, close_date, forecast_category, mql, sql, arr, acv, tcv, quota, attainment, loss_reason, expansion_arr.

**Key metrics:**

| Metric | Formula pattern | Chart |
|---|---|---|
| Pipeline Coverage | open_pipe / quota_remaining | KPI, target=1/win_rate |
| Sales Velocity | (opps x win_rate x avg_acv) / cycle_days | KPI + trend |
| Win Rate by ACV | won / (won+lost) per band | sorted bar, min-N 30 |
| Quota Attainment | closed_won / quota | histogram (bimodal!) |
| Net New ARR | new + expansion - contraction - churn | waterfall |
| Forecast MAPE | mean(abs(actual-forecast)/actual) | line + target |

**Must-have charts:** Net New ARR waterfall (start + new + expansion - contraction - churn = end). Forecast convergence curve (13 weeks). Coverage curve by quarter-week. Win rate by ACV band.

**Anti-patterns:** Fixed 3x coverage instead of 1/win_rate per segment. ACV/ARR/TCV/bookings conflated. Quota attainment as bare mean (bimodal - use histogram). Stage-weighted pipe using CRM defaults (30-50% overstate). "No decision" lumped (40-60% of B2B - split it).

**Clarify first:** MQL/SQL definitions (same column = 13-40% conversion depending on org). Revenue = bookings vs ARR vs GAAP. Coverage target: derive from historical win rate per segment, not fixed multiple.
