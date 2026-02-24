'use client';

import { FC } from 'react';
import { CheckIcon, SparklesIcon } from '@heroicons/react/24/outline';

/**
 * Todo/task list panel
 * Shows daily review count and quick links
 */
const TodoTab: FC = () => {
  return (
    <div className="p-4 space-y-4">
      {/* Daily Summary */}
      <section>
        <h3 className="text-xs font-semibold text-gray-400 uppercase mb-3">Today's Tasks</h3>
        <div className="space-y-2">
          <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl font-bold text-indigo-400">3</span>
              <span className="text-sm text-gray-400">Flashcards due</span>
            </div>
            <p className="text-xs text-gray-500">Review in 5-10 minutes</p>
          </div>

          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl font-bold text-amber-400">1</span>
              <span className="text-sm text-gray-400">Quiz scheduled</span>
            </div>
            <p className="text-xs text-gray-500">20 minutes</p>
          </div>
        </div>
      </section>

      {/* Quick Actions */}
      <section>
        <h3 className="text-xs font-semibold text-gray-400 uppercase mb-3">Quick Actions</h3>
        <div className="space-y-2">
          <button className="w-full px-3 py-2 bg-white/5 hover:bg-white/10 rounded text-sm text-gray-300 transition-colors flex items-center gap-2">
            <CheckIcon className="w-4 h-4" />
            Start Review
          </button>
          <button className="w-full px-3 py-2 bg-white/5 hover:bg-white/10 rounded text-sm text-gray-300 transition-colors flex items-center gap-2">
            <SparklesIcon className="w-4 h-4" />
            Take Quiz
          </button>
        </div>
      </section>

      {/* Upcoming */}
      <section>
        <h3 className="text-xs font-semibold text-gray-400 uppercase mb-3">This Week</h3>
        <div className="space-y-2 text-xs">
          <div className="p-2 bg-gray-900 rounded border border-white/5">
            <p className="text-gray-300 font-medium">Math Midterm</p>
            <p className="text-gray-500">Due Friday</p>
          </div>
          <div className="p-2 bg-gray-900 rounded border border-white/5">
            <p className="text-gray-300 font-medium">CS Project Submission</p>
            <p className="text-gray-500">Due Sunday</p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default TodoTab;
