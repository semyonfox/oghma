"use client";

import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import DayAgenda from "@/components/calendar/day-agenda";
import { parseLocalDateKey } from "@/lib/notes/utils/calendar-date";
import useI18n from "@/lib/notes/hooks/use-i18n";

interface DayAgendaDialogProps {
  open: boolean;
  onClose: () => void;
  dateKey: string;
  onAddStudyBlock: () => void;
  onRetry: () => void;
}

export default function DayAgendaDialog({
  open,
  onClose,
  dateKey,
  onAddStudyBlock,
  onRetry,
}: DayAgendaDialogProps) {
  const { t, activeLocale } = useI18n();
  const date = parseLocalDateKey(dateKey);
  const title = date
    ? new Intl.DateTimeFormat(activeLocale, {
        weekday: "long",
        day: "numeric",
        month: "long",
      }).format(date)
    : dateKey;

  return (
    <Dialog open={open} onClose={onClose} className="relative z-[70]">
      <DialogBackdrop className="fixed inset-0 bg-black/50 backdrop-blur-[1px]" />
      <div className="fixed inset-0 flex items-end justify-center sm:items-center sm:p-4">
        <DialogPanel className="flex max-h-[calc(100dvh-0.5rem)] w-full flex-col overflow-hidden rounded-t-radius-lg border border-border-subtle bg-surface shadow-xl sm:h-[min(42rem,calc(100dvh-2rem))] sm:max-w-lg sm:rounded-radius-lg">
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-border-subtle px-4">
            <DialogTitle className="truncate text-sm font-medium text-text-secondary">
              {title}
            </DialogTitle>
            <button
              type="button"
              onClick={onClose}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-radius-md text-text-tertiary hover:bg-subtle hover:text-text-secondary"
              aria-label={t("Close")}
            >
              <XMarkIcon className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <DayAgenda
            dateKey={dateKey}
            onAddStudyBlock={onAddStudyBlock}
            onRetry={onRetry}
            showHeading={false}
          />
        </DialogPanel>
      </div>
    </Dialog>
  );
}
