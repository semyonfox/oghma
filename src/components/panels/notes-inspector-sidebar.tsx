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
import useI18n from '@/lib/notes/hooks/use-i18n';
import { extractTags } from '@/lib/notes/utils/file-spec';

interface InspectorNote {
  id: string;
  title?: string;
  content?: string;
  created_at?: string;
  updated_at?: string;
  note_id?: string;
}

type InspectorTab = 'ai' | 'meta' | 'tags';

export default function NotesInspectorSidebar() {
  const { t } = useI18n();
  const { activePane, paneA, paneB, rightPanelOpen, toggleRightPanel } = useLayoutStore();
  const activeFile = activePane === 'B' && paneB ? paneB : paneA;
  const [note, setNote] = useState<InspectorNote | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<InspectorTab>('meta');

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

  const tabClasses = (tab: InspectorTab) => `
    px-3 py-2 text-xs font-medium transition-colors border-b-2
    ${activeTab === tab
      ? 'border-indigo-500 text-gray-200'
      : 'border-transparent text-gray-600 hover:text-gray-500'
    }
  `;

  return (
    <div className="h-full flex flex-col bg-gray-800 text-gray-200">
       {/* Header */}
       <div className="flex items-center justify-between border-b border-white/6 px-4 py-3">
         <h3 className="text-sm font-medium text-gray-300">{activeFile?.title || t('No file')}</h3>
         {rightPanelOpen && (
           <button
             onClick={toggleRightPanel}
             className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-white/5 hover:text-gray-300"
             title={t('Collapse panel')}
           >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        )}
      </div>

       {/* Tabs */}
       <div className="flex border-b border-white/6 px-3 gap-0">
         <button onClick={() => setActiveTab('meta')} className={tabClasses('meta')}>
           {t('Meta')}
         </button>
         <button onClick={() => setActiveTab('tags')} className={tabClasses('tags')}>
           {t('Tags')}
         </button>
         <button onClick={() => setActiveTab('ai')} className={tabClasses('ai')}>
           {t('AI')}
         </button>
       </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
         {/* Metadata Tab */}
         {activeTab === 'meta' && (
           <div className="p-4">
             {loading ? (
               <p className="text-xs text-gray-500">{t('Loading...')}</p>
             ) : note ? (
               <dl className="space-y-3 text-sm">
                 <div>
                   <dt className="text-xs uppercase tracking-widest text-gray-600">{t('Title')}</dt>
                   <dd className="mt-1 text-gray-300 text-sm">{note.title || activeFile?.title || t('Untitled')}</dd>
                 </div>
                 <div>
                   <dt className="text-xs uppercase tracking-widest text-gray-600">{t('Type')}</dt>
                   <dd className="mt-1 text-gray-300 text-sm">{activeFile.fileType}</dd>
                 </div>
                 <div>
                   <dt className="text-xs uppercase tracking-widest text-gray-600">{t('Created')}</dt>
                   <dd className="mt-1 text-gray-400 text-sm">
                     {note.created_at ? new Date(note.created_at).toLocaleDateString() : t('Unknown')}
                   </dd>
                 </div>
                 <div>
                   <dt className="text-xs uppercase tracking-widest text-gray-600">{t('Updated')}</dt>
                   <dd className="mt-1 text-gray-400 text-sm">
                     {note.updated_at ? new Date(note.updated_at).toLocaleDateString() : t('Unknown')}
                   </dd>
                 </div>
                 <div>
                   <dt className="text-xs uppercase tracking-widest text-gray-600">{t('ID')}</dt>
                   <dd className="mt-1 break-all font-mono text-[10px] text-gray-500">
                     {note.note_id || note.id || activeFile.fileId}
                   </dd>
                 </div>
               </dl>
             ) : (
               <p className="text-xs text-gray-500">{t('Select a note to view metadata.')}</p>
             )}
           </div>
         )}

         {/* Tags Tab */}
         {activeTab === 'tags' && (
           <div className="p-4">
             {tags.length > 0 ? (
               <div className="flex flex-wrap gap-1.5">
                 {tags.map((tag) => (
                   <span
                     key={tag}
                     className="rounded-full border border-white/8 bg-white/5 px-2 py-0.5 text-xs text-gray-400"
                   >
                     #{tag}
                   </span>
                 ))}
               </div>
             ) : (
               <p className="text-xs text-gray-500">{t('No tags found in this note.')}</p>
             )}
           </div>
         )}

         {/* AI Tab */}
         {activeTab === 'ai' && (
           <div className="p-4">
             {activeFile?.fileId ? (
               <div className="space-y-2">
                 <button className="w-full rounded border border-white/8 bg-white/5 px-3 py-2 text-left text-xs text-gray-300 transition-colors hover:bg-white/8">
                   {t('Summarize this file')}
                 </button>
                 <button className="w-full rounded border border-white/8 bg-white/5 px-3 py-2 text-left text-xs text-gray-300 transition-colors hover:bg-white/8">
                   {t('Generate study prompts')}
                 </button>
                 <button className="w-full rounded border border-white/8 bg-white/5 px-3 py-2 text-left text-xs text-gray-300 transition-colors hover:bg-white/8">
                   {t('Find related notes')}
                 </button>
                 <p className="text-[11px] text-gray-600 pt-2">{t('Actions are scaffolded and ready for backend integration.')}</p>
               </div>
             ) : (
               <p className="text-xs text-gray-500">{t('Select a file to see AI actions.')}</p>
             )}
           </div>
         )}
      </div>
    </div>
  );
}
