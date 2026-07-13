import { basename } from "node:path";

/**
 * Pure helpers for the update-install step. Kept dependency-free (no
 * `electron` import) so they're safe to unit test in any environment —
 * notably CI, which runs `pnpm install --ignore-scripts` and therefore never
 * provisions Electron's binary; merely importing the `electron` package
 * there throws instead of resolving.
 */

const APP_BUNDLE_PATTERN = /^(.*\.app)\//;

/** Finds the `.app` bundle root containing the running executable. */
export function resolveAppBundlePath(execPath: string): string | null {
  const match = APP_BUNDLE_PATTERN.exec(execPath);
  return match ? match[1] : null;
}

/**
 * Builds the detached shell script that performs the actual install once
 * the app quits.
 *
 * Waits for `pid` to exit, extracts the zip, strips the download quarantine
 * flag (required since the app is unnotarized — otherwise Gatekeeper blocks
 * the relaunch), swaps the bundle at `appPath` in place, then reopens it.
 */
export function buildInstallScript(
  pid: number,
  zipPath: string,
  appPath: string
): string {
  const extractDir = `${zipPath}.extracted`;
  const appName = basename(appPath);
  return `#!/bin/bash
set -e
while kill -0 ${pid} 2>/dev/null; do
  sleep 0.2
done
rm -rf "${extractDir}"
mkdir -p "${extractDir}"
ditto -xk "${zipPath}" "${extractDir}"
xattr -cr "${extractDir}/${appName}"
rm -rf "${appPath}"
ditto "${extractDir}/${appName}" "${appPath}"
rm -rf "${extractDir}" "${zipPath}"
open "${appPath}"
`;
}
