// Project #305: the one place that knows how Claude Code and Cursor hook payloads
// differ. Pure - no top-level side effects and no process reads - so the hook
// scripts and the tests can both import it. Cursor facts (R-rows) are pinned in
// docs/workflow/projects/complete/305_cursor-plugin-parity/RESEARCH.md.

// Every Cursor hook payload carries cursor_version (R4); Claude Code's never does.
export function detectHost(payload) {
  return payload && typeof payload === "object" && "cursor_version" in payload ? "cursor" : "claude";
}

// Cursor's postToolUse tool_output is a JSON string of {output, exitCode}, where
// output already joins stdout and stderr (R6). Claude Code's tool_response is an
// object ({stdout, stderr, ...}) or a raw string. Anything unreadable gives "".
function cursorOutputText(toolOutput) {
  let parsed = toolOutput;
  if (typeof toolOutput === "string") {
    try {
      parsed = JSON.parse(toolOutput);
    } catch {
      return "";
    }
  }
  return typeof parsed?.output === "string" ? parsed.output : "";
}

function claudeOutputText(response) {
  const text = typeof response === "string" ? response : response?.stdout ?? response?.stderr ?? "";
  return typeof text === "string" ? text : "";
}

export function readToolEvent(payload) {
  const host = detectHost(payload);
  const command = payload?.tool_input?.command;
  return {
    host,
    // Cursor maps Claude Code's Bash tool to Shell (R3).
    isShell: payload?.tool_name === "Bash" || payload?.tool_name === "Shell",
    command: typeof command === "string" ? command : "",
    outputText: host === "cursor" ? cursorOutputText(payload?.tool_output) : claudeOutputText(payload?.tool_response),
  };
}

// `event` is the Claude-style name each script uses internally (the `--hook`
// argv). Cursor also accepts the nested envelope, but only through a compat flag
// (R4), so it gets the documented flat one; beforeSubmitPrompt needs `continue`.
export function formatContext(host, event, text) {
  if (host === "cursor") {
    return event === "UserPromptSubmit" ? { additional_context: text, continue: true } : { additional_context: text };
  }
  return { hookSpecificOutput: { hookEventName: event, additionalContext: text } };
}

// `graphit <verb>`, local dev `node dist/index.js <verb>`, and Cursor/Codex's
// `npx -y @graphit/cli[@<version>] <verb>`. A source string, so each caller
// builds its own RegExp with or without `g` (`.test()` must not be stateful).
// hooks/query-view/result.ts copies the query pattern verbatim - the two must
// agree (test/cursor-hooks.test.mjs pins the literal).
export function graphitInvocationSource(verb) {
  return `(?:graphit|index\\.js|@graphit\\/cli(?:@\\S+)?)\\s+${verb}\\b`;
}

// Feature #1062 (Gate 2): blank out quoted strings and `#` comments, keeping
// every position, so an operator inside the SQL (`x <> 'y'`, `n > 2`) is not read
// as a redirect, and `graphit query` inside another command's quotes or a
// comment is not read as a query.
export function maskQuotesAndComments(command) {
  let out = "";
  let quote = null;
  for (let i = 0; i < command.length; i += 1) {
    const ch = command[i];
    if (quote) {
      if (ch === "\\" && quote === '"' && i + 1 < command.length) {
        out += "  ";
        i += 1;
      } else if (ch === quote) {
        quote = null;
        out += ch;
      } else {
        out += " ";
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      out += ch;
    } else if (ch === "#" && (i === 0 || /\s/.test(command[i - 1]))) {
      while (i < command.length && command[i] !== "\n") {
        out += " ";
        i += 1;
      }
      if (i < command.length) out += "\n";
    } else {
      out += ch;
    }
  }
  return out;
}
