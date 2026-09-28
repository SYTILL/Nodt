import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/ibm-plex-sans-kr/400.css";
import "@fontsource/ibm-plex-sans-kr/600.css";
import "./styles.css";
import App from "./App";
import { createSampleNotes } from "./model/sample";
import { DEFAULT_SETTINGS, makeState } from "./state/store";

function devInitialState() {
  const { notes, rootId, ids } = createSampleNotes();
  return makeState(notes, rootId, {
    open: new Set([ids.cs, ids.comp, ids.mid, ids.parser, ids.app]),
    active: ids.comp,
    settings: DEFAULT_SETTINGS,
  });
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App initial={devInitialState()} />
  </React.StrictMode>,
);
