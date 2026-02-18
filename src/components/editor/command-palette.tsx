'use client';

import { FC, useState, useEffect, useMemo, useRef } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useShortcut } from '@/lib/notes/hooks/use-keyboard-shortcut';

interface CommandItem {
  id: string;
  title: string;
  description?: string;
  category: 'command' | 'note' | 'recent';
  icon?: string;
  action?: () => void;
}

interface CommandPaletteProps {
  isOpen?: boolean;
  onClose?: () => void;
  notes?: Array<{ id: string; title: string }>;
  onNoteSelect?: (noteId: string) => void;
}

/**
 * Command palette component activated with Cmd+K (Mac) or Ctrl+K (Windows/Linux)
 * Provides fuzzy search over commands, notes, and recent items
 */
export const CommandPalette: FC<CommandPaletteProps> = ({
  isOpen: controlledIsOpen = false,
  onClose,
  notes = [],
  onNoteSelect,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Built-in commands
  const commands: CommandItem[] = useMemo(
    () => [
      {
        id: 'new-note',
        title: 'Create New Note',
        description: 'Start a fresh note',
        category: 'command',
        icon: '📝',
        action: () => {
          console.log('Create new note');
          onClose?.();
        },
      },
      {
        id: 'new-folder',
        title: 'Create New Folder',
        description: 'Organize your notes',
        category: 'command',
        icon: '📁',
        action: () => {
          console.log('Create new folder');
          onClose?.();
        },
      },
      {
        id: 'search-notes',
        title: 'Search Notes',
        description: 'Find notes by content',
        category: 'command',
        icon: '🔍',
        action: () => {
          console.log('Search notes');
          onClose?.();
        },
      },
      {
        id: 'generate-quiz',
        title: 'Generate Quiz',
        description: 'Create practice questions',
        category: 'command',
        icon: '📋',
        action: () => {
          console.log('Generate quiz');
          onClose?.();
        },
      },
      {
        id: 'export-note',
        title: 'Export Note',
        description: 'Save as PDF or HTML',
        category: 'command',
        icon: '📤',
        action: () => {
          console.log('Export note');
          onClose?.();
        },
      },
      {
        id: 'settings',
        title: 'Settings',
        description: 'Open preferences',
        category: 'command',
        icon: '⚙️',
        action: () => {
          console.log('Open settings');
          onClose?.();
        },
      },
    ],
    [onClose]
  );

  // Convert notes to command items
  const noteItems: CommandItem[] = useMemo(
    () =>
      notes.map((note) => ({
        id: note.id,
        title: note.title,
        category: 'note' as const,
        action: () => {
          onNoteSelect?.(note.id);
          onClose?.();
        },
      })),
    [notes, onNoteSelect, onClose]
  );

  // Fuzzy search filter
  const filteredItems = useMemo(() => {
    if (!query.trim()) {
      // Show recent items when empty
      return [
        ...commands.slice(0, 3), // Show top commands
        ...(noteItems.length > 0 ? [noteItems[0]] : []), // Show first note
      ];
    }

    const searchQuery = query.toLowerCase();
    const scored = [
      ...commands,
      ...noteItems,
    ].map((item) => {
      const titleLower = item.title.toLowerCase();
      const descLower = item.description?.toLowerCase() || '';

      // Exact match = highest score
      if (titleLower === searchQuery) return { ...item, score: 100 };

      // Starts with query = high score
      if (titleLower.startsWith(searchQuery)) return { ...item, score: 50 };

      // Contains query = medium score
      if (titleLower.includes(searchQuery)) return { ...item, score: 25 };
      if (descLower.includes(searchQuery)) return { ...item, score: 10 };

      // No match
      return { ...item, score: 0 };
    });

    return scored
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20); // Limit to 20 results
  }, [query, commands, noteItems]);

  // Register keyboard shortcut (Cmd+K) - just open/close, don't toggle local state
  useShortcut({
    key: 'k',
    meta: true,
    handler: () => {
      if (controlledIsOpen) {
        onClose?.();
      }
      // If closed, parent will handle opening via onClick on search input
    },
  });

  // Handle keyboard navigation
  useEffect(() => {
    if (!controlledIsOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(0, prev - 1));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(filteredItems.length - 1, prev + 1));
          break;
        case 'Enter':
          e.preventDefault();
          if (filteredItems[selectedIndex]) {
            filteredItems[selectedIndex].action?.();
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose?.();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [controlledIsOpen, selectedIndex, filteredItems, onClose]);

  // Auto-focus input when opened
  useEffect(() => {
    if (controlledIsOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [controlledIsOpen]);

  // Reset query when palette closes
  useEffect(() => {
    if (!controlledIsOpen) {
      setQuery('');
      setSelectedIndex(0);
    }
  }, [controlledIsOpen]);

  if (!controlledIsOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-2xl mx-auto">
        {/* Input field */}
        <div className="relative bg-gray-800 border border-gray-700 rounded-lg shadow-2xl overflow-hidden">
          <div className="flex items-center px-4 py-3">
            <span className="text-gray-500">🔍</span>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedIndex(0);
              }}
              placeholder="Search commands, notes, or actions..."
              className="flex-1 bg-transparent text-white ml-3 focus:outline-none"
            />
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-400 transition-colors"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Results */}
          {filteredItems.length > 0 ? (
            <div className="border-t border-gray-700 max-h-96 overflow-y-auto">
              {filteredItems.map((item, idx) => (
                <button
                  key={item.id}
                  onClick={() => {
                    item.action?.();
                  }}
                  className={`w-full px-4 py-3 text-left transition-colors border-b border-gray-800 last:border-b-0 ${
                    idx === selectedIndex
                      ? 'bg-indigo-600/20 text-indigo-300'
                      : 'text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {item.icon && <span className="text-lg">{item.icon}</span>}
                    <div className="flex-1">
                      <div className="font-medium text-white">{item.title}</div>
                      {item.description && (
                        <div className="text-xs text-gray-500">{item.description}</div>
                      )}
                    </div>
                    <span className="text-xs text-gray-600 bg-gray-700/50 px-2 py-1 rounded">
                      {item.category}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          ) : query.trim() ? (
            <div className="px-4 py-8 text-center text-gray-500">
              <p>No commands or notes found for "{query}"</p>
              <p className="text-xs mt-2">Try a different search term</p>
            </div>
          ) : null}

          {/* Help text */}
          <div className="border-t border-gray-700 px-4 py-2 bg-gray-900/50 text-xs text-gray-600">
            <span>↑ ↓ to navigate</span>
            <span className="ml-4">Enter to select</span>
            <span className="ml-4">Esc to close</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
