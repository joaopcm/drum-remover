import { useAppView } from "@renderer/app-view";
import { Button } from "@renderer/components/ui/button";
import { Kbd } from "@renderer/components/ui/kbd";
import { Slider } from "@renderer/components/ui/slider";
import { Tooltip } from "@renderer/components/ui/tooltip";
import { formatDuration } from "@renderer/lib/format";
import { cn } from "@renderer/lib/utils";
import type { Song } from "@shared/types";
import {
  ChevronDown,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  SkipBack,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePlayer } from "./player-provider";
import { isTypingTarget } from "./typing-target";
import { Waveform } from "./waveform";

/** Seconds jumped by the ⏪/⏩ transport buttons and the arrow keys. */
const SKIP_SECONDS = 10;

type ChannelKey = "drums" | "rest" | "metronome";

const CHANNEL_STYLE: Record<ChannelKey, { accent: string; text: string }> = {
  drums: { accent: "bg-drum", text: "text-drum" },
  metronome: { accent: "bg-metronome", text: "text-metronome" },
  rest: { accent: "bg-rest", text: "text-rest" },
};

export function FullPlayer(): React.JSX.Element {
  const { activeSongId, minimizePlayer } = useAppView();
  const {
    load,
    play,
    toggle,
    currentSongId,
    status,
    playing,
    positionSec,
    durationSec,
    drumVolume,
    restVolume,
    metronomeVolume,
    peaks,
    seek,
    setDrumVolume,
    setRestVolume,
    setMetronomeVolume,
  } = usePlayer();

  const [song, setSong] = useState<Song | null>(null);
  const [show, setShow] = useState(false);

  // Latest transport values for the keyboard handler, so seeking doesn't need
  // to re-bind the listener on every animation-frame position tick.
  const positionRef = useRef(0);
  const durationRef = useRef(0);
  positionRef.current = positionSec;
  durationRef.current = durationSec;

  // Volume before the user muted a channel, so unmuting restores their level.
  // Metronome starts silent, so its restore target is a sensible default.
  const preMuteRef = useRef<Record<ChannelKey, number>>({
    drums: 1,
    metronome: 0.6,
    rest: 1,
  });

  useEffect(() => {
    setShow(true);
  }, []);

  useEffect(() => {
    if (activeSongId && currentSongId !== activeSongId) {
      load(activeSongId)
        .then((ok) => {
          if (ok) {
            play();
          }
        })
        .catch(() => {
          // Load failure surfaces via `status === "error"` below.
        });
    }
  }, [activeSongId, currentSongId, load, play]);

  useEffect(() => {
    if (!activeSongId) {
      return;
    }
    let active = true;
    window.api
      .listSongs()
      .then((list) => {
        if (active) {
          setSong(list.find((item) => item.id === activeSongId) ?? null);
        }
      })
      .catch(() => {
        // Title/artist just stay blank if the library can't be read.
      });
    return () => {
      active = false;
    };
  }, [activeSongId]);

  const skipTo = useCallback(
    (sec: number) => {
      seek(Math.min(durationRef.current, Math.max(0, sec)));
    },
    [seek]
  );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (
        isTypingTarget(event.target) ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      ) {
        return;
      }
      if (event.code === "Space") {
        event.preventDefault();
        toggle();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        skipTo(positionRef.current - SKIP_SECONDS);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        skipTo(positionRef.current + SKIP_SECONDS);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggle, skipTo]);

  const loading = status === "loading";
  const transportDisabled = loading || durationSec === 0;

  function toggleMute(
    key: ChannelKey,
    value: number,
    setValue: (next: number) => void
  ) {
    if (value > 0) {
      preMuteRef.current[key] = value;
      setValue(0);
    } else {
      setValue(preMuteRef.current[key] || 1);
    }
  }

  let transportIcon: React.JSX.Element;
  if (loading) {
    transportIcon = <Loader2 className="size-6 animate-spin" />;
  } else if (playing) {
    transportIcon = <Pause className="size-6" />;
  } else {
    transportIcon = <Play className="size-6 translate-x-0.5" />;
  }

  return (
    <div
      className={cn(
        "fixed inset-0 z-40 overflow-hidden bg-background transition-[opacity,transform] duration-300 ease-[var(--ease-out-quart)] motion-reduce:transition-none",
        show ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
      )}
    >
      {song?.thumbnailUrl ? (
        <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
          <img
            alt=""
            className="h-full w-full scale-125 object-cover opacity-[0.08] blur-[70px] saturate-150"
            height={180}
            src={song.thumbnailUrl}
            width={320}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/85 to-background" />
        </div>
      ) : null}

      <div className="relative z-10 flex h-full flex-col">
        <header className="drag-region flex h-14 shrink-0 items-center justify-between border-border/50 border-b px-6">
          <div className="flex min-w-0 items-baseline gap-2.5 pl-16">
            <span className="min-w-0 truncate font-display font-semibold text-[17px] tracking-tight">
              {song?.title ?? "Now playing"}
            </span>
            <span className="shrink-0 text-muted text-sm">
              {song?.author ?? "Unknown artist"}
            </span>
          </div>
          <Tooltip keys={["mod", "down"]} label="Minimize">
            <Button
              aria-label="Minimize player"
              className="no-drag"
              onClick={minimizePlayer}
              size="iconSm"
              variant="ghost"
            >
              <ChevronDown className="size-5" />
            </Button>
          </Tooltip>
        </header>

        <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center gap-7 px-8 pb-10">
          <section className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
            <div className="flex gap-4 p-4">
              <div className="flex w-16 shrink-0 flex-col">
                <ChannelTag label="Drums" tone="drums" />
                <ChannelTag label="Rest" tone="rest" />
              </div>
              <div className="min-w-0 flex-1">
                <Waveform
                  drumVolume={drumVolume}
                  durationSec={durationSec}
                  onSeek={seek}
                  peaks={peaks}
                  positionSec={positionSec}
                  restVolume={restVolume}
                />
              </div>
            </div>
            <div className="flex items-center justify-between border-border/50 border-t px-4 py-2 font-mono text-muted text-xs tabular-nums">
              <span>{formatDuration(positionSec)}</span>
              <span className="text-faint">{formatDuration(durationSec)}</span>
            </div>
          </section>

          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-2">
              <Tooltip label="Restart" side="top">
                <Button
                  aria-label="Restart"
                  disabled={transportDisabled}
                  onClick={() => skipTo(0)}
                  size="icon"
                  variant="ghost"
                >
                  <SkipBack className="size-5" />
                </Button>
              </Tooltip>
              <Tooltip keys={["left"]} label="Back 10s" side="top">
                <Button
                  aria-label="Back 10 seconds"
                  disabled={transportDisabled}
                  onClick={() => skipTo(positionSec - SKIP_SECONDS)}
                  size="icon"
                  variant="ghost"
                >
                  <span className="relative flex items-center justify-center">
                    <RotateCcw className="size-6" />
                    <span className="pointer-events-none absolute translate-y-[0.5px] font-mono font-semibold text-[8px] tabular-nums leading-none">
                      10
                    </span>
                  </span>
                </Button>
              </Tooltip>
              <Button
                aria-label={playing ? "Pause" : "Play"}
                className="mx-1 size-14 rounded-full"
                disabled={loading}
                onClick={toggle}
                size="icon"
              >
                {transportIcon}
              </Button>
              <Tooltip keys={["right"]} label="Forward 10s" side="top">
                <Button
                  aria-label="Forward 10 seconds"
                  disabled={transportDisabled}
                  onClick={() => skipTo(positionSec + SKIP_SECONDS)}
                  size="icon"
                  variant="ghost"
                >
                  <span className="relative flex items-center justify-center">
                    <RotateCw className="size-6" />
                    <span className="pointer-events-none absolute translate-y-[0.5px] font-mono font-semibold text-[8px] tabular-nums leading-none">
                      10
                    </span>
                  </span>
                </Button>
              </Tooltip>
            </div>
            <span className="flex items-center gap-1.5 text-faint text-xs">
              <Kbd keys={["space"]} />
              play / pause
            </span>
          </div>

          <section className="divide-y divide-border/50 overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface/50">
            <MixerRow
              label="Drums"
              onToggleMute={() =>
                toggleMute("drums", drumVolume, setDrumVolume)
              }
              onValueChange={setDrumVolume}
              tone="drums"
              value={drumVolume}
            />
            <MixerRow
              label="Rest"
              onToggleMute={() => toggleMute("rest", restVolume, setRestVolume)}
              onValueChange={setRestVolume}
              tone="rest"
              value={restVolume}
            />
            <MixerRow
              label="Metronome"
              onToggleMute={() =>
                toggleMute("metronome", metronomeVolume, setMetronomeVolume)
              }
              onValueChange={setMetronomeVolume}
              tone="metronome"
              value={metronomeVolume}
            />
          </section>

          {status === "error" ? (
            <p className="text-center text-destructive text-sm">
              Couldn&rsquo;t load this song&rsquo;s audio.
            </p>
          ) : null}
        </main>
      </div>
    </div>
  );
}

