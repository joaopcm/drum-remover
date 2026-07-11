import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

/** Top-level views. Issue #7 (settings) extends this further. */
export type AppView = "library" | "player";

interface AppViewState {
  activeSongId: string | null;
  closePlayer: () => void;
  minimized: boolean;
  minimizePlayer: () => void;
  openPlayer: (songId: string) => void;
  restorePlayer: () => void;
  view: AppView;
}

const AppViewContext = createContext<AppViewState | null>(null);

/**
 * Minimal, router-free navigation. Audio lives above this in `PlayerProvider`,
 * so switching views never interrupts playback. A loaded song can be either
 * full-screen (`view === "player"` and not `minimized`) or docked into the
 * Spotify-style mini-bar (`minimized`), in which case the library shows behind
 * it — either way the same audio engine keeps playing.
 */
export function AppViewProvider({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const [view, setView] = useState<AppView>("library");
  const [activeSongId, setActiveSongId] = useState<string | null>(null);
  const [minimized, setMinimized] = useState(false);

  const openPlayer = useCallback((songId: string) => {
    setActiveSongId(songId);
    setMinimized(false);
    setView("player");
  }, []);

  const closePlayer = useCallback(() => {
    setMinimized(false);
    setActiveSongId(null);
    setView("library");
  }, []);

  const minimizePlayer = useCallback(() => {
    setMinimized(true);
  }, []);

  const restorePlayer = useCallback(() => {
    setMinimized(false);
    setView("player");
  }, []);

  const value = useMemo<AppViewState>(
    () => ({
      activeSongId,
      closePlayer,
      minimized,
      minimizePlayer,
      openPlayer,
      restorePlayer,
      view,
    }),
    [
      activeSongId,
      closePlayer,
      minimized,
      minimizePlayer,
      openPlayer,
      restorePlayer,
      view,
    ]
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
