import type { Dispatch, SetStateAction } from "react";
import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import {
  AdjustmentsHorizontalIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";
import { islandButton } from "./study-chrome";
import { FILTERS, type FilterKey } from "./study-flow-model";

interface FlowSearchProps {
  query: string;
  setQuery: (query: string) => void;
  searchOpen: boolean;
  setSearchOpen: Dispatch<SetStateAction<boolean>>;
  /** Enter jumps to the first matching topic or card */
  onSearch: () => void;
}

/** the search box, which drops below the island on a phone */
export function FlowSearch({
  query,
  setQuery,
  searchOpen,
  setSearchOpen,
  onSearch,
}: FlowSearchProps) {
  return (
    <>
      <button
        type="button"
        className={`${islandButton} sm:hidden`}
        aria-label="Search the map"
        aria-expanded={searchOpen}
        onClick={() => setSearchOpen((open) => !open)}
      >
        <MagnifyingGlassIcon className="h-4 w-4" aria-hidden="true" />
      </button>
      <label
        className={`relative items-center ${searchOpen ? "flex max-sm:absolute max-sm:right-0 max-sm:top-full max-sm:mt-2 max-sm:w-[calc(100vw-1.5rem)] max-sm:rounded-radius-lg max-sm:border max-sm:border-border-subtle max-sm:bg-surface max-sm:p-1 max-sm:shadow-float" : "hidden sm:flex"}`}
      >
        <span className="sr-only">Search the map</span>
        <MagnifyingGlassIcon
          className="pointer-events-none absolute left-2.5 h-4 w-4 text-text-tertiary max-sm:left-3.5"
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          autoFocus={searchOpen}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              // a first Escape clears the search, a second closes whatever is open
              if (query) event.preventDefault();
              else setSearchOpen(false);
              setQuery("");
            }
            if (event.key === "Enter") onSearch();
          }}
          placeholder="Search notes and topics"
          className="min-h-8 w-full rounded-radius-md bg-background/70 py-1 pl-8 pr-2 text-base text-text placeholder:text-text-tertiary focus-visible:outline-2 focus-visible:outline-accent sm:w-44 md:text-sm lg:w-56"
        />
      </label>
    </>
  );
}

interface FlowFilterMenuProps {
  hidden: Set<FilterKey>;
  setHidden: Dispatch<SetStateAction<Set<FilterKey>>>;
  showSuggested: boolean;
  setShowSuggested: (show: boolean) => void;
  showLinks: boolean;
  setShowLinks: (show: boolean) => void;
  filtered: boolean;
}

/** which cards and relations the board shows */
export function FlowFilterMenu({
  hidden,
  setHidden,
  showSuggested,
  setShowSuggested,
  showLinks,
  setShowLinks,
  filtered,
}: FlowFilterMenuProps) {
  return (
    <Popover>
      <PopoverButton
        className={islandButton}
        title="Choose which cards and relations to show"
      >
        <AdjustmentsHorizontalIcon
          className="h-4 w-4"
          aria-hidden="true"
        />
        <span className="max-sm:sr-only">
          Show{filtered ? " (filtered)" : ""}
        </span>
        {filtered && (
          <span
            className="h-1.5 w-1.5 rounded-full bg-accent sm:hidden"
            aria-hidden="true"
          />
        )}
      </PopoverButton>
      <PopoverPanel
        anchor="bottom end"
        className="z-[60] w-60 rounded-radius-lg border border-border-subtle bg-surface-overlay p-3 text-sm text-text shadow-float [--anchor-gap:8px] [--anchor-padding:8px] focus:outline-none"
      >
        <fieldset>
          <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
            Cards
          </legend>
          {FILTERS.map(([key, label]) => (
            <label
              key={key}
              className="flex min-h-8 items-center gap-2"
            >
              <input
                type="checkbox"
                checked={!hidden.has(key)}
                onChange={(event) =>
                  setHidden((current) => {
                    const next = new Set(current);
                    if (event.target.checked) next.delete(key);
                    else next.add(key);
                    return next;
                  })
                }
              />
              {label}
            </label>
          ))}
        </fieldset>
        <fieldset className="mt-2 border-t border-border-subtle pt-2">
          <legend className="sr-only">Relations</legend>
          <label className="flex min-h-8 items-center gap-2">
            <input
              type="checkbox"
              checked={showSuggested}
              onChange={(event) =>
                setShowSuggested(event.target.checked)
              }
            />{" "}
            Suggested topics
          </label>
          <label className="flex min-h-8 items-center gap-2">
            <input
              type="checkbox"
              checked={showLinks}
              onChange={(event) => setShowLinks(event.target.checked)}
            />{" "}
            Links between notes
          </label>
        </fieldset>
      </PopoverPanel>
    </Popover>
  );
}
