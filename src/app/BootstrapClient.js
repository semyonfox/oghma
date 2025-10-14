"use client";

import { useEffect } from "react";

// Loads Bootstrap's JS bundle on the client so interactive components work
export default function BootstrapClient() {
  useEffect(() => {
    // Prefer the package's ESM entry which exports Tooltip/Popover; fall back to the bundle
    import("bootstrap")
      .then(({ Tooltip, Popover }) => {
        try {
          const tooltipTriggerList = Array.from(
            document.querySelectorAll('[data-bs-toggle="tooltip"]')
          );
          tooltipTriggerList.forEach((el) => new Tooltip(el));

          const popoverTriggerList = Array.from(
            document.querySelectorAll('[data-bs-toggle="popover"]')
          );
          popoverTriggerList.forEach((el) => new Popover(el));
        } catch (err) {
          // If something goes wrong initializing, silently ignore to avoid crashing the app
          // (developer can open console to inspect errors)
        }
      })
      .catch(() => {
        // If importing the ESM entry fails, load the UMD bundle for side-effects
        import("bootstrap/dist/js/bootstrap.bundle.min.js").catch(() => {});
      });
  }, []);
  return null;
}
