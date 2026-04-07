import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

const CACHE_PREFIX = "image-converter-";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

async function cleanupLocalServiceWorkers() {
  if (!("serviceWorker" in navigator)) return;

  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));

  if ("caches" in window) {
    const cacheKeys = await caches.keys();
    await Promise.all(cacheKeys.filter((key) => key.startsWith(CACHE_PREFIX)).map((key) => caches.delete(key)));
  }
}

function shouldRegisterServiceWorker() {
  const hostname = window.location.hostname;
  const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";
  return import.meta.env.PROD && !isLocalhost;
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    if (shouldRegisterServiceWorker()) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
      return;
    }

    void cleanupLocalServiceWorkers();
  });
}
