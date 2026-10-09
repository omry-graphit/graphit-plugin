#!/usr/bin/env node
// Feature #1099: builds query-view.html, the graphit-view MCP App, as one
// self-contained file (the plugin ships no node_modules): view.ts bundled with
// esbuild, the chalk G inlined. The output is committed; `--check` fails when
// it is stale (npm run check:commands runs it).

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const DIR = fileURLToPath(new URL("./", import.meta.url));
const OUT = `${DIR}query-view.html`;

const logo = readFileSync(`${DIR}../query-view/graphit-logo.svg`, "utf8")
  .replace(/^[\s\S]*?<svg[^>]*>/, "")
  .replace(/<\/svg>\s*$/, "")
  .replace(/<title>[\s\S]*?<\/title>/, "");

const CSS = `
:root { color-scheme: light dark; --fg: #1D1D1F; --muted: #6E6E73; --line: rgba(0,0,0,0.10); --surface: #FFFFFF; --accent: #4DB6AC; --chip: rgba(118,118,128,0.12); }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --fg: #F2F2F7; --muted: #A1A1A6; --line: rgba(255,255,255,0.14); --surface: #1C1C1E; --chip: rgba(255,255,255,0.10); } }
:root[data-theme="dark"] { --fg: #F2F2F7; --muted: #A1A1A6; --line: rgba(255,255,255,0.14); --surface: #1C1C1E; --chip: rgba(255,255,255,0.10); }
html, body { margin: 0; padding: 0; background: transparent; color: var(--fg); font: 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
#root { padding: 4px 0 8px; overflow-x: hidden; }
.card { position: relative; transform-origin: top left; }
.card .svg svg { display: block; }
.band { position: absolute; left: 16px; right: 16px; display: flex; align-items: center; gap: 6px; flex-wrap: nowrap; overflow: hidden; }
.band.tabs { left: 16px; }
.group { display: inline-flex; align-items: center; gap: 4px; margin-left: 10px; }
.status { color: #6E6E73; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }
.btn { font: inherit; font-size: 12px; border: 1px solid rgba(0,0,0,0.10); background: rgba(255,255,255,0.85); color: #1D1D1F; border-radius: 7px; padding: 4px 10px; cursor: pointer; white-space: nowrap; }
.btn:hover { background: #FFFFFF; }
.btn.on { background: #222224; color: #F7F6F2; border-color: #222224; }
.btn.dim { opacity: 0.4; cursor: default; }
.btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.drawer { box-sizing: border-box; margin-top: 10px; max-width: 720px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); padding: 10px 12px; }
.drawer header { display: flex; align-items: center; gap: 8px; }
.drawer h2 { flex: 1; font-size: 14px; margin: 0; }
.drawer h3 { font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); margin: 10px 0 4px; }
.drawer .btn { background: var(--chip); color: var(--fg); border-color: var(--line); }
.drawer dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 12px; margin: 8px 0 0; }
.drawer dt { color: var(--muted); }
.drawer dd { margin: 0; overflow-wrap: anywhere; }
.drawer details { padding: 4px 0; border-top: 1px solid var(--line); }
.drawer summary { cursor: pointer; }
.dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; }
.muted { color: var(--muted); }
pre.sql { white-space: pre-wrap; font: 12px ui-monospace, Menlo, monospace; margin: 8px 0 0; max-height: 360px; overflow: auto; }
.search { flex: 0 1 200px; font: inherit; padding: 4px 8px; border-radius: 7px; border: 1px solid var(--line); background: transparent; color: var(--fg); }
.scroll { max-height: 360px; overflow: auto; margin-top: 8px; }
table { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; }
th, td { text-align: left; padding: 4px 8px; border-bottom: 1px solid var(--line); white-space: nowrap; }
th { position: sticky; top: 0; background: var(--surface); }
th .btn { border: 0; background: transparent; padding: 0; font-weight: 600; color: var(--fg); }
td.num { text-align: right; }
.drawer footer { display: flex; align-items: center; justify-content: space-between; margin-top: 8px; }
`;

async function render() {
  const out = await build({
    entryPoints: [`${DIR}view.ts`],
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2020",
    minify: true,
    legalComments: "none",
    write: false,
    jsx: "transform",
    define: { GRAPHIT_LOGO_INNER: JSON.stringify(logo) },
    logLevel: "silent",
  });
  // `</script` inside the bundle would close the tag early.
  const js = out.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Graphit query</title>
<style>${CSS}</style>
</head>
<body>
<div id="root"><p class="muted">Loading the Graphit result…</p></div>
<script>${js}</script>
</body>
</html>
`;
}

const html = await render();
if (process.argv.includes("--check")) {
  let current = "";
  try {
    current = readFileSync(OUT, "utf8");
  } catch {
    // missing counts as stale
  }
  if (current !== html) {
    console.error("hooks/query-view-app/query-view.html is stale: run `npm run build:view` in cli/.");
    process.exit(1);
  }
} else {
  writeFileSync(OUT, html);
  console.log(`query-view.html: ${(html.length / 1024).toFixed(0)} KB`);
}
