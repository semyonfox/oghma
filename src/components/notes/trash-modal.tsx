"use client";

// trash modal - shows deleted notes with restore/delete actions
// ported from Notea (MIT License) - MUI replaced with Tailwind/Headless UI
import { FC, useCallback, useEffect, useRef } from "react";
import FilterModal from "@/components/notes/filter-modal";
import FilterModalInput from "@/components/notes/filter-modal-input";
import FilterModalList from "@/components/notes/filter-modal-list";
import MarkText from "@/components/notes/mark-text";
import { NoteModel } from "@/lib/notes/types/note";
import useTrashStore from "@/lib/notes/state/trash";
import usePortalStore from "@/lib/notes/state/portal";
import { useRouter } from "next/navigation";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { NoteCacheItem } from "@/lib/notes/cache";
import { ArrowUturnLeftIcon, TrashIcon } from "@heroicons/react/24/outline";

// individual trash item row
const TrashItem: FC<{
  note: NoteCacheItem;
  keyword?: string;
  selected?: boolean;
}> = ({ note, keyword, selected }) => {
  const { t } = useI18n();
  const { restoreNote, deleteNote, filterNotes } = useTrashStore();
  const {
    trash: { close },
  } = usePortalStore();
  const ref = useRef<HTMLLIElement>(null);

  const onClickRestore = useCallback(async () => {
    await restoreNote(note as NoteModel);
    await filterNotes(keyword);
  }, [filterNotes, keyword, note, restoreNote]);

  const onClickDelete = useCallback(async () => {
    await deleteNote(note.id);
    await filterNotes(keyword);
  }, [deleteNote, note.id, filterNotes, keyword]);

  // scroll into view when selected via keyboard
  useEffect(() => {
    if (selected && ref.current) {
      ref.current.scrollIntoView({ block: "nearest" });
    }
  }, [selected]);

  return (
    <li
      ref={ref}
      className={`flex items-center py-2 px-4 cursor-pointer transition-colors ${
        selected ? "bg-primary-500/10" : "hover:bg-white/5"
      }`}
    >
      <a
        className="block text-xs text-text-tertiary flex-grow min-w-0"
        onClick={close}
      >
        <h4 className="text-sm font-bold text-text truncate">
          <MarkText text={note.title} keyword={keyword} />
        </h4>
      </a>

      <button
        onClick={onClickRestore}
        className="p-1.5 rounded text-text-tertiary hover:text-success-400 hover:bg-success-900/20 transition-colors ml-1 flex-shrink-0"
        title={t("Recovery")}
      >
        <ArrowUturnLeftIcon className="w-4 h-4" />
      </button>

      <button
        onClick={onClickDelete}
        className="p-1.5 rounded text-text-tertiary hover:text-error-400 hover:bg-error-900/20 transition-colors flex-shrink-0"
        title={t("Delete")}
      >
        <TrashIcon className="w-4 h-4" />
      </button>
    </li>
  );
};

// main trash modal component
const TrashModal: FC = () => {
  const { t } = useI18n();
  const { filterNotes, keyword, list } = useTrashStore();
  const {
    trash: { visible, close },
  } = usePortalStore();
  const router = useRouter();

  const onEnter = useCallback(
    (item: NoteModel) => {
      router.push(`/notes/${item.id}`);
      close();
    },
    [router, close],
  );

  useEffect(() => {
    if (visible) {
      filterNotes()?.catch((v) =>
        console.error("Error whilst filtering notes: %O", v),
      );
    }
  }, [visible, filterNotes]);

  return (
    <FilterModal open={visible} onClose={close}>
      <FilterModalInput
        placeholder={t("Search note in trash")}
        doFilter={filterNotes}
        keyword={keyword}
        onClose={close}
      />
      {list && list.length === 0 && (
        <div className="px-4 py-8 text-center text-text-tertiary">
          <TrashIcon className="mx-auto h-12 w-12 text-text-tertiary opacity-40" />
          <p className="mt-2">{t("Trash is empty")}</p>
        </div>
      )}
      <FilterModalList<NoteCacheItem>
        onEnter={(item) => onEnter(item as NoteModel)}
        items={list ?? []}
        ItemComponent={(item, props) => (
          <TrashItem note={item} keyword={keyword} key={item.id} {...props} />
        )}
      />
    </FilterModal>
  );
};

export default TrashModal;
