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
    <div className="mt-6 pt-4 border-t border-border">
      <Heading level={4} className="text-xs font-semibold mb-3 text-text">
        AI Tools
      </Heading>
      <div className="space-y-2">
        {tools.map((tool) => {
          const Icon = tool.icon;
          return (
            <button
              key={tool.id}
              onClick={() => handleToolClick(tool.id)}
              disabled={tool.coming}
              title={tool.coming ? 'Coming soon' : tool.label}
              className={`w-full flex items-start gap-3 p-2.5 rounded-lg transition-colors duration-200 ${
                tool.coming
                  ? 'opacity-60 cursor-not-allowed bg-transparent hover:bg-surface-hover/50'
                  : 'hover:bg-surface-hover active:bg-primary/10'
              }`}
            >
              <Icon className="w-4 h-4 text-text-secondary flex-shrink-0 mt-0.5" />
              <div className="text-left">
                <Text className="text-xs font-medium text-text">{tool.label}</Text>
                <Text className="text-xs text-text-tertiary">{tool.description}</Text>
              </div>
              {tool.coming && (
                <div className="ml-auto text-xs px-1.5 py-0.5 bg-background rounded text-text-tertiary flex-shrink-0">
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
