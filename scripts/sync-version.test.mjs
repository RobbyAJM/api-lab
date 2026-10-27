import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseVersionTag, getLatestGitTag, updateTauriConfig, syncTauriVersion } from "./sync-version.mjs";

describe("sync-version", () => {
  it("parses semver tag stripping leading v", () => {
    assert.equal(parseVersionTag("v1.2.3"), "1.2.3");
    assert.equal(parseVersionTag("1.2.3"), "1.2.3");
    assert.equal(parseVersionTag("  v0.1.59\n"), "0.1.59");
    assert.equal(parseVersionTag(""), null);
    assert.equal(parseVersionTag(null), null);
  });

  it("gets latest git tag via execFn mock", () => {
    const mockExec = () => "v0.1.59\n";
    assert.equal(getLatestGitTag(mockExec), "0.1.59");

    const failingExec = () => { throw new Error("fatal: No names found"); };
    assert.equal(getLatestGitTag(failingExec), null);
  });

  it("updates tauri config json preserving structure", () => {
    const initial = JSON.stringify({ productName: "API Lab", version: "0.1.0" }, null, 2) + "\n";
    const updated = updateTauriConfig(initial, "0.1.59");
    const parsed = JSON.parse(updated);
    assert.equal(parsed.version, "0.1.59");
    assert.equal(parsed.productName, "API Lab");
  });

  it("syncs file on disk", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-ver-test-"));
    const configPath = path.join(tmpDir, "tauri.conf.json");
    fs.writeFileSync(configPath, JSON.stringify({ version: "0.1.0" }, null, 2) + "\n");

    const res = syncTauriVersion({
      configPath,
      tag: "v0.1.59",
    });

    assert.equal(res, "0.1.59");
    const updated = JSON.parse(fs.readFileSync(configPath, "utf8"));
    assert.equal(updated.version, "0.1.59");

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
