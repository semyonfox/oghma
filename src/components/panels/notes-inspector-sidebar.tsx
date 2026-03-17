'use client';

import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  ChevronRightIcon,
  SparklesIcon,
  TagIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';
import useLayoutStore from '@/lib/notes/state/layout.zustand';
import { extractTags } from '@/lib/notes/utils/file-spec';

interface InspectorNote {
  id: string;
  title?: string;
  content?: string;
  created_at?: string;
  updated_at?: string;
  note_id?: string;
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof SparklesIcon;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-white/10 bg-gray-900/80">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <Icon className="h-4 w-4 text-gray-400" />
        <h3 className="text-sm font-medium text-gray-200">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export default function NotesInspectorSidebar() {
  const { activePane, paneA, paneB, rightPanelOpen, toggleRightPanel } = useLayoutStore();
  const activeFile = activePane === 'B' && paneB ? paneB : paneA;
  const [note, setNote] = useState<InspectorNote | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activeFile?.fileId) {
      setNote(null);
      return;
    }

    let cancelled = false;

    const loadNote = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/notes/${activeFile.fileId}`);
        if (!response.ok) {
          if (!cancelled) setNote(null);
          return;
        }

        const data = await response.json();
        if (!cancelled) {
          setNote(data);
        }
      } catch {
        if (!cancelled) setNote(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadNote();

    return () => {
      cancelled = true;
    };
  }, [activeFile?.fileId]);

  const tags = useMemo(() => extractTags(note?.content), [note?.content]);

  return (
    <div className="h-full flex flex-col bg-gray-900 text-gray-200">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Inspector</p>
          <p className="mt-1 text-sm font-medium text-gray-200">
            {activeFile?.title || 'No file selected'}
          </p>
        </div>
        {rightPanelOpen && (
          <button
            onClick={toggleRightPanel}
            className="rounded-md p-2 text-gray-500 transition-colors hover:bg-white/5 hover:text-gray-200"
            title="Collapse sidebar"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <Section title="AI Sidebar" icon={SparklesIcon}>
          {activeFile?.fileId ? (
            <div className="space-y-3">
              <button className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left text-sm text-gray-200 transition-colors hover:bg-white/10">
                Summarize this file
              </button>
              <button className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left text-sm text-gray-200 transition-colors hover:bg-white/10">
                Generate study prompts
              </button>
              <button className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left text-sm text-gray-200 transition-colors hover:bg-white/10">
                Find related notes
              </button>
              <p className="text-xs text-gray-500">
                Actions are scaffolded in the UI and can be wired to backend AI flows next.
              </p>
            </div>
          ) : (
            <p className="text-sm text-gray-500">Select a file to see AI actions.</p>
          )}
        </Section>

        <Section title="Metadata" icon={DocumentTextIcon}>
          {loading ? (
            <p className="text-sm text-gray-500">Loading metadata...</p>
          ) : note ? (
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-500">Title</dt>
                <dd className="mt-1 text-gray-200">{note.title || activeFile?.title || 'Untitled'}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-500">Type</dt>
                <dd className="mt-1 text-gray-200">{activeFile.fileType}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-500">Created</dt>
                <dd className="mt-1 text-gray-200">
                  {note.created_at ? new Date(note.created_at).toLocaleString() : 'Unknown'}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-500">Updated</dt>
                <dd className="mt-1 text-gray-200">
                  {note.updated_at ? new Date(note.updated_at).toLocaleString() : 'Unknown'}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-500">ID</dt>
                <dd className="mt-1 break-all font-mono text-xs text-gray-400">
                  {note.note_id || note.id || activeFile.fileId}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-gray-500">Metadata is available when a note-backed file is selected.</p>
          )}
        </Section>

        <Section title="Tags" icon={TagIcon}>
          {tags.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-sky-500/20 bg-sky-500/10 px-2.5 py-1 text-xs text-sky-200"
                >
                  #{tag}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No tags found in this note yet.</p>
          )}
        </Section>
      </div>
    </div>
  );
}
