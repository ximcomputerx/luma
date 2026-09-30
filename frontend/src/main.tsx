import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { displayName } from "./brand";
import { paintBootLocale } from "./i18n";
import { paintBootTheme } from "./styles/applyTheme";
import "./design/tailwind.css";
import "./design/tokens.css";
import "./design/typography.css";
import "./design/themes.css";
import "./design/base.css";
import "./styles/app.css";
import "./components/ui/ui.css";
import "./styles/pdf-template.css";

paintBootTheme();
paintBootLocale();
document.title = displayName;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
