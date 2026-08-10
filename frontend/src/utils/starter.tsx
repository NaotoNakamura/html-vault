import React from "react";
import { createRoot } from "react-dom/client";

interface StarterOptions {
  containerId?: string;
}

export default function starter(
  Component: React.ComponentType,
  options: StarterOptions = {},
) {
  const { containerId = "root" } = options;

  document.addEventListener("DOMContentLoaded", () => {
    const container = document.getElementById(containerId);

    if (container) {
      const root = createRoot(container);
      root.render(
        <React.StrictMode>
          <Component />
        </React.StrictMode>,
      );
    } else {
      console.error(`[Starter] Target container '#${containerId}' not found.`);
    }
  });
}
