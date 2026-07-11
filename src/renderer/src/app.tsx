import { AppViewProvider, useAppView } from "./app-view";
import { Library } from "./pages/library";
import { FullPlayer } from "./player/full-player";
import { PlayerProvider } from "./player/player-provider";

function AppShell(): React.JSX.Element {
  const { view } = useAppView();
  return view === "player" ? <FullPlayer /> : <Library />;
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
