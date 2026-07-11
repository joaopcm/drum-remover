import { Button } from "@renderer/components/ui/button";
import type { AppInfo } from "@shared/types";
import { AudioWaveform, Plus } from "lucide-react";
import { useEffect, useState } from "react";

export function Library(): React.JSX.Element {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);

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
        // Diagnostics footer simply stays in its loading state on failure.
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="flex h-full flex-col">
      <header className="drag-region flex items-center justify-between border-border border-b px-6 py-4">
        <div className="flex items-center gap-2.5 pl-16">
          <AudioWaveform className="size-5 text-drum" />
          <span className="font-semibold text-base tracking-tight">
            Socrash
          </span>
        </div>
        <Button className="no-drag" disabled size="sm">
          <Plus className="size-4" />
          Add song
        </Button>
      </header>

      <main className="flex flex-1 items-center justify-center p-6">
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
        </div>
      </main>

      <footer className="border-border border-t px-6 py-2 font-mono text-[11px] text-muted">
        {appInfo
          ? `${appInfo.name} v${appInfo.version} · Electron ${appInfo.electron} · Node ${appInfo.node}`
          : "Loading…"}
      </footer>
    </div>
  );
}
