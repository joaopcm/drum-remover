/**
 * GitHub release tag this build was published under (e.g.
 * `v0.1.0-build.42`), injected by `electron.vite.config.ts` from the
 * `SOCRASH_BUILD_TAG` env var set in `.github/workflows/release.yml`.
 *
 * The `typeof` guard keeps this safe under Vitest and other non-Vite
 * runners, where the identifier is never defined/replaced.
 */
declare const __SOCRASH_BUILD_TAG__: string | undefined;

export const BUILD_TAG: string =
  typeof __SOCRASH_BUILD_TAG__ === "undefined" ? "dev" : __SOCRASH_BUILD_TAG__;
