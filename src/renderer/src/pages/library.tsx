import { useAppView } from "@renderer/app-view";
import { SongRow } from "@renderer/components/song-row";
import { Button } from "@renderer/components/ui/button";
import { Kbd } from "@renderer/components/ui/kbd";
import { Tooltip } from "@renderer/components/ui/tooltip";
import { onSongAdded } from "@renderer/lib/events";
import { cn } from "@renderer/lib/utils";
import { isTypingTarget } from "@renderer/player/typing-target";
import type { AppInfo, JobProgress, Song } from "@shared/types";
import {
  AudioWaveform,
  Plus,
  Search,
  Settings as SettingsIcon,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

/** Stages that mean a job is no longer actively reporting progress. */
const TERMINAL_STATUSES = new Set<Song["status"]>(["ready", "error", "queued"]);

export function Library(): React.JSX.Element {
  const { activeSongId, minimized, openSettings, openAddSong } = useAppView();
  const miniBarPresent = minimized && activeSongId !== null;
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [progress, setProgress] = useState<Record<string, JobProgress>>({});
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    window.api
      .getAppInfo()
      .then((info) => {
        if (active) {
          setAppInfo(info);
        }
      })
      .catch(() => {
        // Footer simply stays in its loading state on failure.
      });
    window.api
      .listSongs()
      .then((list) => {
        if (active) {
          setSongs(list);
        }
      })
      .catch(() => {
        // An unreadable library surfaces as the empty state; nothing to do.
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const offSong = window.api.onSongUpdate((updated) => {
      setSongs((prev) => {
        const exists = prev.some((s) => s.id === updated.id);
        return exists
          ? prev.map((s) => (s.id === updated.id ? updated : s))
          : [updated, ...prev];
      });
      // A song that reached a resting state no longer has live progress.
      if (TERMINAL_STATUSES.has(updated.status)) {
        setProgress((prev) => {
          const { [updated.id]: _removed, ...rest } = prev;
          return rest;
        });
      }
    });
    const offProgress = window.api.onJobProgress((update) => {
      setProgress((prev) => ({ ...prev, [update.songId]: update }));
    });
    // The add-song dialog lives at the app root; hear about new songs here.
    const offAdded = onSongAdded((song) => {
      setSongs((prev) =>
        prev.some((s) => s.id === song.id) ? prev : [song, ...prev]
      );
    });
    return () => {
      offSong();
      offProgress();
      offAdded();
    };
  }, []);

  // `/` jumps focus into the search field, the way it does on most list-heavy
  // apps. Ignored while typing so it never eats a literal slash.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (
        event.key === "/" &&
        !(event.metaKey || event.ctrlKey || event.altKey) &&
        !isTypingTarget(event.target) &&
        searchRef.current
      ) {
        event.preventDefault();
        searchRef.current.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function handleRemoved(id: string) {
    setSongs((prev) => prev.filter((s) => s.id !== id));
  }

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!normalizedQuery) {
      return songs;
    }
    return songs.filter((song) => {
      const haystack = `${song.title} ${song.author ?? ""}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [songs, normalizedQuery]);

  const hasSongs = songs.length > 0;

  return (
    <div className="flex h-full flex-col">
      <header className="drag-region flex h-14 shrink-0 items-center justify-between border-border/70 border-b px-6">
        <div className="flex items-center gap-2.5 pl-16">
          <span className="flex size-7 items-center justify-center rounded-md bg-drum/12 ring-1 ring-drum/20 ring-inset">
            <AudioWaveform className="size-4 text-drum" />
          </span>
          <span className="font-display font-semibold text-[17px] tracking-tight">
            Socrash
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button className="no-drag" onClick={openAddSong} size="sm">
            <Plus className="size-4" />
            Add song
            <Kbd className="ml-0.5" keys={["mod", "n"]} />
          </Button>
          <Tooltip keys={["mod", ","]} label="Settings">
            <Button
              aria-label="Settings"
              className="no-drag"
              onClick={openSettings}
              size="iconSm"
              variant="ghost"
            >
              <SettingsIcon className="size-4" />
            </Button>
          </Tooltip>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        {hasSongs ? (
          <div
            className={cn(
              "mx-auto flex max-w-3xl flex-col p-6",
              miniBarPresent && "pb-28"
            )}
          >
            <div className="group relative mb-4">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint transition-colors group-focus-within:text-muted" />
              <input
                className="h-10 w-full rounded-[var(--radius)] border border-border bg-surface/60 pr-9 pl-9 text-sm outline-none transition-[border-color,box-shadow] duration-150 ease-[var(--ease-out-quart)] placeholder:text-faint focus-visible:border-rest focus-visible:ring-2 focus-visible:ring-rest/25"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by title or artist…"
                ref={searchRef}
                type="text"
                value={query}
              />
              {query ? (
                <button
                  aria-label="Clear search"
                  className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-faint transition-colors hover:bg-white/[0.07] hover:text-foreground"
                  onClick={() => setQuery("")}
                  type="button"
                >
                  <X className="size-3.5" />
                </button>
              ) : (
                <Kbd
                  className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-faint"
                  keys={["/"]}
                />
              )}
            </div>

            {filtered.length === 0 ? (
              <div className="flex flex-col items-center py-16 text-center">
                <div className="mb-4 flex size-12 items-center justify-center rounded-full border border-border bg-card">
                  <Search className="size-5 text-faint" />
                </div>
                <p className="font-medium text-sm">No matches</p>
                <p className="mt-1 text-muted text-sm">
                  Nothing in your library matches &ldquo;{query.trim()}&rdquo;.
                </p>
                <Button
                  className="mt-4"
                  onClick={() => setQuery("")}
                  size="sm"
                  variant="secondary"
                >
                  Clear search
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {filtered.map((song) => (
                  <SongRow
                    key={song.id}
                    onRemoved={handleRemoved}
                    progress={progress[song.id]}
                    song={song}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center p-6">
            <div className="flex max-w-md flex-col items-center text-center">
              <div className="relative mb-6 flex size-20 items-center justify-center rounded-2xl border border-border bg-card shadow-[0_20px_50px_-24px_var(--color-drum)]">
                <span className="absolute inset-0 rounded-2xl bg-drum/[0.06]" />
                <AudioWaveform className="size-8 text-drum" />
              </div>
              <h1 className="font-display font-semibold text-3xl tracking-tight">
                No songs yet
              </h1>
              <p className="mt-2.5 text-balance text-muted leading-relaxed">
                Paste a YouTube link and Socrash pulls the drums out of the
                track&nbsp;&mdash; fully offline, right on your machine.
              </p>
              <Button className="mt-7" onClick={openAddSong}>
                <Plus className="size-4" />
                Add your first song
                <Kbd className="ml-0.5" keys={["mod", "n"]} />
              </Button>
            </div>
          </div>
        )}
      </main>

      <footer className="flex shrink-0 items-center justify-between gap-4 border-border/70 border-t px-6 py-2 font-mono text-[11px] text-faint">
        <span className="selectable truncate">
          {appInfo
            ? `${appInfo.name} v${appInfo.version} · Electron ${appInfo.electron} · Node ${appInfo.node}`
            : "Loading…"}
        </span>
        {hasSongs ? (
          <span className="shrink-0 tabular-nums">
            {filtered.length}
            {normalizedQuery ? ` of ${songs.length}` : ""}{" "}
            {songs.length === 1 && !normalizedQuery ? "song" : "songs"}
          </span>
        ) : null}
      </footer>
    </div>
  );
}
