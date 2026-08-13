import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { PreferencesProvider } from "./services/preferences";
import { UpdateProvider } from "./services/updates";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <PreferencesProvider><UpdateProvider><App /></UpdateProvider></PreferencesProvider>
  </React.StrictMode>,
);
