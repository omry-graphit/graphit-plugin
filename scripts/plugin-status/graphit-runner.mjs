// Feature #1099: how the graphit-view MCP server runs the graphit CLI for the
// query card's KB and lineage panes. The server runs under the editor's
// environment, not a shell, and a Cursor local copy ships no bin/: a global
// `graphit` first, else npx at the plugin's version - and once npx is needed it
// stays the choice for the server's lifetime.

// cmd.exe's "is not recognized as an internal or external command" exit code.
const WINDOWS_NOT_FOUND = 9009;

// A missing command, as opposed to a graphit that ran and failed. On Windows
// the .cmd shim needs a shell, so a missing graphit is cmd's exit, not ENOENT.
export function isMissingCommand(ran, platform) {
  if (ran.missing) return true;
  return platform === "win32" && !ran.stdout && (ran.code === WINDOWS_NOT_FOUND || /is not recognized as an internal or external command/i.test(ran.stderr));
}

// `runFile(file, args)` resolves {stdout, stderr, missing?, code?}; injected so
// the fallback is testable without a real PATH.
export function createGraphitRunner({ runFile, platform = process.platform, version = "latest" }) {
  let useNpx = false;
  return async (args) => {
    if (!useNpx) {
      const ran = await runFile("graphit", args);
      if (!isMissingCommand(ran, platform)) return ran;
      useNpx = true;
    }
    return runFile("npx", ["-y", `@graphit/cli@${version}`, ...args]);
  };
}
