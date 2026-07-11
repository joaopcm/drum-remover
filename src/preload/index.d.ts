import type { ElectronAPI } from "@electron-toolkit/preload";
import type { SocrashApi } from "../shared/ipc";

declare global {
  interface Window {
    api: SocrashApi;
    electron: ElectronAPI;
  }
}
