"use client";

import { TrashIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import useI18n from "@/lib/notes/hooks/use-i18n";

async function fetchTrashCount(signal: AbortSignal) {
  const response = await fetch("/api/trash", { cache: "no-store", signal });
  if (!response.ok) throw new Error(`Failed to load Trash: ${response.status}`);
  const data = (await response.json()) as { items?: unknown };
  return Array.isArray(data.items) ? data.items.length : 0;
}

// lives in the tree toolbar so Trash doesn't eat a full row under the tree
export function TrashButton({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const isTrash = pathname === "/notes/trash";
  const [trashCount, setTrashCount] = useState(0);

  useEffect(() => {
    let controller: AbortController | null = null;
    const refresh = () => {
      controller?.abort();
      const current = new AbortController();
      controller = current;
      fetchTrashCount(current.signal).then(
        (count) => {
          if (!current.signal.aborted) setTrashCount(count);
        },
        () => {
          if (!current.signal.aborted) setTrashCount(0);
        },
      );
    };

    refresh();
    window.addEventListener("notes:trash-changed", refresh);
    return () => {
      controller?.abort();
      window.removeEventListener("notes:trash-changed", refresh);
    };
  }, []);

  const label = trashCount > 0 ? `${t("Trash")} (${trashCount})` : t("Trash");

  return (
    <Link
      href="/notes/trash"
      onClick={() => onNavigate?.()}
      aria-current={isTrash ? "page" : undefined}
      aria-label={label}
      title={label}
      className={`ui-icon-button relative ${isTrash ? "bg-subtle text-text" : ""}`}
    >
      <TrashIcon className="h-[18px] w-[18px]" aria-hidden="true" />
      {trashCount > 0 && (
        <span
          className="absolute right-0.5 top-0.5 min-w-3.5 rounded-full bg-subtle px-1 font-mono text-[9px] font-semibold leading-3.5 tabular-nums text-text-secondary ring-1 ring-sidebar"
          aria-hidden="true"
        >
          {trashCount > 99 ? "99+" : trashCount}
        </span>
      )}
    </Link>
  );
}
