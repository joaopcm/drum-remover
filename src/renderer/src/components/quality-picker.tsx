import { Badge } from "@renderer/components/ui/badge";
import { Button } from "@renderer/components/ui/button";
import { formatBytes } from "@renderer/lib/format";
import { cn } from "@renderer/lib/utils";
import {
  MODEL_QUALITIES,
  type ModelQuality,
  type ModelStatus,
  type Settings,
} from "@shared/types";
import { Check, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

interface QualityInfo {
  blurb: string;
  label: string;
  speed: string;
}

const QUALITY_INFO: Record<ModelQuality, QualityInfo> = {
  balanced: {
    blurb: "The full-precision model. Reference-quality results, a bit slower.",
    label: "Balanced",
    speed: "A little slower",
  },
  best: {
    blurb:
      "An ensemble of four fine-tuned models for the cleanest possible separation.",
    label: "Best",
    speed: "Slowest (~4× the work)",
  },
  fast: {
    blurb:
      "Great for practicing along — near-identical drum isolation for most tracks.",
    label: "Fast",
    speed: "Fastest",
  },
};

interface QualityCardProps {
  active: boolean;
  disabled: boolean;
  info: QualityInfo;
  isDownloading: boolean;
  onCancel: () => void;
  onSelect: () => void;
  pct: number;
  status: ModelStatus | undefined;
}

function QualityCard({
  active,
  disabled,
  info,
  isDownloading,
  onCancel,
  onSelect,
  pct,
  status,
}: QualityCardProps): React.JSX.Element {
  const sizeLabel = status ? formatBytes(status.bytes) : "…";

  return (
    <div
      className={cn(
        "flex flex-col gap-2.5 rounded-[var(--radius)] border p-4 transition-colors",
        active ? "border-drum bg-drum/5" : "border-border"
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{info.label}</span>
          {active ? (
            <Badge tone="drum">
              <Check className="size-3" />
              Active
            </Badge>
          ) : null}
          {status?.ready && !active ? (
            <Badge tone="rest">Downloaded</Badge>
          ) : null}
        </div>
        <span className="font-mono text-muted text-xs tabular-nums">
          {sizeLabel}
        </span>
      </div>

      <p className="text-muted text-xs leading-relaxed">{info.blurb}</p>

      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[11px] text-muted">{info.speed}</span>
        {active || isDownloading ? null : (
          <Button
            disabled={disabled}
            onClick={onSelect}
            size="sm"
            variant="secondary"
          >
            {status?.ready ? "Use" : `Download (${sizeLabel})`}
          </Button>
        )}
      </div>

      {isDownloading ? (
        <div className="flex flex-col gap-1.5">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
            <div
              className="h-full rounded-full bg-drum transition-[width] duration-200"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex items-center justify-between font-mono text-[11px] text-muted">
            <span className="flex items-center gap-1.5">
              <Loader2 className="size-3 animate-spin" />
              Downloading… {Math.round(pct)}%
            </span>
            <Button
              className="h-auto p-0 text-rest text-xs hover:bg-transparent hover:underline"
              onClick={onCancel}
              size="sm"
              variant="ghost"
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

interface QualityPickerProps {
  activeQuality: ModelQuality;
  disabled: boolean;
  onQualityChange: (settings: Settings) => void;
}

export function QualityPicker({
  activeQuality,
  disabled,
  onQualityChange,
}: QualityPickerProps): React.JSX.Element {
  const [statuses, setStatuses] = useState<ModelStatus[] | null>(null);
  const [downloading, setDownloading] = useState<ModelQuality | null>(null);
  const [pct, setPct] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    window.api
      .getModelStatuses()
      .then(setStatuses)
      .catch(() => setStatuses(null));
  }, []);

  useEffect(() => {
    refresh();
    return window.api.onModelDownloadProgress((update) => {
      setPct(update.pct);
    });
  }, [refresh]);

  function selectQuality(quality: ModelQuality) {
    if (disabled || downloading !== null) {
      return;
    }
    setError(null);
    setDownloading(quality);
    setPct(0);
    window.api
      .downloadModel(quality)
      .then((settings) => {
        onQualityChange(settings);
        refresh();
      })
      .catch((err: unknown) => {
        // An aborted download rejects too; treat any failure as "not switched".
        setError(
          err instanceof Error ? err.message : "Couldn't switch quality."
        );
      })
      .finally(() => {
        setDownloading(null);
        setPct(0);
      });
  }

  function cancel() {
    window.api.cancelModelDownload().catch(() => {
      // Best-effort; the in-flight download rejects and resets state.
    });
  }

  const busyElsewhere = downloading !== null;

  return (
    <div className="flex flex-col gap-3">
      {MODEL_QUALITIES.map((quality) => (
        <QualityCard
          active={quality === activeQuality}
          disabled={disabled || busyElsewhere}
          info={QUALITY_INFO[quality]}
          isDownloading={downloading === quality}
          key={quality}
          onCancel={cancel}
          onSelect={() => selectQuality(quality)}
          pct={pct}
          status={statuses?.find((s) => s.quality === quality)}
        />
      ))}

      {error === null ? null : (
        <p className="text-destructive text-sm">{error}</p>
      )}
    </div>
  );
}
