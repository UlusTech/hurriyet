import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { TrayIcon } from "@tauri-apps/api/tray";
import { defaultWindowIcon } from "@tauri-apps/api/app";
import "./index.css";

await TrayIcon.new({
  icon: (await defaultWindowIcon()) || undefined,
  action: (event) => {
    console.log(event.type);
  },
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
