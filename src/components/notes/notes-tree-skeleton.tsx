import useI18n from "@/lib/notes/hooks/use-i18n";

export default function NotesTreeSkeleton() {
  const { t } = useI18n();
  return (
    <div role="status" aria-label={t("Loading...")} className="px-2">
      {[80, 65, 74].map((width) => (
        <div key={width} aria-hidden="true" className="flex min-h-12 items-center gap-2 px-2 md:min-h-7">
          <span className="skeleton size-4 shrink-0 rounded-radius-sm" />
          <span className="skeleton h-3 rounded-radius-sm" style={{ width: `${width}%` }} />
        </div>
      ))}
    </div>
  );
}
