"use client";

import { useEffect } from "react";

export default function BootstrapInit() {
  useEffect(() => {
    // Initialize tooltips and popovers if present
    import("bootstrap").then(({ Tooltip, Popover }) => {
      const tooltipTriggerList = Array.from(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
      tooltipTriggerList.forEach(el => new Tooltip(el));

      const popoverTriggerList = Array.from(document.querySelectorAll('[data-bs-toggle="popover"]'));
      popoverTriggerList.forEach(el => new Popover(el));
    }).catch(() => {});
  }, []);
  return null;
}

