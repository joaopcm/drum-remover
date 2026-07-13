import { AppViewProvider, useAppView } from "./app-view";
import { AddSongDialog } from "./components/add-song-dialog";
import { TooltipProvider } from "./components/ui/tooltip";
import { UpdateCard } from "./components/update-card";
import { emitSongAdded } from "./lib/events";
import { useGlobalShortcuts } from "./lib/use-global-shortcuts";
import { Library } from "./pages/library";
import { Settings } from "./pages/settings";
import { FullPlayer } from "./player/full-player";
import { MiniPlayer } from "./player/mini-player";
import { PlayerProvider } from "./player/player-provider";

function AppShell(): React.JSX.Element {
  const { view, minimized, activeSongId, addSongOpen, setAddSongOpen } =
    useAppView();
  const showFullPlayer = view === "player" && !minimized;
  useGlobalShortcuts();

  function renderMain(): React.JSX.Element {
    if (showFullPlayer) {
      return <FullPlayer />;
    }
    if (view === "settings") {
      return <Settings />;
    }
    return <Library />;
  }

  return (
    <>
      {renderMain()}
      {activeSongId === null ? null : <MiniPlayer />}
      <UpdateCard />
      <AddSongDialog
        onAdded={emitSongAdded}
        onOpenChange={setAddSongOpen}
        open={addSongOpen}
      />
    </>
  );
}

function App(): React.JSX.Element {
  return (
    <AppViewProvider>
      <PlayerProvider>
        <TooltipProvider closeDelay={0} delay={350}>
          <AppShell />
        </TooltipProvider>
      </PlayerProvider>
    </AppViewProvider>
  );
}

export default App;
