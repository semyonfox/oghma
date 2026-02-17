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
    <div className="ai-section ai-section:last-of-type">
      <Heading level={4} className="ai-section-title">
        AI Tools
      </Heading>
      <div className="ai-section-content">
        {tools.map((tool) => {
          const Icon = tool.icon;
          return (
            <button
              key={tool.id}
              onClick={() => handleToolClick(tool.id)}
              disabled={tool.coming}
              title={tool.coming ? 'Coming soon' : tool.label}
              className={`ai-tool-button ${
                tool.coming
                  ? 'opacity-60 cursor-not-allowed'
                  : 'ai-tool-button-active'
              }`}
            >
              <Icon className="w-4 h-4 text-text-tertiary flex-shrink-0" />
              <div className="text-left flex-1">
                <Text className="text-xs font-medium text-text">{tool.label}</Text>
                <Text className="text-xs text-text-secondary">{tool.description}</Text>
              </div>
              {tool.coming && (
                <div className="ml-auto text-xs px-1.5 py-0.5 bg-white/5 rounded text-text-tertiary flex-shrink-0">
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
