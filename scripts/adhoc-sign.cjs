const { execFileSync } = require("node:child_process");
const path = require("node:path");

/**
 * electron-builder `afterPack` hook: ad-hoc sign the macOS app.
 *
 * We have no Apple Developer certificate, so the CI build skips real signing.
 * On Apple Silicon an unsigned (or signature-invalidated) Electron binary is
 * reported by Gatekeeper as "damaged and can't be opened". An ad-hoc signature
 * (`codesign -s -`) makes the app runnable again. This does NOT notarize it —
 * users still clear the download quarantine (right-click → Open, or
 * `xattr -cr`) — but the app is no longer flagged as damaged.
 */
exports.default = function adhocSign(context) {
  if (context.electronPlatformName !== "darwin") {
    return;
  }
  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", appPath], {
    stdio: "inherit",
  });
};
