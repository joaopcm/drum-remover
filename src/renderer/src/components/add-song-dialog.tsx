import { Button } from "@renderer/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogPopup,
  DialogTitle,
} from "@renderer/components/ui/dialog";
import { Input } from "@renderer/components/ui/input";
import { Kbd } from "@renderer/components/ui/kbd";
import { Skeleton } from "@renderer/components/ui/skeleton";
import type { Song, YouTubeMeta } from "@shared/types";
import { Check, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

const RESOLVE_DEBOUNCE_MS = 450;

interface AddSongDialogProps {
  onAdded: (song: Song) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function AddSongDialog({
  open,
  onOpenChange,
  onAdded,
}: AddSongDialogProps) {
  const [url, setUrl] = useState("");
  const [meta, setMeta] = useState<YouTubeMeta | null>(null);
  const [resolving, setResolving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset everything whenever the dialog closes.
  useEffect(() => {
    if (!open) {
      setUrl("");
      setMeta(null);
      setResolving(false);
      setSubmitting(false);
      setError(null);
    }
  }, [open]);

  // Debounced metadata resolution as the user types/pastes.
  useEffect(() => {
    const trimmed = url.trim();
    setError(null);
    if (!trimmed) {
      setMeta(null);
      setResolving(false);
      return;
    }

    let active = true;
    setResolving(true);
    const handle = setTimeout(async () => {
      try {
        const resolved = await window.api.resolveYouTubeMeta(trimmed);
        if (active) {
          setMeta(resolved);
        }
      } catch (err) {
        if (active) {
          setMeta(null);
          setError(
            err instanceof Error ? err.message : "Couldn't load that link."
          );
        }
      } finally {
        if (active) {
          setResolving(false);
        }
      }
    }, RESOLVE_DEBOUNCE_MS);

    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [url]);

  function handleSubmit() {
    if (!meta || submitting) {
      return;
    }
    setSubmitting(true);
    setError(null);
    window.api
      .addSong(url.trim())
      .then((song) => {
        onAdded(song);
        onOpenChange(false);
      })
      .catch((err: unknown) => {
        setError(
          err instanceof Error ? err.message : "Couldn't add that song."
        );
      })
      .finally(() => {
        setSubmitting(false);
      });
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogPopup>
        <DialogTitle>Add a song</DialogTitle>
        <DialogDescription>
          Paste a YouTube link. Socrash downloads the audio and pulls out the
          drums.
        </DialogDescription>

        <div className="mt-5">
          <Input
            autoFocus
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder="https://www.youtube.com/watch?v=..."
            value={url}
          />

          <div className="mt-4 min-h-20">
            {resolving ? (
              <div className="flex items-center gap-3">
                <Skeleton className="aspect-video w-28 shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ) : null}

            {!resolving && meta ? (
              <div className="flex items-center gap-3">
                <img
                  alt=""
                  className="aspect-video w-28 shrink-0 rounded-md border border-border object-cover"
                  height={180}
                  src={meta.thumbnailUrl}
                  width={320}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-sm">{meta.title}</p>
                  {meta.author ? (
                    <p className="truncate text-muted text-xs">{meta.author}</p>
                  ) : null}
                  <span className="mt-1.5 inline-flex items-center gap-1 text-drum text-xs">
                    <Check className="size-3.5" />
                    Ready to add
                  </span>
                </div>
              </div>
            ) : null}

            {!resolving && error ? (
              <p className="text-destructive text-sm">{error}</p>
            ) : null}
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <DialogClose
            render={
              <Button size="sm" variant="secondary">
                Cancel
              </Button>
            }
          />
          <Button
            disabled={!meta || resolving || submitting}
            onClick={handleSubmit}
            size="sm"
          >
            {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
            Add song
            <Kbd className="ml-0.5" keys={["mod", "enter"]} />
          </Button>
        </div>
      </DialogPopup>
    </Dialog>
  );
}
