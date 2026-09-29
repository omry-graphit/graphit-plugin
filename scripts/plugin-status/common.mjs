// Feature #1042: shared constants and pure helpers, split out of plugin-status.mjs
// (855 lines) before the cloud refresh lands. No module-level state and no
// process.argv/env reads, so every sibling module can import it.

import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

export const PACKAGE_NAME = "@graphit/cli";
export const PLUGIN_ID = "graphit@graphit-plugin";
export const CLAUDE_MARKETPLACE_NAME = "graphit-plugin";
export const CLAUDE_PLUGIN_NAME = "graphit";
// Project #246: version-cache schema. Bump when the cache shape changes; older
// caches are then treated as a miss and refetched (self-healing).
export const CACHE_SCHEMA_VERSION = 1;
// Strict semver. The wrapper enforces the same shape (SEC-6); keep them in sync.
const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

export function tryReadJson(path) {
  try {
    if (!existsSync(path)) return null;
    return readJson(path);
  } catch {
    return null;
  }
}

export function tryParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function readFrontmatterVersion(path) {
  try {
    const content = readFileSync(path, "utf-8");
    return content.match(/^skill_version:\s*["']?([^"'\n]+)["']?\s*$/m)?.[1] ?? null;
  } catch {
    return null;
  }
}

export function isStrictSemver(value) {
  return typeof value === "string" && SEMVER_RE.test(value);
}

export function compareVersions(left, right) {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);

  for (let index = 0; index < 3; index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;
    if (leftPart > rightPart) return 1;
    if (leftPart < rightPart) return -1;
  }

  return 0;
}

export function versionIsBehind(version, currentVersion) {
  if (!isStrictSemver(currentVersion)) return false;
  if (!version || !isStrictSemver(version)) return true;
  return compareVersions(version, currentVersion) < 0;
}

export function sanitizePathPart(value) {
  return value.replace(/[^a-zA-Z0-9\-_.]/g, "-");
}

export function isWithinDirectory(child, parent) {
  const parentResolved = resolve(parent);
  const childResolved = resolve(child);
  const rel = relative(parentResolved, childResolved);
  return rel === "" || (!!rel && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

export function realpathSafe(path) {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

// SEC-4: atomic write (tmp + rename) so concurrent SessionStart writers can never
// leave a torn/partial file for the wrapper or a later read.
export function atomicWriteJson(path, obj) {
  const tmpPath = `${path}.${process.pid}.tmp`;
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(tmpPath, JSON.stringify(obj), "utf-8");
    renameSync(tmpPath, path);
  } catch {
    // Writes here must never break startup hooks; clean up any temp file.
    try {
      rmSync(tmpPath, { force: true });
    } catch {
      // ignore
    }
  }
}
