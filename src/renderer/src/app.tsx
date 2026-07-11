import { useState } from "react";
import { Library } from "./pages/library";
import { Settings } from "./pages/settings";

type View = "library" | "settings";

function App(): React.JSX.Element {
  const [view, setView] = useState<View>("library");

  return view === "settings" ? (
    <Settings onBack={() => setView("library")} />
  ) : (
    <Library onOpenSettings={() => setView("settings")} />
  );
}

export default App;
