'use client';

import { FC } from 'react';
import useLayoutStore from '@/lib/notes/state/layout.zustand';
import { ChevronLeftIcon, CheckCircleIcon, ChatBubbleLeftIcon, LinkIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import TodoTab from './todo-tab';
import ChatTab from './chat-tab';
import PropertiesPanel from '@/components/editor/panels/properties-panel';

/**
 * Right panel with tabbed interface
 * Tabs: Todo | Chat | Links | Properties
 */
const RightPanelTabs: FC = () => {
  const { rightPanelTab, setRightPanelTab, toggleRightPanel } = useLayoutStore();

  const tabs: Array<{
    id: 'todo' | 'chat' | 'links' | 'properties';
    label: string;
    icon: FC<{ className?: string }>;
  }> = [
    { id: 'todo', label: 'Todo', icon: CheckCircleIcon },
    { id: 'chat', label: 'Chat', icon: ChatBubbleLeftIcon },
    { id: 'links', label: 'Links', icon: LinkIcon },
    { id: 'properties', label: 'Properties', icon: DocumentTextIcon },
  ];

  return (
    <div className="h-full flex flex-col bg-gray-800 overflow-hidden">
      {/* Tab Bar */}
      <div className="flex-shrink-0 flex items-center border-b border-white/10 bg-gray-900">
        <div className="flex-1 flex items-center gap-1 px-2">
          {tabs.map((tab) => {
            const IconComp = tab.icon;
            const isActive = rightPanelTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => setRightPanelTab(tab.id)}
                className={`
                  flex items-center gap-2 px-3 py-3 border-b-2 text-xs font-medium transition-colors
                  ${
                    isActive
                      ? 'border-indigo-500 text-white'
                      : 'border-transparent text-gray-400 hover:text-gray-300'
                  }
                `}
                title={tab.label}
              >
                <IconComp className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Close Button */}
        <button
          onClick={toggleRightPanel}
          className="p-2 text-gray-400 hover:text-gray-300 transition-colors"
          title="Close panel"
        >
          <ChevronLeftIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {rightPanelTab === 'todo' && <TodoTab />}
        {rightPanelTab === 'chat' && <ChatTab />}
        {rightPanelTab === 'links' && <div className="p-4 text-gray-400">Links panel coming soon</div>}
        {rightPanelTab === 'properties' && <PropertiesPanel />}
      </div>
    </div>
  );
};

export default RightPanelTabs;
