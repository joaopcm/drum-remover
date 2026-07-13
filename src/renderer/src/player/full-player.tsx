import { useAppView } from "@renderer/app-view";
import { Button } from "@renderer/components/ui/button";
import { Kbd } from "@renderer/components/ui/kbd";
import { Slider } from "@renderer/components/ui/slider";
import { Tooltip } from "@renderer/components/ui/tooltip";
import { formatDuration } from "@renderer/lib/format";
import { cn } from "@renderer/lib/utils";
import type { Song } from "@shared/types";
import { ChevronDown, Loader2, Pause, Play } from "lucide-react";
import { useEffect, useState } from "react";
import { usePlayer } from "./player-provider";
import { isTypingTarget } from "./typing-target";
import { Waveform } from "./waveform";

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

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.code === "Space" &&
        !isTypingTarget(event.target) &&
        !(event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault();
        toggle();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggle]);

  const loading = status === "loading";

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
        "fixed inset-0 z-40 flex flex-col bg-background transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none",
        show ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
      )}
    >
      <header className="drag-region flex h-14 shrink-0 items-center justify-between border-border/60 border-b px-6">
        <div className="min-w-0 pl-16">
          <p className="truncate font-medium text-sm">
            {song?.title ?? "Now playing"}
          </p>
          <p className="truncate text-muted text-xs">
            {song?.author ?? "Unknown artist"}
          </p>
        </div>
        <Tooltip keys={["mod", "down"]} label="Minimize">
          <Button
            aria-label="Minimize player"
            className="no-drag"
            onClick={minimizePlayer}
            size="icon"
            variant="ghost"
          >
            <ChevronDown className="size-5" />
          </Button>
        </Tooltip>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center gap-8 px-8 pb-10">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between font-medium text-xs">
            <span className="text-drum">Drums</span>
            <span className="text-rest">Rest</span>
          </div>
          <Waveform
            drumVolume={drumVolume}
            durationSec={durationSec}
            onSeek={seek}
            peaks={peaks}
            positionSec={positionSec}
            restVolume={restVolume}
          />
          <div className="flex items-center justify-between font-mono text-muted text-xs tabular-nums">
            <span>{formatDuration(positionSec)}</span>
            <span>{formatDuration(durationSec)}</span>
          </div>
        </div>

        <div className="flex flex-col items-center gap-3">
          <Button
            aria-label={playing ? "Pause" : "Play"}
            className="size-14 rounded-full"
            disabled={loading}
            onClick={toggle}
            size="icon"
          >
            {transportIcon}
          </Button>
          <span className="flex items-center gap-1.5 text-faint text-xs">
            <Kbd keys={["space"]} />
            play / pause
          </span>
        </div>

        <div className="grid gap-5">
          <div className="flex items-center gap-4">
            <span className="w-20 font-medium text-drum text-sm">Drums</span>
            <Slider
              accentClassName="bg-drum"
              aria-label="Drums volume"
              onValueChange={setDrumVolume}
              value={drumVolume}
            />
            <span className="w-11 text-right font-mono text-muted text-xs tabular-nums">
              {Math.round(drumVolume * 100)}%
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="w-20 font-medium text-rest text-sm">Rest</span>
            <Slider
              accentClassName="bg-rest"
              aria-label="Rest volume"
              onValueChange={setRestVolume}
              value={restVolume}
            />
            <span className="w-11 text-right font-mono text-muted text-xs tabular-nums">
              {Math.round(restVolume * 100)}%
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="w-20 font-medium text-metronome text-sm">
              Metronome
            </span>
            <Slider
              accentClassName="bg-metronome"
              aria-label="Metronome volume"
              onValueChange={setMetronomeVolume}
              value={metronomeVolume}
            />
            <span className="w-11 text-right font-mono text-muted text-xs tabular-nums">
              {Math.round(metronomeVolume * 100)}%
            </span>
          </div>
        </div>

        {status === "error" ? (
          <p className="text-center text-destructive text-sm">
            Couldn&rsquo;t load this song&rsquo;s audio.
          </p>
        ) : null}
      </main>
    </div>
  );
}
