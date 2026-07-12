import { describe, expect, it } from "vitest";
import { compareBuildTags, pickMacZipAsset } from "./release";

describe("compareBuildTags", () => {
  it("returns -1 when the current tag's build number is lower", () => {
    expect(compareBuildTags("v0.1.0-build.5", "v0.1.0-build.7")).toBe(-1);
  });

  it("returns 1 when the current tag's build number is higher", () => {
    expect(compareBuildTags("v0.1.0-build.7", "v0.1.0-build.5")).toBe(1);
  });

  it("returns 0 for identical tags", () => {
    expect(compareBuildTags("v0.1.0-build.7", "v0.1.0-build.7")).toBe(0);
  });

  it("treats the unpackaged/dev tag as always older", () => {
    expect(compareBuildTags("dev", "v0.1.0-build.1")).toBe(-1);
  });

  it("treats an unparseable latest tag as not newer", () => {
    expect(compareBuildTags("v0.1.0-build.7", "not-a-real-tag")).toBe(0);
  });
});

describe("pickMacZipAsset", () => {
  it("picks the .zip asset when there's exactly one", () => {
    const asset = pickMacZipAsset([
      {
        browser_download_url: "https://x/Socrash-0.1.0.dmg",
        name: "Socrash-0.1.0.dmg",
        size: 1,
      },
      {
        browser_download_url: "https://x/Socrash-0.1.0-arm64-mac.zip",
        name: "Socrash-0.1.0-arm64-mac.zip",
        size: 2,
      },
    ]);
    expect(asset?.name).toBe("Socrash-0.1.0-arm64-mac.zip");
  });

  it("prefers the arm64 zip when multiple zips are present", () => {
    const asset = pickMacZipAsset([
      {
        browser_download_url: "https://x/Socrash-0.1.0-mac.zip",
        name: "Socrash-0.1.0-mac.zip",
        size: 1,
      },
      {
        browser_download_url: "https://x/Socrash-0.1.0-arm64-mac.zip",
        name: "Socrash-0.1.0-arm64-mac.zip",
        size: 2,
      },
    ]);
    expect(asset?.name).toBe("Socrash-0.1.0-arm64-mac.zip");
  });

  it("returns null when no .zip asset is present", () => {
    const asset = pickMacZipAsset([
      {
        browser_download_url: "https://x/Socrash-0.1.0.dmg",
        name: "Socrash-0.1.0.dmg",
        size: 1,
      },
    ]);
    expect(asset).toBeNull();
  });
});