/** Lane label on the waveform's left rail, vertically centered on its lane. */
function ChannelTag({
  label,
  tone,
}: {
  label: string;
  tone: ChannelKey;
}): React.JSX.Element {
  const style = CHANNEL_STYLE[tone];
  return (
    <div className="flex flex-1 items-center gap-1.5">
      <span className={cn("size-1.5 rounded-full", style.accent)} />
      <span
        className={cn(
          "font-medium font-mono text-[10px] uppercase tracking-[0.08em]",
          style.text
        )}
      >
        {label}
      </span>
    </div>
  );
}

/** One channel strip in the mixer: mute toggle, label, fader, and readout. */
function MixerRow({
  label,
  tone,
  value,
  onValueChange,
  onToggleMute,
}: {
  label: string;
  onToggleMute: () => void;
  onValueChange: (value: number) => void;
  tone: ChannelKey;
  value: number;
}): React.JSX.Element {
  const style = CHANNEL_STYLE[tone];
  const muted = value === 0;
  return (
    <div className="flex items-center gap-3.5 px-4 py-3">
      <Tooltip label={muted ? "Unmute" : "Mute"} side="top">
        <button
          aria-label={`${muted ? "Unmute" : "Mute"} ${label}`}
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted outline-none transition-colors hover:bg-white/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-rest/60"
          onClick={onToggleMute}
          type="button"
        >
          {muted ? (
            <VolumeX className="size-4" />
          ) : (
            <Volume2 className="size-4" />
          )}
        </button>
      </Tooltip>
      <span className="flex w-24 shrink-0 items-center gap-2">
        <span
          className={cn(
            "size-2 rounded-full transition-opacity",
            style.accent,
            muted && "opacity-30"
          )}
        />
        <span
          className={cn(
            "font-medium text-sm transition-colors",
            muted ? "text-faint" : style.text
          )}
        >
          {label}
        </span>
      </span>
      <Slider
        accentClassName={style.accent}
        aria-label={`${label} volume`}
        onValueChange={onValueChange}
        value={value}
      />
      <span className="w-11 shrink-0 text-right font-mono text-muted text-xs tabular-nums">
        {Math.round(value * 100)}%
      </span>
    </div>
  );
}
