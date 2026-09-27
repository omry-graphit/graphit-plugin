# Scheduled Reports

Load before creating, changing, sending or troubleshooting a scheduled report: a dashboard emailed or posted to Slack on a schedule, optionally with agent commentary. A report delivers an existing dashboard, so build or pick the dashboard first. Delivery from a private source still needs Share for the source and its bound model.

## Before creating

- Before `report create`, check `report list --dashboard <id>` and update an existing report instead of creating a second.
- Resolve destinations with `report destinations`: the Slack channels the bot can post to, the org's members (name and email) and its allowed email domains. Map the user's words ("#growth", "Dana") to those entries; an address outside members and allowed domains is refused.
- Add only recipients and channels the user named. Confirm destinations, schedule and timezone in one line before `report create`; never widen delivery on your own.
- A report and its commentary render with the creator's data access - yours when you create it. Say so when the recipients differ from who can open the dashboard.

## Creating and changing

- `report create` needs `--dashboard`, `--name`, `--frequency`, `--send-time` and at least one `--email` or `--slack`. Weekly takes `--day-of-week` (mon..sun), monthly `--day-of-month` (1-28); `--timezone` is IANA and defaults to UTC, so pass the user's.
- `--filter key=value` sets a dashboard filter by its declared state key (state-contract.md): `a,b` for several values, `start..end` for a date range. `--instructions` adds agent commentary to every run.
- `report update` changes only the flags passed. `--email`, `--slack`, `--filter` and `--state-file` REPLACE the stored value: read it with `report get` and send the full intended list or map. `--clear-filters` / `--clear-instructions` remove them.
- Recipients, channels, instructions and filters are the creator's alone to change; pausing, rescheduling, sending, testing and deleting need the creator, a dashboard editor or an org admin. Report a refusal as that rule, not a fault.

## Sending and checking

- `report test` goes to the creator only; use it to check a render. `report send` goes to every recipient now: only when the user asks.
- `report runs` shows each run's status, deliveries, error and commentary outcome; `report run <id> <run-id>` shows the commentary exchange (creator only). Report partial or failed delivery as it is: a run is not a delivery.
