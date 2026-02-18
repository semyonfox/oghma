'use client';

import { FC } from 'react';
import {
  SparklesIcon,
  DocumentMagnifyingGlassIcon,
  LightBulbIcon,
  LinkIcon,
} from '@heroicons/react/24/outline';
import { Heading } from '@/components/catalyst/heading';
import { Text } from '@/components/catalyst/text';

export interface AIToolsSectionProps {
  noteId?: string | null;
}

interface AITool {
  id: string;
  label: string;
  icon: typeof SparklesIcon;
  description: string;
  coming?: boolean;
}

export const AIToolsSection: FC<AIToolsSectionProps> = ({ noteId }) => {
  const tools: AITool[] = [
    {
      id: 'insights',
      label: 'Insights',
      icon: SparklesIcon,
      description: 'Generate AI-powered insights',
      coming: true,
    },
    {
      id: 'summary',
      label: 'Summary',
      icon: DocumentMagnifyingGlassIcon,
      description: 'Summarize this note',
      coming: true,
    },
    {
      id: 'questions',
      label: 'Questions',
      icon: LightBulbIcon,
      description: 'Generate study questions',
      coming: true,
    },
    {
      id: 'related',
      label: 'Related Notes',
      icon: LinkIcon,
      description: 'Find related notes',
      coming: true,
    },
  ];

  const handleToolClick = (toolId: string) => {
    if (!noteId) {
      console.warn('No note selected');
      return;
    }
    console.log(`Tool ${toolId} clicked for note ${noteId}`);
  };

  return (
    <div className="pb-4 border-b border-slate-700 last:border-b-0">
      <Heading level={4} className="text-sm font-semibold text-slate-300 mb-3">
        AI Tools
      </Heading>
      <div className="space-y-3">
        {tools.map((tool) => {
          const Icon = tool.icon;
          return (
            <button
              key={tool.id}
              onClick={() => handleToolClick(tool.id)}
              disabled={tool.coming}
              title={tool.coming ? 'Coming soon' : tool.label}
              className={`w-full px-3 py-2 rounded flex items-center gap-2 transition-colors duration-200 text-left ${
                tool.coming
                  ? 'opacity-50 cursor-not-allowed bg-white/5 text-slate-500 hover:bg-white/5'
                  : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-300'
              }`}
            >
              <Icon className="w-4 h-4 text-slate-600 flex-shrink-0" />
              <div className="text-left flex-1">
                <Text className="text-xs font-medium text-slate-300">{tool.label}</Text>
                <Text className="text-xs text-slate-500">{tool.description}</Text>
              </div>
              {tool.coming && (
                <div className="ml-auto text-xs px-1.5 py-0.5 bg-white/5 rounded text-slate-600 flex-shrink-0">
                  Soon
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default AIToolsSection;
