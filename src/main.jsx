import { createRoot }        from "react-dom/client";
import { AleraAuthProvider } from "./AleraAuth.jsx";
import AleraApp              from "./AleraApp.jsx";
import { startSyncEngine }   from "./AleraSync.js";

// Start the background sync engine immediately on app load.
startSyncEngine();

createRoot(document.getElementById("root")).render(
  <AleraAuthProvider>
    <AleraApp />
  </AleraAuthProvider>
);
