import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";

const PRELOAD_RELOAD_GUARD = "karion_preload_reload_once";

if (typeof window !== "undefined") {
  window.addEventListener("vite:preloadError", (event) => {
    event?.preventDefault?.();
    const alreadyReloaded = sessionStorage.getItem(PRELOAD_RELOAD_GUARD) === "1";
    if (!alreadyReloaded) {
      sessionStorage.setItem(PRELOAD_RELOAD_GUARD, "1");
      window.location.reload();
    }
  });

  window.addEventListener("load", () => {
    sessionStorage.removeItem(PRELOAD_RELOAD_GUARD);
  });
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
