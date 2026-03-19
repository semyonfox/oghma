'use client';

import { FC } from 'react';
import { NoteModel } from '@/lib/notes/types/note';
import useI18n from '@/lib/notes/hooks/use-i18n';

interface PropertiesPanelProps {
  note?: NoteModel;
  tags?: string[];
  onTagsChange?: (tags: string[]) => void;
  backlinks?: Array<{ id: string; title: string }>;
  outgoingLinks?: Array<{ id: string; title: string }>;
}

/**
 * Right panel showing note properties:
 * - Created/modified dates
 * - Tags
 * - Bidirectional links
 * - AI suggestions
 */
export const PropertiesPanel: FC<PropertiesPanelProps> = ({
  note,
  tags = [],
  onTagsChange,
  backlinks = [],
  outgoingLinks = [],
}) => {
  const { t } = useI18n();

  const formatDate = (date: Date | string | undefined) => {
    if (!date) return t('Unknown');
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="h-full bg-surface border-l border-border flex flex-col overflow-hidden">
      {/* Header */}
       <div className="px-4 py-3 border-b border-border">
         <h3 className="text-sm font-semibold text-text-secondary">{t('Properties')}</h3>
       </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-4 p-4">
           {/* Metadata */}
           <section>
             <h4 className="text-xs font-semibold text-text-tertiary uppercase mb-2">{t('Metadata')}</h4>
             <div className="space-y-1 text-xs">
               {note?.date && (
                 <div>
                    <span className="text-text-tertiary">{t('Last Updated')}:</span>
                   <div className="text-text-tertiary mt-0.5">{formatDate(note.date)}</div>
                 </div>
               )}
               {note?.id && (
                 <div>
                    <span className="text-text-tertiary">{t('ID')}:</span>
                   <div className="text-text-tertiary mt-0.5 font-mono text-xs">{note.id}</div>
                 </div>
               )}
             </div>
           </section>

           {/* Tags */}
           <section>
             <h4 className="text-xs font-semibold text-text-tertiary uppercase mb-2">{t('Tags')}</h4>
             {tags.length > 0 ? (
               <div className="flex flex-wrap gap-1">
                 {tags.map((tag) => (
                   <span
                     key={tag}
                     className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-600/20 text-indigo-300 rounded text-xs"
                   >
                     #{tag}
                     <button
                       onClick={() => onTagsChange?.(tags.filter((t) => t !== tag))}
                       className="hover:text-indigo-200 transition-colors ml-1"
                     >
                       ✕
                     </button>
                   </span>
                 ))}
               </div>
             ) : (
                <p className="text-xs text-text-tertiary">{t('No tags yet')}</p>
             )}
           </section>

           {/* Outgoing Links */}
           {outgoingLinks.length > 0 && (
             <section>
               <h4 className="text-xs font-semibold text-text-tertiary uppercase mb-2">
                  {t('Links')} ({outgoingLinks.length})
               </h4>
              <ul className="space-y-1">
                {outgoingLinks.map((link) => (
                  <li key={link.id}>
                    <a
                      href={`#${link.id}`}
                      className="text-xs text-blue-400 hover:text-blue-300 transition-colors block truncate"
                      title={link.title}
                    >
                      → {link.title}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}

           {/* Backlinks */}
           {backlinks.length > 0 && (
             <section>
               <h4 className="text-xs font-semibold text-text-tertiary uppercase mb-2">
                  {t('Backlinks')} ({backlinks.length})
               </h4>
              <ul className="space-y-1">
                {backlinks.map((link) => (
                  <li key={link.id}>
                    <a
                      href={`#${link.id}`}
                      className="text-xs text-green-400 hover:text-green-300 transition-colors block truncate"
                      title={link.title}
                    >
                      ← {link.title}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}

           {/* AI Suggestions */}
           <section className="pt-2 border-t border-border">
             <h4 className="text-xs font-semibold text-text-tertiary uppercase mb-2">{t('AI Suggestions')}</h4>
             <div className="space-y-2">
               <div className="px-3 py-2 bg-indigo-600/10 border border-indigo-600/20 rounded text-xs text-indigo-300">
                 <p className="mb-2">💡 {t('Consider adding more examples to strengthen understanding')}</p>
                 <button className="text-indigo-400 hover:text-indigo-200 text-xs font-medium">
                   {t('Apply')}
                 </button>
               </div>
               <div className="px-3 py-2 bg-indigo-600/10 border border-indigo-600/20 rounded text-xs text-indigo-300">
                 <p className="mb-2">💡 {t('This concept relates to "Data Structures"')}</p>
                 <button className="text-indigo-400 hover:text-indigo-200 text-xs font-medium">
                   {t('Create Link')}
                 </button>
               </div>
             </div>
           </section>
        </div>
      </div>
    </div>
  );
};

export default PropertiesPanel;
