import { describe, expect, it } from "vitest";
import { IpcChannel } from "./ipc";

describe("IpcChannel", () => {
  it("exposes stable channel names", () => {
    expect(IpcChannel.GetAppInfo).toBe("app:get-info");
    expect(IpcChannel.GetSettings).toBe("settings:get");
  });

  it("has unique channel values", () => {
    const values = Object.values(IpcChannel);
    expect(new Set(values).size).toBe(values.length);
  });
});
