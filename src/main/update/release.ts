/**
 * Pure helpers for comparing GitHub release tags and picking the mac update
 * asset. Kept dependency-free (no `fetch`/`electron`) so they're cheap to
 * unit test; network access lives in `updater.ts`.
 */

/** Subset of the GitHub REST API's release asset shape we rely on. */
export interface GitHubReleaseAsset {
  browser_download_url: string;
  name: string;
  size: number;
}

const BUILD_NUMBER_PATTERN = /-build\.(\d+)$/;

/** Extracts the trailing `-build.N` counter from a tag like `v0.1.0-build.7`. */
function parseBuildNumber(tag: string): number | null {
  const match = BUILD_NUMBER_PATTERN.exec(tag);
  if (!match) {
    return null;
  }
  return Number.parseInt(match[1], 10);
}

/**
 * Compares two release tags by their build number. Returns -1 if `current`
 * is older than `latest`, 1 if newer, 0 if equal or if either tag can't be
 * parsed (treated as "no update available" rather than risking a downgrade
 * loop) — except `current` being unparseable always counts as older, since
 * that's the `"dev"` sentinel used by unpackaged builds.
 */
export function compareBuildTags(current: string, latest: string): number {
  const currentBuild = parseBuildNumber(current);
  const latestBuild = parseBuildNumber(latest);

  if (currentBuild === null) {
    return -1;
  }
  if (latestBuild === null) {
    return 0;
  }
  if (currentBuild === latestBuild) {
    return 0;
  }
  return currentBuild < latestBuild ? -1 : 1;
}

const ZIP_SUFFIX = ".zip";
const ARM64_MARKER = "arm64";

/**
 * Picks the mac update `.zip` asset from a release's asset list, preferring
 * an `arm64`-named build (Socrash only ships Apple Silicon builds, but this
 * keeps the pick deterministic if an intel zip is ever added alongside it).
 * Returns `null` if no `.zip` asset exists.
 */
export function pickMacZipAsset(
  assets: GitHubReleaseAsset[]
): GitHubReleaseAsset | null {
  const zips = assets.filter((asset) => asset.name.endsWith(ZIP_SUFFIX));
  if (zips.length === 0) {
    return null;
  }
  const arm64Zip = zips.find((asset) => asset.name.includes(ARM64_MARKER));
  return arm64Zip ?? zips[0];
}
