import { useAppView } from "@renderer/app-view";
import { AddSongDialog } from "@renderer/components/add-song-dialog";
import { SongRow } from "@renderer/components/song-row";
import { Button } from "@renderer/components/ui/button";
import { cn } from "@renderer/lib/utils";
import type { AppInfo, Song } from "@shared/types";
import { AudioWaveform, Plus } from "lucide-react";
import { useEffect, useState } from "react";

export function Library(): React.JSX.Element {
  const { activeSongId, minimized } = useAppView();
  const miniBarPresent = minimized && activeSongId !== null;
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [addOpen, setAddOpen] = useState(false);

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

  function handleAdded(song: Song) {
    setSongs((prev) => [song, ...prev]);
  }

  function handleRemoved(id: string) {
    setSongs((prev) => prev.filter((s) => s.id !== id));
  }

  return (
    <div className="flex h-full flex-col">
      <header className="drag-region flex items-center justify-between border-border border-b px-6 py-4">
        <div className="flex items-center gap-2.5 pl-16">
          <AudioWaveform className="size-5 text-drum" />
          <span className="font-semibold text-base tracking-tight">
            Socrash
          </span>
        </div>
        <Button className="no-drag" onClick={() => setAddOpen(true)} size="sm">
          <Plus className="size-4" />
          Add song
        </Button>
      </header>

      <main className="flex-1 overflow-y-auto">
        {songs.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6">
            <div className="flex max-w-md flex-col items-center text-center">
              <div className="mb-5 flex size-16 items-center justify-center rounded-full border border-border bg-card">
                <AudioWaveform className="size-7 text-drum" />
              </div>
              <h1 className="font-semibold text-2xl tracking-tight">
                No songs yet
              </h1>
              <p className="mt-2 text-muted leading-relaxed">
                Paste a YouTube link and Socrash pulls the drums out of the
                track&nbsp;&mdash; fully offline, right on your machine.
              </p>
              <Button className="mt-6" onClick={() => setAddOpen(true)}>
                <Plus className="size-4" />
                Add your first song
              </Button>
            </div>
          </div>
        ) : (
          <div
            className={cn(
              "mx-auto flex max-w-3xl flex-col gap-2 p-6",
              miniBarPresent && "pb-28"
            )}
          >
            {songs.map((song) => (
              <SongRow key={song.id} onRemoved={handleRemoved} song={song} />
            ))}
          </div>
        )}
      </main>

      <footer className="border-border border-t px-6 py-2 font-mono text-[11px] text-muted">
        {appInfo
          ? `${appInfo.name} v${appInfo.version} · Electron ${appInfo.electron} · Node ${appInfo.node}`
          : "Loading…"}
      </footer>

      <AddSongDialog
        onAdded={handleAdded}
        onOpenChange={setAddOpen}
        open={addOpen}
      />
    </div>
  );
}
