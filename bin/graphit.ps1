# Graphit CLI plugin wrapper for Windows (Project #246): run the current
# @graphit/cli via npx. Reads + validates the resolver cache (user-writable, so
# untrusted) and falls back to the stamped floor version when absent/invalid.

if (-not $env:GRAPHIT_PLUGIN_ROOT) {
  $env:GRAPHIT_PLUGIN_ROOT = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

# graphit:floor (stamped by scripts/sync-plugin-version.mjs from cli/package.json)
$FloorVersion = "0.2.52"

$PackageName = "@graphit/cli"
# Strict semver: anything else is rejected so a tampered cache cannot inject.
$SemverRe = '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$'

# Fixed, graphit-owned cache dir shared with the resolver (see the bash wrapper for
# why CLAUDE_PLUGIN_DATA is intentionally not used). GRAPHIT_PLUGIN_DATA overrides.
$cacheDir = if ($env:GRAPHIT_PLUGIN_DATA) { $env:GRAPHIT_PLUGIN_DATA } else { Join-Path $env:USERPROFILE ".graphit" }
$cacheFile = Join-Path $cacheDir "plugin-status.json"
$version = $FloorVersion

if (Test-Path -LiteralPath $cacheFile) {
  try {
    $cache = Get-Content -Raw -LiteralPath $cacheFile | ConvertFrom-Json
    # SEC-6: validate the untrusted cache before use (fail-closed to floor).
    if ($cache.schemaVersion -eq 1 -and $cache.packageName -eq $PackageName -and `
        $cache.latestVersion -is [string] -and $cache.latestVersion -match $SemverRe) {
      $version = $cache.latestVersion
    }
  } catch {
    # Malformed cache -> floor.
  }
}

if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
  Write-Error "graphit: npx (Node.js >=18) is required but was not found on PATH."
  exit 127
}

# Safe argv: $version is strict-semver-validated; user args forwarded verbatim.
& npx -y "$PackageName@$version" @args
exit $LASTEXITCODE
