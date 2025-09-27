"use client";

import { useEffect } from "react";

// Loads Bootstrap's JS bundle on the client so interactive components work
export default function BootstrapClient() {
  useEffect(() => {
    // Dynamically import to avoid SSR issues
    import("bootstrap/dist/js/bootstrap.bundle.min.js");
  }, []);
  return null;
}

