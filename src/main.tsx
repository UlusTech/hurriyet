import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { TrayIcon } from "@tauri-apps/api/tray";
import { Menu } from "@tauri-apps/api/menu";

const menu = await Menu.new({
  items: [
    {
      id: "quit",
      text: "Quit",
    },
  ],
});

const options = {
  menu,
  menuOnLeftClick: true,
};

TrayIcon.new(options);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
