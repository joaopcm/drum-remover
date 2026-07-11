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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@renderer/components/ui/card";
import { Skeleton } from "@renderer/components/ui/skeleton";
import { formatBytes } from "@renderer/lib/format";
import type {
  MigrationProgress,
  Settings as SettingsType,
} from "@shared/types";
import { ArrowLeft, FolderOpen, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

interface SettingsProps {
  onBack: () => void;
}

const QUALITY_LABEL: Record<SettingsType["modelQuality"], string> = {
  balanced: "Balanced",
  best: "Best",
  fast: "Fast",
};

export function Settings({ onBack }: SettingsProps): React.JSX.Element {
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [migrating, setMigrating] = useState(false);
  const [progress, setProgress] = useState<MigrationProgress | null>(null);
  const [pendingDest, setPendingDest] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    window.api
      .getSettings()
      .then((loaded) => {
        if (active) {
          setSettings(loaded);
        }
      })
      .catch(() => {
        // Leave the page in its loading state if settings can't be read.
      });
    window.api
      .isMigrating()
      .then((running) => {
        if (active) {
          setMigrating(running);
        }
      })
      .catch(() => {
        // Assume idle if the flag can't be read.
      });
    const unsubscribe = window.api.onMigrationProgress((update) => {
      setProgress(update);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  function startMove(dest: string) {
    setConfirmOpen(false);
    setPendingDest(null);
    setError(null);
    setMigrating(true);
    setProgress({ bytesCopied: 0, totalBytes: 0 });
    window.api
      .moveDataDir(dest)
      .then((updated) => {
        setSettings(updated);
      })
      .catch((err: unknown) => {
        setError(
          err instanceof Error ? err.message : "Couldn't move your library."
        );
      })
      .finally(() => {
        setMigrating(false);
        setProgress(null);
      });
  }

  async function chooseAndValidate(): Promise<void> {
    setError(null);
    const dest = await window.api.chooseDataDir();
    if (dest === null) {
      return;
    }
    const result = await window.api.validateDataDir(dest);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    if (result.nonEmpty) {
      setPendingDest(dest);
      setConfirmOpen(true);
      return;
    }
    startMove(dest);
  }

  function handleChangeClick() {
    chooseAndValidate().catch(() => {
      setError("Couldn't open that folder.");
    });
  }

  const pct =
    progress && progress.totalBytes > 0
      ? Math.round((progress.bytesCopied / progress.totalBytes) * 100)
      : 0;

  return (
    <div className="flex h-full flex-col">
      <header className="drag-region flex items-center gap-3 border-border border-b px-6 py-4">
        <Button
          aria-label="Back to library"
          className="no-drag ml-16"
          onClick={onBack}
          size="icon"
          variant="ghost"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <span className="font-semibold text-base tracking-tight">Settings</span>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
          <Card>
            <CardHeader>
              <CardTitle>Data folder</CardTitle>
              <CardDescription>
                Where Socrash keeps your songs, separated stems, downloaded
                models, and tools. Everything moves together.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {settings ? (
                <div className="flex items-center gap-3">
                  <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-background px-3 py-2 font-mono text-muted text-xs">
                    {settings.dataDir}
                  </code>
                  <Button
                    disabled={migrating}
                    onClick={handleChangeClick}
                    size="sm"
                    variant="secondary"
                  >
                    <FolderOpen className="size-4" />
                    Change…
                  </Button>
                </div>
              ) : (
                <Skeleton className="h-10 w-full" />
              )}

              {migrating ? (
                <div className="flex flex-col gap-2">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-border">
                    <div
                      className="h-full rounded-full bg-drum transition-[width] duration-200"
                      style={{ width: `${progress ? pct : 0}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between font-mono text-muted text-xs">
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="size-3.5 animate-spin" />
                      Moving your library…
                    </span>
                    {progress && progress.totalBytes > 0 ? (
                      <span>
                        {formatBytes(progress.bytesCopied)} /{" "}
                        {formatBytes(progress.totalBytes)}
                      </span>
                    ) : (
                      <span>Preparing…</span>
                    )}
                  </div>
                  <p className="text-muted text-xs">
                    Adding songs and processing are paused until the move
                    finishes. Your files stay safe if you quit mid-move.
                  </p>
                </div>
              ) : null}

              {error === null ? null : (
                <p className="text-destructive text-sm">{error}</p>
              )}
            </CardContent>
          </Card>

          {settings ? (
            <Card>
              <CardHeader>
                <CardTitle>Separation quality</CardTitle>
                <CardDescription>
                  The model used to pull drums out of a track.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Badge tone="drum">
                  {QUALITY_LABEL[settings.modelQuality]}
                </Badge>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </main>

      <AlertDialog onOpenChange={setConfirmOpen} open={confirmOpen}>
        <AlertDialogPopup>
          <AlertDialogTitle>
            Use a folder that isn&rsquo;t empty?
          </AlertDialogTitle>
          <AlertDialogDescription>
            The folder you picked already has files in it. Socrash will copy
            your library alongside them. Continue?
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
              onClick={() => {
                if (pendingDest !== null) {
                  startMove(pendingDest);
                }
              }}
              size="sm"
            >
              Move here
            </Button>
          </div>
        </AlertDialogPopup>
      </AlertDialog>
    </div>
  );
}
