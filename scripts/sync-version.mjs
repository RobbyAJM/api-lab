import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function parseVersionTag(tag) {
  if (!tag || typeof tag !== "string") return null;
  const trimmed = tag.trim();
  if (!trimmed) return null;
  return trimmed.replace(/^v/, "");
}

export function getLatestGitTag(execFn = execSync) {
  try {
    const raw = execFn("git describe --tags --abbrev=0", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return parseVersionTag(raw);
  } catch {
    return null;
  }
}

export function updateTauriConfig(rawJson, newVersion) {
  const parsed = JSON.parse(rawJson);
  parsed.version = newVersion;
  return JSON.stringify(parsed, null, 2) + "\n";
}

export function syncTauriVersion({
  configPath = path.resolve(process.cwd(), "apps/desktop/src-tauri/tauri.conf.json"),
  tag = null,
  execFn = execSync,
} = {}) {
  const resolvedVersion = tag ? parseVersionTag(tag) : getLatestGitTag(execFn);
  if (!resolvedVersion) {
    console.warn("No git tag found; keeping existing tauri.conf.json version.");
    return null;
  }

  const raw = fs.readFileSync(configPath, "utf8");
  const updated = updateTauriConfig(raw, resolvedVersion);

  if (raw !== updated) {
    fs.writeFileSync(configPath, updated, "utf8");
    console.log(`Synced ${configPath} version to ${resolvedVersion}`);
  } else {
    console.log(`Version already matches ${resolvedVersion}`);
  }

  return resolvedVersion;
}

// ponytail: CLI entry point directly executes syncTauriVersion; add argument parsing if flags needed later.
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  syncTauriVersion();
}
