import { useAppView } from "@renderer/app-view";
import { useEffect } from "react";

/**
 * App-wide keyboard shortcuts. Player transport (Space) stays inside the
 * player components; this covers navigation and layout:
 *
 *   ⌘N        add a song
 *   ⌘,        open settings
 *   ⌘↓        minimize the full player into the mini bar
 *   ⌘↑        expand the mini bar back to the full player
 *   Esc       back out of settings / collapse the full player
 *
 * Modal-scoped keys (⌘⏎ to submit, Esc to close) live with their dialogs so
 * Base UI keeps ownership of focus + dismissal.
 */
export function useGlobalShortcuts(): void {
  const {
    activeSongId,
    addSongOpen,
    closeSettings,
    minimized,
    minimizePlayer,
    openAddSong,
    openSettings,
    restorePlayer,
    view,
  } = useAppView();

  useEffect(() => {
    function runPlayerLayout(key: string): boolean {
      if (activeSongId === null) {
        return false;
      }
      if (key === "ArrowDown" && view === "player" && !minimized) {
        minimizePlayer();
        return true;
      }
      if (key === "ArrowUp" && (minimized || view !== "player")) {
        restorePlayer();
        return true;
      }
      return false;
    }

    function runMod(key: string): boolean {
      if (key === ",") {
        if (view !== "settings") {
          openSettings();
        }
        return true;
      }
      if (key === "n" || key === "N") {
        openAddSong();
        return true;
      }
      return runPlayerLayout(key);
    }

    // Let Base UI own Escape while a dialog is open.
    function runEscape(): boolean {
      if (addSongOpen) {
        return false;
      }
      if (view === "settings") {
        closeSettings();
        return true;
      }
      if (view === "player" && !minimized) {
        minimizePlayer();
        return true;
      }
      return false;
    }

    function onKeyDown(event: KeyboardEvent): void {
      const mod = event.metaKey || event.ctrlKey;
      let handled = false;
      if (mod) {
        handled = runMod(event.key);
      } else if (event.key === "Escape") {
        handled = runEscape();
      }
      if (handled) {
        event.preventDefault();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    activeSongId,
    addSongOpen,
    closeSettings,
    minimized,
    minimizePlayer,
    openAddSong,
    openSettings,
    restorePlayer,
    view,
  ]);
}
