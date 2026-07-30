import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { SettingsProvider } from "./settings";
import "./i18n";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SettingsProvider>
      <App />
    </SettingsProvider>
  </StrictMode>
);
