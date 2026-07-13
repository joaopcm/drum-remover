import { useAppView } from "@renderer/app-view";
import { Button } from "@renderer/components/ui/button";
import { Tooltip } from "@renderer/components/ui/tooltip";
import { cn } from "@renderer/lib/utils";
import type { Song } from "@shared/types";
import { ChevronUp, Loader2, Music, Pause, Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePlayer } from "./player-provider";
import { offsetToTime, timeToFraction } from "./time";
import { isTypingTarget } from "./typing-target";

/**
 * Persistent, Spotify-style bar docked to the bottom of the window. Rendered
 * whenever a song is loaded and driven entirely by the shared `PlayerProvider`
 * — there is no second audio engine. It slides/scales in when `minimized` and
 * out again on restore; the full player covers it while not minimized.
 */
export function MiniPlayer(): React.JSX.Element {
  const { activeSongId, minimized, restorePlayer } = useAppView();
  const { status, playing, positionSec, durationSec, toggle, seek } =
    usePlayer();

  const [song, setSong] = useState<Song | null>(null);
  const trackRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (activeSongId === null) {
      setSong(null);
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
        // Metadata just stays blank if the library can't be read.
      });
    return () => {
      active = false;
    };
  }, [activeSongId]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (
        !minimized ||
        event.code !== "Space" ||
        event.metaKey ||
        event.ctrlKey ||
        isTypingTarget(event.target)
      ) {
        return;
      }
      event.preventDefault();
      toggle();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [minimized, toggle]);

  const handleSeek = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      seek(offsetToTime(event.clientX - rect.left, rect.width, durationSec));
    },
    [durationSec, seek]
  );

  const loading = status === "loading";
  const progress = timeToFraction(positionSec, durationSec) * 100;

  let transportIcon: React.JSX.Element;
  if (loading) {
    transportIcon = <Loader2 className="size-5 animate-spin" />;
  } else if (playing) {
    transportIcon = <Pause className="size-5" />;
  } else {
    transportIcon = <Play className="size-5 translate-x-px" />;
  }

  return (
    <div
      aria-hidden={minimized ? undefined : true}
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 border-border border-t bg-card/95 backdrop-blur-sm transition-[opacity,transform] ease-out motion-reduce:transition-none",
        minimized
          ? "translate-y-0 scale-100 opacity-100 duration-300"
          : "pointer-events-none translate-y-full scale-95 opacity-0 duration-200"
      )}
    >
      <button
        aria-label="Seek"
        className="group relative flex h-1.5 w-full cursor-pointer items-center bg-border"
        onClick={handleSeek}
        ref={trackRef}
        type="button"
      >
        <span
          className="absolute inset-y-0 left-0 origin-left bg-drum transition-colors group-hover:bg-drum/90"
          style={{ width: `${progress}%` }}
        />
      </button>

      <div className="flex items-center gap-3 px-4 py-3">
        <div className="relative aspect-video w-14 shrink-0 overflow-hidden rounded-md border border-border bg-background">
          {song?.thumbnailUrl ? (
            <img
              alt=""
              className="h-full w-full object-cover"
              height={180}
              src={song.thumbnailUrl}
              width={320}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted">
              <Music className="size-4" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-sm">
            {song?.title ?? "Now playing"}
          </p>
          <p className="truncate text-muted text-xs">
            {song?.author ?? "Unknown artist"}
          </p>
        </div>

        <Tooltip keys={["space"]} label={playing ? "Pause" : "Play"} side="top">
          <Button
            aria-label={playing ? "Pause" : "Play"}
            className="size-10 rounded-full"
            disabled={loading}
            onClick={toggle}
            size="icon"
          >
            {transportIcon}
          </Button>
        </Tooltip>

        <Tooltip keys={["mod", "up"]} label="Expand" side="top">
          <Button
            aria-label="Expand player"
            onClick={restorePlayer}
            size="icon"
            variant="ghost"
          >
            <ChevronUp className="size-5" />
          </Button>
        </Tooltip>
      </div>
    </div>
  );
}
