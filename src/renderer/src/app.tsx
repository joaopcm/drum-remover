import { AppViewProvider, useAppView } from "./app-view";
import { UpdateCard } from "./components/update-card";
import { Library } from "./pages/library";
import { Settings } from "./pages/settings";
import { FullPlayer } from "./player/full-player";
import { MiniPlayer } from "./player/mini-player";
import { PlayerProvider } from "./player/player-provider";

function AppShell(): React.JSX.Element {
  const { view, minimized, activeSongId } = useAppView();
  const showFullPlayer = view === "player" && !minimized;

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
