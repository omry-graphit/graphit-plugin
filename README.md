<div align="center">

# Graphit CLI

### If you can talk it, you can graph it.

AI-native business intelligence for your terminal and your AI coding assistant.<br/>
Turn natural language into governed SQL and bespoke, hand-authored HTML dashboards.

[![npm](https://img.shields.io/npm/v/@graphit/cli?color=4DB6AC&label=%40graphit%2Fcli)](https://www.npmjs.com/package/@graphit/cli)
[![node](https://img.shields.io/badge/node-%E2%89%A518-4DB6AC)](https://nodejs.org)
[![docs](https://img.shields.io/badge/docs-graphit--app.com-222224)](https://graphit-app.com)

</div>

---

`@graphit/cli` exposes the [Graphit](https://graphit-app.com) platform as commands your AI coding assistant - **Claude Code** or **Codex** - or you can drive directly: explore the governed semantic layer (the "knowledge base"), run governed queries against cached data sources, and build custom HTML/SVG/CSS dashboards on a bespoke canvas.

It installs as a plugin/skill, so your assistant knows how to reach for Graphit on any question about your business data - even when you never say "Graphit."

## Install

**1. Install the CLI** - the `graphit` binary, needed either way (requires Node.js 18+):

```bash
npm install -g @graphit/cli
graphit auth login
```

**2. Connect it to your AI coding assistant.** Either install the plugin from the marketplace, or copy the skill in with `graphit setup`.

Plugin marketplace - **Claude Code**:

```text
/plugin marketplace add omry-graphit/graphit-plugin
/plugin install graphit@graphit-plugin
```

Plugin marketplace - **Codex**:

```text
codex plugin marketplace add omry-graphit/graphit-plugin
```

Or, on any supported editor (**Claude Code, Codex, Cursor, VS Code**):

```bash
graphit setup
```

Either path installs the Graphit skill so the assistant can drive the CLI on your behalf.

## Authenticate

```bash
graphit auth login      # Open the browser login flow
graphit auth status     # Show the current account and org
graphit auth logout     # Clear stored credentials
```

The CLI talks to `https://api.graphit-app.com` by default. Set `GRAPHIT_API_URL` to point at a different backend.

TLS connections are verified against Node's bundled CA certificates, which already cover the public Graphit API. If you are behind a corporate TLS-inspecting proxy whose root certificate lives only in your operating system's trust store, set `GRAPHIT_USE_SYSTEM_CA=1` to also trust the system store. It is off by default because reading the system store is unnecessary for normal use and can crash under sandboxed agent runtimes (e.g. an editor's command sandbox on macOS, where keychain access is blocked).

## Commands

| Group | What it does |
|-------|--------------|
| `graphit auth` | Log in, check status, log out |
| `graphit kb` | Knowledge base: list, get, search, explore, and full CRUD for metrics, dimensions, rules, synonyms, domains, relationships, topics, tables, and templates |
| `graphit query` | Run a governed SQL query against your data |
| `graphit ds` | Data sources: list, create, refresh, verify, update cached sources |
| `graphit dashboard` | Custom dashboards: list, create, get, update HTML or a single entity, export to PNG/PDF, delete |
| `graphit connector` | Connections: list, add (Snowflake key pair, Snowflake OAuth, GitHub), test, remove |
| `graphit governance` | Query governance: inspect and set the enforcement mode |
| `graphit setup` | Install the Graphit skill into your AI coding assistant |

Run any command with `--help` for its exact flags and subcommands:

```bash
graphit kb create metric --help
graphit dashboard export --help
```

Global `--output <json|table|styled>` controls how results print (defaults to `json`, the machine-readable form agents rely on).

## Why Graphit

- **Governed by default.** Every query passes through a server-side governance gateway. Curated metrics and dimensions resolve through reference syntax (`{{metric:NAME}}`, `{{dim:NAME}}`), and the enforcement mode (observe / warn / strict) is set per org. Ad-hoc measures on a governed source require explicit approval and can be hard-blocked under strict mode.
- **Cached and fast.** Create a data source once and query it in milliseconds instead of hitting the live warehouse on every request.
- **A bespoke canvas, not template tiles.** Dashboards are real, hand-authored HTML, SVG, and CSS. The CLI manages the dashboard document; the rendering runtime resolves live data and wires interactivity (filters, parameters, saved views).
- **Retrieve to predict.** Look up a number, monitor it, diagnose why it moved, or project where it is headed - all through one governed semantic layer.

## Documentation

Full docs, the complete CLI reference, and the dashboard build workflow live at **[graphit-app.com](https://graphit-app.com)**.

## License

UNLICENSED. Copyright Graphit.
