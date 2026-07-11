import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

/** Top-level views. Issues #6 (mini-player) and #7 (settings) extend this. */
export type AppView = "library" | "player";

interface AppViewState {
  activeSongId: string | null;
  closePlayer: () => void;
  openPlayer: (songId: string) => void;
  view: AppView;
}

const AppViewContext = createContext<AppViewState | null>(null);

/**
 * Minimal, router-free navigation. Audio lives above this in `PlayerProvider`,
 * so switching views never interrupts playback — closing the player just
 * returns to the library while the song keeps playing.
 */
export function AppViewProvider({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const [view, setView] = useState<AppView>("library");
  const [activeSongId, setActiveSongId] = useState<string | null>(null);

  const openPlayer = useCallback((songId: string) => {
    setActiveSongId(songId);
    setView("player");
  }, []);

  const closePlayer = useCallback(() => {
    setView("library");
  }, []);

  const value = useMemo<AppViewState>(
    () => ({ activeSongId, closePlayer, openPlayer, view }),
    [activeSongId, closePlayer, openPlayer, view]
  );

  return (
    <AppViewContext.Provider value={value}>{children}</AppViewContext.Provider>
  );
}

export function useAppView(): AppViewState {
  const context = useContext(AppViewContext);
  if (context === null) {
    throw new Error("useAppView must be used within an AppViewProvider");
  }
  return context;
}
