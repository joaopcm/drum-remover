import { useAppView } from "@renderer/app-view";
import { Button } from "@renderer/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@renderer/components/ui/card";
import { cn } from "@renderer/lib/utils";
import type { UpdateInfo } from "@shared/types";
import { Download, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

type UpdatePhase = "available" | "downloading" | "installing";

const LEADING_V = /^v/;

/**
 * Bottom-left card that offers an in-app update once a newer GitHub release
 * is found (checked once on launch, then periodically in the background —
 * see `src/main/index.ts`). Downloading and installing happen entirely in
 * the main process; once the swap finishes it relaunches the app itself, so
 * this component never needs to handle a "done" state.
 */
export function UpdateCard(): React.JSX.Element | null {
  const { activeSongId, minimized } = useAppView();
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [phase, setPhase] = useState<UpdatePhase>("available");
  const [pct, setPct] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    window.api
      .checkForUpdate()
      .then((info) => {
        if (active && info) {
          setUpdate(info);
        }
      })
      .catch(() => {
        // Best-effort; the periodic background check will retry.
      });
    const unsubscribeAvailable = window.api.onUpdateAvailable((info) => {
      setUpdate(info);
    });
    const unsubscribeProgress = window.api.onUpdateDownloadProgress(
      (progress) => {
        setPct(progress.pct);
        if (progress.pct >= 100) {
          setPhase("installing");
        }
      }
    );
    return () => {
      active = false;
      unsubscribeAvailable();
      unsubscribeProgress();
    };
  }, []);

  function startUpdate() {
    if (!update) {
      return;
    }
    setError(null);
    setPct(0);
    setPhase("downloading");
    window.api.startUpdate(update).catch((err: unknown) => {
      // A successful install quits the app before this ever resolves, so
      // landing here always means the download/install failed.
      setError(
        err instanceof Error ? err.message : "Couldn't install the update."
      );
      setPhase("available");
    });
  }

  function cancel() {
    window.api.cancelUpdate().catch(() => {
      // Best-effort; the in-flight download rejects and resets state.
    });
  }

  if (!update || dismissed) {
    return null;
  }

  // The mini-player docks a bar across the bottom of the window; lift the
  // card above it so they don't overlap.
  const miniPlayerVisible = activeSongId !== null && minimized;

  return (
    <Card
      className={cn(
        "fixed left-4 z-40 w-80 shadow-lg",
        miniPlayerVisible ? "bottom-20" : "bottom-4"
      )}
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Download className="size-4 text-drum" />
          Update available
        </CardTitle>
        <CardDescription>
          Socrash {update.tag.replace(LEADING_V, "")} is ready to install.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {phase === "available" ? (
          <div className="flex justify-end gap-2">
            <Button
              onClick={() => setDismissed(true)}
              size="sm"
              variant="ghost"
            >
              Later
            </Button>
            <Button onClick={startUpdate} size="sm">
              Update &amp; Restart
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="h-2 w-full overflow-hidden rounded-full bg-border">
              <div
                className="h-full rounded-full bg-drum transition-[width] duration-200"
                style={{ width: `${phase === "installing" ? 100 : pct}%` }}
              />
            </div>
            <div className="flex items-center justify-between font-mono text-muted text-xs">
              <span className="flex items-center gap-1.5">
                <Loader2 className="size-3.5 animate-spin" />
                {phase === "installing"
                  ? "Restarting Socrash…"
                  : `Downloading… ${Math.round(pct)}%`}
              </span>
              {phase === "downloading" ? (
                <Button
                  className="h-auto p-0 text-rest text-xs hover:bg-transparent hover:underline"
                  onClick={cancel}
                  size="sm"
                  variant="ghost"
                >
                  Cancel
                </Button>
              ) : null}
            </div>
          </div>
        )}

        {error === null ? null : (
          <p className="text-destructive text-sm">{error}</p>
        )}
      </CardContent>
    </Card>
  );
}
