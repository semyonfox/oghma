"use client";

import { useEffect, useRef, type ReactNode } from "react";
import {
  Menu,
  MenuButton,
  MenuHeading,
  MenuItem,
  MenuItems,
  MenuSection,
  MenuSeparator,
} from "@headlessui/react";
import {
  CheckIcon,
  ChevronDownIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  RectangleGroupIcon,
  RectangleStackIcon,
  Square3Stack3DIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import type { StudyMapSummary } from "@/lib/study-map/types";

export const islandClass =
  "pointer-events-auto flex min-w-0 items-center gap-0.5 rounded-radius-lg border border-border-subtle bg-surface/95 p-1 shadow-md backdrop-blur";
export const islandButton =
  "inline-flex min-h-8 min-w-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-radius-md px-2 text-xs font-medium text-text-secondary hover:bg-primary-500/10 hover:text-text focus-visible:outline-2 focus-visible:outline-primary-500 disabled:cursor-not-allowed disabled:opacity-50 data-[open]:bg-primary-500/10 data-[open]:text-text";
export const islandDivider = "mx-0.5 h-5 w-px shrink-0 bg-border-subtle";
export const menuPanelClass =
  "z-[60] w-64 max-w-[calc(100vw-1rem)] rounded-radius-lg border border-border-subtle bg-surface p-1 text-sm text-text shadow-lg [--anchor-gap:8px] [--anchor-padding:8px] focus:outline-none";
export const menuItemClass =
  "flex min-h-9 w-full items-center gap-2 rounded-radius-md px-2.5 py-1.5 text-left data-[disabled]:cursor-not-allowed data-[focus]:bg-primary-500/10 data-[disabled]:opacity-50";
export const menuHeadingClass =
  "px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary";
export const menuSeparatorClass = "my-1 h-px bg-border-subtle";

export function ModuleSwitcher({
  maps,
  mapId,
  disabled,
  onSelect,
  onSearch,
  onAddModule,
}: {
  maps: StudyMapSummary[];
  mapId: string;
  disabled: boolean;
  onSelect: (mapId: string) => void;
  onSearch: () => void;
  onAddModule: () => void;
}) {
  const current = maps.find((map) => map.id === mapId);
  const name = current?.name ?? (mapId ? "Selected module" : "Modules");
  return (
    <Menu>
      <MenuButton
        aria-label={
          current
            ? `Module: ${current.name}, ${current.academicYear}`
            : `Module: ${name}`
        }
        disabled={disabled}
        className={`${islandButton} min-w-0 shrink text-text`}
      >
        <RectangleStackIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 max-w-[6rem] truncate text-sm font-semibold sm:max-w-[16rem]">
          {name}
        </span>
        {current && (
          <span className="hidden shrink-0 font-normal text-text-tertiary sm:inline">
            {current.academicYear}
          </span>
        )}
        <ChevronDownIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      </MenuButton>
      <MenuItems anchor="bottom start" className={menuPanelClass}>
        <MenuSection className="max-h-[50dvh] overflow-y-auto">
          <MenuHeading className={menuHeadingClass}>Modules</MenuHeading>
          {maps.map((map) => (
            <MenuItem key={map.id}>
              <button
                type="button"
                aria-current={map.id === mapId ? "true" : undefined}
                className={menuItemClass}
                onClick={() => onSelect(map.id)}
              >
                <span className="min-w-0 flex-1 break-words">
                  {map.name} · {map.academicYear}
                </span>
                {map.id === mapId && (
                  <CheckIcon
                    className="h-4 w-4 shrink-0 text-primary-600 dark:text-primary-300"
                    aria-hidden="true"
                  />
                )}
              </button>
            </MenuItem>
          ))}
          {maps.length === 0 && (
            <MenuItem disabled>
              <span className={menuItemClass}>No modules yet</span>
            </MenuItem>
          )}
        </MenuSection>
        <MenuSeparator className={menuSeparatorClass} />
        <MenuItem>
          <button type="button" className={menuItemClass} onClick={onSearch}>
            <MagnifyingGlassIcon className="h-4 w-4" aria-hidden="true" />
            Search all modules
          </button>
        </MenuItem>
        <MenuItem>
          <button type="button" className={menuItemClass} onClick={onAddModule}>
            <PlusIcon className="h-4 w-4" aria-hidden="true" />
            Add module
          </button>
        </MenuItem>
      </MenuItems>
    </Menu>
  );
}

export function ScopeToggle({
  scope,
  count,
  onChange,
}: {
  scope: "module" | "all";
  count: number;
  onChange: (scope: "module" | "all") => void;
}) {
  return (
    <div
      role="group"
      aria-label="Map scope"
      className="flex shrink-0 rounded-radius-md bg-background/60 p-0.5"
    >
      {(["module", "all"] as const).map((value) => {
        const Icon =
          value === "module" ? RectangleGroupIcon : Square3Stack3DIcon;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={scope === value}
            title={value === "module" ? "This module" : "All modules"}
            className={`inline-flex min-h-7 min-w-7 items-center justify-center gap-1 rounded-[5px] px-1.5 text-xs font-medium focus-visible:outline-2 focus-visible:outline-primary-500 sm:px-2 ${scope === value ? "bg-primary-600 text-text-on-primary" : "text-text-secondary hover:text-text"}`}
            onClick={() => onChange(value)}
          >
            <Icon className="h-4 w-4 sm:hidden" aria-hidden="true" />
            <span className="max-sm:sr-only">
              {value === "module"
                ? "This module"
                : `All modules${count > 1 ? ` (${count})` : ""}`}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const toneDot = {
  error: "bg-error-500",
  warning: "bg-ai-500",
  info: "bg-primary-500",
} as const;

/** a floating notice; errors and warnings announce as alerts, the rest as status */
export function Toast({
  tone,
  children,
  onDismiss,
  timeout,
}: {
  tone: keyof typeof toneDot;
  children: ReactNode;
  onDismiss?: () => void;
  /** milliseconds before an informational notice clears itself */
  timeout?: number;
}) {
  const dismiss = useRef(onDismiss);
  useEffect(() => {
    dismiss.current = onDismiss;
  }, [onDismiss]);
  useEffect(() => {
    if (!timeout) return;
    const timer = window.setTimeout(() => dismiss.current?.(), timeout);
    return () => window.clearTimeout(timer);
  }, [timeout]);
  return (
    <div
      role={tone === "info" ? "status" : "alert"}
      className="pointer-events-auto flex w-full items-start gap-2.5 rounded-radius-lg border border-border-subtle bg-surface px-3 py-2 text-sm text-text shadow-lg lg:w-auto lg:max-w-md"
    >
      <span
        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${toneDot[tone]}`}
        aria-hidden="true"
      />
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1.5 break-words">
        {children}
      </div>
      {onDismiss && (
        <button
          type="button"
          className="-mr-1 grid h-6 w-6 shrink-0 place-items-center rounded-radius-md text-text-tertiary hover:bg-primary-500/10 hover:text-text focus-visible:outline-2 focus-visible:outline-primary-500"
          aria-label="Dismiss"
          onClick={onDismiss}
        >
          <XMarkIcon className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/** stacks floating notices over the canvas so they never push it around */
export function NoticeStack({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-16 z-40 flex flex-col items-center gap-2 lg:bottom-3 lg:right-auto lg:items-start">
      {children}
    </div>
  );
}

/** the canvas backdrop while there is no board to show */
export function ChromeFrame({
  notices,
  children,
}: {
  notices?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className="absolute inset-0 bg-background"
      style={{
        backgroundImage:
          "radial-gradient(var(--color-border-subtle) 1px, transparent 1.2px)",
        backgroundSize: "28px 28px",
      }}
    >
      <div className="grid h-full place-items-center overflow-y-auto p-4 pt-20">
        {children}
      </div>
      <NoticeStack>{notices}</NoticeStack>
    </div>
  );
}
