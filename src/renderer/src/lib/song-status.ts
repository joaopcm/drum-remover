import type { SongStatus } from "@shared/types";

export interface StatusMeta {
  label: string;
  tone: "neutral" | "drum" | "rest" | "destructive";
}

const STATUS_META: Record<SongStatus, StatusMeta> = {
  downloading: { label: "Downloading", tone: "rest" },
  error: { label: "Failed", tone: "destructive" },
  queued: { label: "Queued", tone: "neutral" },
  ready: { label: "Ready", tone: "rest" },
  separating: { label: "Separating", tone: "drum" },
};

/** Display label and channel-colored badge tone for a song status. */
export function statusMeta(status: SongStatus): StatusMeta {
  return STATUS_META[status];
}
