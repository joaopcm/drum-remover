import { describe, expect, it } from "vitest";
import { buildInstallScript } from "./updater";

describe("buildInstallScript", () => {
  it("waits for the pid, extracts the zip, and swaps the app bundle in place", () => {
    const script = buildInstallScript(
      4242,
      "/tmp/socrash-update/v0.1.0-build.9.zip",
      "/Applications/Socrash.app"
    );

    expect(script).toContain("while kill -0 4242 2>/dev/null; do");
    expect(script).toContain(
      'ditto -xk "/tmp/socrash-update/v0.1.0-build.9.zip" "/tmp/socrash-update/v0.1.0-build.9.zip.extracted"'
    );
    expect(script).toContain(
      'xattr -cr "/tmp/socrash-update/v0.1.0-build.9.zip.extracted/Socrash.app"'
    );
    expect(script).toContain('rm -rf "/Applications/Socrash.app"');
    expect(script).toContain(
      'ditto "/tmp/socrash-update/v0.1.0-build.9.zip.extracted/Socrash.app" "/Applications/Socrash.app"'
    );
    expect(script).toContain('open "/Applications/Socrash.app"');
  });
});
