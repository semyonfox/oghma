"use client";

import { useEffect, useId, useState } from "react";
import {
  marketingAnalyticsAllowed,
  setTelemetryDisabled,
  telemetryConfigured,
  telemetryDisabled,
  TELEMETRY_PREFERENCE_EVENT,
} from "@/lib/marketing/client";

export default function TelemetryPreference() {
  const id = useId();
  const [disabled, setDisabled] = useState(true);
  const [storageFailed, setStorageFailed] = useState(false);
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    const update = () => {
      setDisabled(telemetryDisabled());
      setAllowed(marketingAnalyticsAllowed());
    };
    update();
    window.addEventListener(TELEMETRY_PREFERENCE_EVENT, update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener(TELEMETRY_PREFERENCE_EVENT, update);
      window.removeEventListener("storage", update);
    };
  }, []);
  return (
    <div className="space-y-3">
      <label
        htmlFor={id}
        className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium text-text-secondary"
      >
        <input
          id={id}
          type="checkbox"
          checked={disabled}
          aria-describedby={`${id}-description ${id}-status`}
          className="h-5 w-5 accent-primary-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-400"
          onChange={(event) => {
            const saved = setTelemetryDisabled(event.currentTarget.checked);
            setDisabled(telemetryDisabled());
            setAllowed(marketingAnalyticsAllowed());
            setStorageFailed(!saved);
          }}
        />
        Disable anonymous usage counts
      </label>
      <p id={`${id}-description`} className="text-sm text-text-tertiary">
        Optional screen and action counts and fixed error categories,
        self-hosted. No visitor tracking, account identifiers or note content.
        Off until configured. This choice applies to this browser.
      </p>
      <p
        id={`${id}-status`}
        role="status"
        className="text-sm text-text-secondary"
      >
        {storageFailed
          ? "Collection is disabled for this page. Your browser could not save the preference."
          : !telemetryConfigured()
            ? "Collection is off because no endpoint is configured."
            : !allowed
              ? "Collection is disabled by your preference or browser privacy signal."
              : "Anonymous counts are enabled. You can disable them at any time."}
      </p>
    </div>
  );
}
