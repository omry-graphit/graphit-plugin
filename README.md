# Graphit Plugin

Build custom HTML dashboards from real data using the [Graphit CLI](https://www.npmjs.com/package/@graphit/cli).

## Install

### Claude Code

```
/plugin marketplace add omry-graphit/graphit-plugin
/plugin install graphit@graphit-plugin
```

### Codex CLI

```
codex plugin marketplace add omry-graphit/graphit-plugin
```

### Cursor

Copy `skills/graphit/cursor/*.mdc` files to `.cursor/rules/` in your project.

## Prerequisites

Install the Graphit CLI and authenticate:

```bash
npm install -g @graphit/cli
graphit auth login
graphit setup
```

## What this plugin does

The `/graphit` skill teaches your AI coding assistant how to:

- Explore your Knowledge Base (metrics, dimensions, tables, rules)
- Query cached data sources (fast, ~100ms) or live Snowflake (~10s)
- Build HTML dashboards with live data via `graphit.resolve()`
- Wrap every element with `data-graphit-*` attributes for platform integration
- Use the built-in chart runtime (`graphit.chart`, `graphit.table`, `graphit.kpi`)

## Links

- [Graphit](https://graphit-app.com)
- [@graphit/cli on npm](https://www.npmjs.com/package/@graphit/cli)
