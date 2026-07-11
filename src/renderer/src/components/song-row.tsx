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
import { formatDuration } from "@renderer/lib/format";
import { statusMeta } from "@renderer/lib/song-status";
import type { Song } from "@shared/types";
import { Loader2, MoreVertical, Music, Trash2 } from "lucide-react";
import { useState } from "react";

interface SongRowProps {
  onRemoved: (id: string) => void;
  song: Song;
}

export function SongRow({ song, onRemoved }: SongRowProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const status = statusMeta(song.status);
  const processing =
    song.status === "downloading" || song.status === "separating";

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

  return (
    <div className="flex items-center gap-4 rounded-[var(--radius)] border border-border bg-card px-4 py-3 transition-colors hover:border-border/80">
      <div className="relative aspect-video w-20 shrink-0 overflow-hidden rounded-md border border-border bg-background">
        {song.thumbnailUrl ? (
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
        {processing ? (
          <div className="absolute inset-0 animate-pulse bg-background/40" />
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-sm">{song.title}</p>
        <p className="truncate text-muted text-xs">
          {song.author ?? "Unknown artist"}
        </p>
      </div>

      {song.durationSec === null ? null : (
        <span className="font-mono text-muted text-xs tabular-nums">
          {formatDuration(song.durationSec)}
        </span>
      )}

      <Badge tone={status.tone}>{status.label}</Badge>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button aria-label="Song actions" size="icon" variant="ghost">
              <MoreVertical className="size-4" />
            </Button>
          }
        />
        <DropdownMenuContent>
          <DropdownMenuItem
            className="text-destructive"
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 className="size-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

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
