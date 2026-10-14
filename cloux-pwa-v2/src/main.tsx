import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AppDataProvider } from "./store";
import "./styles.css";

createRoot(document.getElementById("root")!).render(<React.StrictMode><AppDataProvider><App /></AppDataProvider></React.StrictMode>);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/app/sw.js', { scope: '/app/' }).catch(() => undefined);
  });
}
