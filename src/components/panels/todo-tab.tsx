'use client';

import { FC } from 'react';
import { CheckIcon, SparklesIcon } from '@heroicons/react/24/outline';
import useI18n from '@/lib/notes/hooks/use-i18n';

/**
 * Todo/task list panel
 * Shows daily review count and quick links
 */
const TodoTab: FC = () => {
  const { t } = useI18n();
  return (
    <div className="p-4 space-y-4">
      {/* Daily Summary */}
       <section>
         <h3 className="text-xs font-semibold text-gray-400 uppercase mb-3">{t("Today's Tasks")}</h3>
         <div className="space-y-2">
           <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded">
             <div className="flex items-center gap-2 mb-1">
               <span className="text-2xl font-bold text-indigo-400">3</span>
               <span className="text-sm text-gray-400">{t('Flashcards due')}</span>
             </div>
             <p className="text-xs text-gray-500">{t('Review in 5-10 minutes')}</p>
           </div>

           <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded">
             <div className="flex items-center gap-2 mb-1">
               <span className="text-2xl font-bold text-amber-400">1</span>
               <span className="text-sm text-gray-400">{t('Quiz scheduled')}</span>
             </div>
             <p className="text-xs text-gray-500">20 {t('minutes')}</p>
           </div>
         </div>
       </section>

       {/* Quick Actions */}
       <section>
         <h3 className="text-xs font-semibold text-gray-400 uppercase mb-3">{t('Quick Actions')}</h3>
         <div className="space-y-2">
           <button className="w-full px-3 py-2 bg-white/5 hover:bg-white/10 rounded text-sm text-gray-300 transition-colors flex items-center gap-2">
             <CheckIcon className="w-4 h-4" />
             {t('Start Review')}
           </button>
           <button className="w-full px-3 py-2 bg-white/5 hover:bg-white/10 rounded text-sm text-gray-300 transition-colors flex items-center gap-2">
             <SparklesIcon className="w-4 h-4" />
             {t('Take Quiz')}
           </button>
         </div>
       </section>

       {/* Upcoming */}
       <section>
         <h3 className="text-xs font-semibold text-gray-400 uppercase mb-3">{t('This Week')}</h3>
         <div className="space-y-2 text-xs">
           <div className="p-2 bg-gray-900 rounded border border-white/5">
             <p className="text-gray-300 font-medium">{t('Math Midterm')}</p>
             <p className="text-gray-500">{t('Due Friday')}</p>
           </div>
           <div className="p-2 bg-gray-900 rounded border border-white/5">
             <p className="text-gray-300 font-medium">{t('CS Project Submission')}</p>
             <p className="text-gray-500">{t('Due Sunday')}</p>
           </div>
         </div>
       </section>
    </div>
  );
};

export default TodoTab;
