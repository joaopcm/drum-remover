import { useAppView } from "@renderer/app-view";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogPopup,
  AlertDialogTitle,
} from "@renderer/components/ui/alert-dialog";
import { Badge } from "@renderer/components/ui/badge";
import { Button } from "@renderer/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@renderer/components/ui/dropdown-menu";
import { Tooltip } from "@renderer/components/ui/tooltip";
import { formatDuration } from "@renderer/lib/format";
import { stageLabel, statusMeta } from "@renderer/lib/song-status";
import { cn } from "@renderer/lib/utils";
import type { JobProgress, Song } from "@shared/types";
import {
  Loader2,
  MoreVertical,
  Music,
  Play,
  RotateCw,
  Trash2,
} from "lucide-react";
import { useState } from "react";

interface SongRowProps {
  onRemoved: (id: string) => void;
  progress?: JobProgress;
  song: Song;
}

export function SongRow({ song, onRemoved, progress }: SongRowProps) {
  const { openPlayer } = useAppView();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const status = statusMeta(song.status);
  const processing =
    song.status === "downloading" || song.status === "separating";
  const ready = song.status === "ready";
  const badgeLabel =
    processing && progress
      ? `${stageLabel(progress.stage)} ${Math.round(progress.pct)}%`
      : status.label;

  function handleDelete() {
    setDeleting(true);
    window.api
      .removeSong(song.id)
      .then(() => onRemoved(song.id))
      .finally(() => {
        setDeleting(false);
        setConfirmOpen(false);
      });
  }

  function handleRetry() {
    window.api.retrySong(song.id).catch(() => {
      // Main pushes a `song:update` on success; on failure the row is
      // unchanged and the user can retry again.
    });
  }

  return (
    <div
      className={cn(
        "group relative flex items-center gap-3.5 overflow-hidden rounded-[var(--radius)] border border-border bg-card/50 px-3 py-2.5 transition-[background-color,border-color] duration-200 ease-[var(--ease-out-quart)] hover:border-border-strong hover:bg-elevated/70"
      )}
    >
      {ready ? (
        <button
          aria-label={`Play ${song.title}`}
          className="relative aspect-video w-[76px] shrink-0 overflow-hidden rounded-md border border-border bg-background outline-none focus-visible:ring-2 focus-visible:ring-rest/70"
          onClick={() => openPlayer(song.id)}
          type="button"
        >
          <Thumbnail song={song} />
          <span className="absolute inset-0 flex items-center justify-center bg-background/55 opacity-0 backdrop-blur-[1px] transition-opacity duration-150 group-hover:opacity-100">
            <span className="flex size-7 items-center justify-center rounded-full bg-drum text-background shadow-lg">
              <Play className="size-3.5 translate-x-px" />
            </span>
          </span>
        </button>
      ) : (
        <div className="relative aspect-video w-[76px] shrink-0 overflow-hidden rounded-md border border-border bg-background">
          <Thumbnail song={song} />
          {processing ? (
            <div className="absolute inset-0 animate-pulse bg-background/40" />
          ) : null}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-sm">{song.title}</p>
        <p
          className={cn(
            "truncate text-xs",
            song.status === "error" ? "text-destructive/80" : "text-muted"
          )}
        >
          {song.status === "error" && song.error
            ? song.error
            : (song.author ?? "Unknown artist")}
        </p>
      </div>

      {song.durationSec === null ? null : (
        <span className="font-mono text-faint text-xs tabular-nums">
          {formatDuration(song.durationSec)}
        </span>
      )}

      <Badge dot pulse={processing} tone={status.tone}>
        {badgeLabel}
      </Badge>

      <div className="flex items-center">
        {ready ? (
          <Tooltip label="Open player">
            <Button
              aria-label="Open player"
              className="hover:bg-drum/15 hover:text-drum"
              onClick={() => openPlayer(song.id)}
              size="iconSm"
              variant="ghost"
            >
              <Play className="size-4" />
            </Button>
          </Tooltip>
        ) : null}

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                aria-label="Song actions"
                className="opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100 data-[popup-open]:opacity-100"
                size="iconSm"
                variant="ghost"
              >
                <MoreVertical className="size-4" />
              </Button>
            }
          />
          <DropdownMenuContent>
            {song.status === "error" ? (
              <DropdownMenuItem onClick={handleRetry}>
                <RotateCw className="size-4" />
                Retry
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem
              className="text-destructive hover:bg-destructive/10 hover:text-destructive data-[highlighted]:bg-destructive/10 data-[highlighted]:text-destructive"
              onClick={() => setConfirmOpen(true)}
            >
              <Trash2 className="size-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {processing ? (
        <div className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-border/50">
          {progress ? (
            <div
              className="h-full bg-drum transition-[width] duration-300 ease-out"
              style={{ width: `${Math.round(progress.pct)}%` }}
            />
          ) : (
            <div className="h-full w-1/3 animate-pulse bg-drum" />
          )}
        </div>
      ) : null}

      <AlertDialog onOpenChange={setConfirmOpen} open={confirmOpen}>
        <AlertDialogPopup>
          <AlertDialogTitle>Delete this song?</AlertDialogTitle>
          <AlertDialogDescription>
            &ldquo;{song.title}&rdquo; and its downloaded files will be removed.
            This can&rsquo;t be undone.
          </AlertDialogDescription>
          <div className="mt-5 flex justify-end gap-2">
            <AlertDialogClose
              render={
                <Button size="sm" variant="secondary">
                  Cancel
                </Button>
              }
            />
            <Button
              disabled={deleting}
              onClick={handleDelete}
              size="sm"
              variant="destructive"
            >
              {deleting ? <Loader2 className="size-4 animate-spin" /> : null}
              Delete
            </Button>
          </div>
        </AlertDialogPopup>
      </AlertDialog>
    </div>
  );
}

function Thumbnail({ song }: { song: Song }): React.JSX.Element {
  if (song.thumbnailUrl) {
    return (
      <img
        alt=""
        className="h-full w-full object-cover"
        height={180}
        src={song.thumbnailUrl}
        width={320}
      />
    );
  }
  return (
    <div className="flex h-full items-center justify-center text-faint">
      <Music className="size-4" />
    </div>
  );
}
