import { AppViewProvider, useAppView } from "./app-view";
import { Library } from "./pages/library";
import { FullPlayer } from "./player/full-player";
import { MiniPlayer } from "./player/mini-player";
import { PlayerProvider } from "./player/player-provider";

function AppShell(): React.JSX.Element {
  const { view, minimized, activeSongId } = useAppView();
  const showFullPlayer = view === "player" && !minimized;
  return (
    <>
      {showFullPlayer ? <FullPlayer /> : <Library />}
      {activeSongId === null ? null : <MiniPlayer />}
    </>
  );
}

function App(): React.JSX.Element {
  return (
    <AppViewProvider>
      <PlayerProvider>
        <AppShell />
      </PlayerProvider>
    </AppViewProvider>
  );
}

export default App;
