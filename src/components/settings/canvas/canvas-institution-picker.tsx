"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import useI18n from "@/lib/notes/hooks/use-i18n";
import {
  canvasHostFromInput,
  parseCanvasInstitutions,
  type CanvasInstitution,
} from "@/lib/canvas/institution-search";

type SearchStatus = "idle" | "loading" | "ready" | "error";

type CanvasInstitutionPickerProps = {
  domain: string;
  setDomain: (value: string) => void;
};

export default function CanvasInstitutionPicker({
  domain,
  setDomain,
}: CanvasInstitutionPickerProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CanvasInstitution[]>([]);
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [selectedSchool, setSelectedSchool] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(Boolean(domain));
  const [manualValue, setManualValue] = useState(domain);
  const typedCanvasHost = canvasHostFromInput(query);
  const searchFinished = status === "ready" || status === "error";
  const showTypedHost = Boolean(
    searchFinished &&
      typedCanvasHost &&
      !results.some((school) => school.domain === typedCanvasHost),
  );
  const looksLikeAddress =
    query.includes("://") || /^\S+\.\S+$/.test(query.trim());

  useEffect(() => {
    if (domain && !selectedSchool && !manualValue) {
      setManualValue(domain);
      setManualOpen(true);
    }
  }, [domain, selectedSchool, manualValue]);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 3 || selectedSchool) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setStatus("loading");
      try {
        const url = new URL("https://canvas.instructure.com/api/v1/accounts/search");
        url.searchParams.set("name", term);
        const response = await fetch(url, {
          signal: controller.signal,
          credentials: "omit",
          referrerPolicy: "no-referrer",
        });
        if (!response.ok) throw new Error("Canvas directory request failed");
        const body: unknown = await response.json();
        if (!Array.isArray(body)) throw new Error("Invalid Canvas directory response");
        if (controller.signal.aborted) return;
        setResults(parseCanvasInstitutions(body));
        setStatus("ready");
      } catch {
        if (controller.signal.aborted) return;
        setResults([]);
        setStatus("error");
      }
    }, 800);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, selectedSchool]);

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setQuery(event.target.value);
    setResults([]);
    setStatus(event.target.value.trim().length >= 3 ? "loading" : "idle");
    setSelectedSchool(null);
    setDomain("");
    setManualValue("");
    setManualOpen(false);
  };

  const handleManualChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setManualValue(value);
    setDomain(canvasHostFromInput(value) ?? "");
  };

  return (
    <div className="space-y-3">
      <div>
        <label
          htmlFor="canvas-school-search"
          className="block text-sm/6 font-medium text-text-secondary"
        >
          {t("Find your school on Canvas")}
        </label>
        <p className="mt-1 text-xs text-text-tertiary">
          {t("Search by school or institution name.")}
          <span className="block">
            {t("Paste your Canvas URL or enter its address, for example")}{" "}
            <span className="text-text-secondary">example.instructure.com</span>
          </span>
        </p>
        <input
          id="canvas-school-search"
          type="search"
          autoComplete="off"
          value={query}
          onChange={handleSearchChange}
          placeholder={t("Start typing your school name")}
          className="mt-2 block w-full rounded-radius-md border border-border-subtle bg-surface px-3 py-1.5 text-sm text-text placeholder:text-text-tertiary focus:border-primary-500/50 focus:outline-none focus:ring-1 focus:ring-primary-500/50"
        />
        {query.trim().length > 0 && query.trim().length < 3 && (
          <p className="mt-1 text-xs text-text-tertiary">
            {t("Type at least 3 characters to search")}
          </p>
        )}
      </div>

      {selectedSchool && domain && (
        <p className="rounded-radius-md border border-primary-500/30 bg-primary-500/10 px-3 py-2 text-sm text-text-secondary">
          <span className="font-medium text-text">{selectedSchool}</span>
          <span className="block text-xs text-text-tertiary">{domain}</span>
        </p>
      )}

      {!selectedSchool && query.trim().length >= 3 && (
        <div aria-live="polite" className="text-sm text-text-tertiary">
          {status === "loading" && <p>{t("Searching Canvas schools...")}</p>}
          {status === "error" && (
            <p>{t("School search is unavailable. Use your Canvas URL instead.")}</p>
          )}
          {status === "ready" && results.length === 0 && (
            <p>{t("No schools found. Try your Canvas URL instead.")}</p>
          )}
          {searchFinished &&
            results.length === 0 &&
            looksLikeAddress &&
            !typedCanvasHost && (
              <p role="alert" className="mt-1 text-xs text-red-400">
                {t("Paste your Canvas URL or enter its address, for example")}{" "}
                <span>example.instructure.com</span>
              </p>
            )}
          {status === "ready" && results.length > 0 && (
            <ul className="max-h-56 space-y-1 overflow-y-auto rounded-radius-md border border-border-subtle bg-surface p-1">
              {results.map((school, index) => (
                <li key={`${school.domain}-${index}`}>
                  <button
                    type="button"
                    disabled={!school.supported}
                    onClick={() => {
                      setSelectedSchool(school.name);
                      setDomain(school.domain);
                      setManualOpen(false);
                      setManualValue("");
                    }}
                    className="w-full rounded-radius-md px-2 py-2 text-left text-sm text-text hover:bg-primary-500/10 focus:bg-primary-500/10 focus:outline-none focus:ring-1 focus:ring-primary-500/50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="block font-medium">{school.name}</span>
                    <span className="block text-xs text-text-tertiary">
                      {school.domain}
                      {!school.supported &&
                        ` · ${t("This Canvas URL is not supported yet")}`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {showTypedHost && typedCanvasHost && (
            <button
              type="button"
              onClick={() => {
                setSelectedSchool(t("Canvas URL"));
                setDomain(typedCanvasHost);
                setManualOpen(false);
                setManualValue("");
              }}
              className="mt-2 w-full rounded-radius-md border border-primary-500/30 bg-primary-500/10 px-3 py-2 text-left text-sm text-text hover:bg-primary-500/20 focus:outline-none focus:ring-1 focus:ring-primary-500/50"
            >
              <span className="block font-medium">
                {t("Use your Canvas URL instead")}
              </span>
              <span className="block text-xs text-text-tertiary">
                {typedCanvasHost}
              </span>
            </button>
          )}
        </div>
      )}

      {(!showTypedHost || manualOpen) && (
        <button
          type="button"
          aria-expanded={manualOpen}
          aria-controls="canvas-manual-domain"
          onClick={() => {
            setManualOpen(!manualOpen);
            setManualValue("");
            setDomain("");
            setSelectedSchool(null);
            setQuery("");
            setResults([]);
            setStatus("idle");
          }}
          className="text-sm font-medium text-primary-400 underline underline-offset-2"
        >
          {manualOpen ? t("Hide Canvas URL") : t("Use your Canvas URL instead")}
        </button>
      )}

      {manualOpen && (
        <div id="canvas-manual-domain">
          <label
            htmlFor="canvas-domain"
            className="block text-sm/6 font-medium text-text-secondary"
          >
            {t("Canvas URL")}
          </label>
          <p className="mt-1 text-xs text-text-tertiary">
            {t("Paste your Canvas URL or enter its address, for example")}{" "}
            <span className="text-text-secondary">example.instructure.com</span>
          </p>
          <input
            id="canvas-domain"
            type="text"
            inputMode="url"
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
            placeholder="https://example.instructure.com"
            value={manualValue}
            onChange={handleManualChange}
            className="mt-2 block w-full rounded-radius-md border border-border-subtle bg-surface px-3 py-1.5 text-sm text-text placeholder:text-text-tertiary focus:border-primary-500/50 focus:outline-none focus:ring-1 focus:ring-primary-500/50"
          />
          {manualValue.trim() && !domain && (
            <p role="alert" className="mt-1 text-xs text-red-400">
              {t("Paste your Canvas URL or enter its address, for example")}{" "}
              <span>example.instructure.com</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
