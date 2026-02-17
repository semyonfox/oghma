'use client';

import { FC, useState, useRef, useEffect } from 'react';
import { EllipsisVerticalIcon } from '@heroicons/react/24/outline';
import { NoteModel } from '@/lib/notes/types/note';

interface EditorHeaderProps {
  note?: NoteModel;
  breadcrumbs?: string[];
  tags?: string[];
  onTitleChange?: (title: string) => void;
  onTagsChange?: (tags: string[]) => void;
  onAction?: (action: 'share' | 'export' | 'duplicate' | 'archive' | 'delete') => void;
}

/**
 * Header component for the editor showing:
 * - Breadcrumb navigation
 * - Editable title
 * - Tags
 * - Action menu (Share, Export, etc.)
 */
export const EditorHeader: FC<EditorHeaderProps> = ({
  note,
  breadcrumbs = [],
  tags = [],
  onTitleChange,
  onTagsChange,
  onAction,
}) => {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [title, setTitle] = useState(note?.title || 'Untitled Note');
  const [showTagInput, setShowTagInput] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTitle(note?.title || 'Untitled Note');
  }, [note?.title]);

  const handleTitleBlur = () => {
    setIsEditingTitle(false);
    if (title !== note?.title) {
      onTitleChange?.(title);
    }
  };

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const newTag = tagInput.trim().toLowerCase();
      if (newTag && !tags.includes(newTag)) {
        onTagsChange?.([...tags, newTag]);
        setTagInput('');
      }
    }
  };

  const handleRemoveTag = (tag: string) => {
    onTagsChange?.(tags.filter((t) => t !== tag));
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMenu]);

  return (
    <div className="border-b border-gray-700 bg-gray-800/50 backdrop-blur">
      {/* Breadcrumb */}
      {breadcrumbs.length > 0 && (
        <div className="px-4 py-2 text-xs text-gray-500 flex items-center gap-1">
          {breadcrumbs.map((crumb, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <span className="text-gray-600">/</span>}
              <button className="hover:text-gray-400 transition-colors">{crumb}</button>
            </span>
          ))}
        </div>
      )}

      {/* Title + Tags + Menu */}
      <div className="px-4 py-3">
        <div className="flex items-start justify-between gap-4">
          {/* Title */}
          <div className="flex-1 min-w-0">
            {isEditingTitle ? (
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={handleTitleBlur}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleTitleBlur();
                }}
                className="w-full bg-gray-700 text-white text-xl font-semibold rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            ) : (
              <h1
                onClick={() => setIsEditingTitle(true)}
                className="text-xl font-semibold text-white cursor-text hover:text-gray-100 transition-colors"
              >
                {title}
              </h1>
            )}

            {/* Tags */}
            <div className="flex flex-wrap gap-2 mt-2 items-center">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-600/20 text-indigo-300 rounded text-xs"
                >
                  {tag}
                  <button
                    onClick={() => handleRemoveTag(tag)}
                    className="hover:text-indigo-200 transition-colors"
                  >
                    ×
                  </button>
                </span>
              ))}
              {showTagInput ? (
                <input
                  autoFocus
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleAddTag}
                  onBlur={() => {
                    if (tagInput.trim()) {
                      const newTag = tagInput.trim().toLowerCase();
                      if (!tags.includes(newTag)) {
                        onTagsChange?.([...tags, newTag]);
                      }
                    }
                    setShowTagInput(false);
                    setTagInput('');
                  }}
                  placeholder="Add tag..."
                  className="px-2 py-1 bg-gray-700 text-white rounded text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 w-24"
                />
              ) : (
                <button
                  onClick={() => setShowTagInput(true)}
                  className="px-2 py-1 text-xs text-gray-400 hover:text-gray-300 transition-colors"
                >
                  + Add tag
                </button>
              )}
            </div>
          </div>

          {/* Action Menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-2 hover:bg-gray-700 rounded transition-colors"
              title="More actions"
            >
              <EllipsisVerticalIcon className="w-5 h-5 text-gray-400" />
            </button>

            {showMenu && (
              <div className="absolute right-0 mt-1 w-48 bg-gray-800 border border-gray-700 rounded shadow-lg z-50">
                <button
                  onClick={() => {
                    onAction?.('share');
                    setShowMenu(false);
                  }}
                  className="w-full px-4 py-2 text-sm text-left text-gray-300 hover:bg-gray-700 transition-colors"
                >
                  Share Note
                </button>
                <button
                  onClick={() => {
                    onAction?.('export');
                    setShowMenu(false);
                  }}
                  className="w-full px-4 py-2 text-sm text-left text-gray-300 hover:bg-gray-700 transition-colors"
                >
                  Export to PDF
                </button>
                <button
                  onClick={() => {
                    onAction?.('duplicate');
                    setShowMenu(false);
                  }}
                  className="w-full px-4 py-2 text-sm text-left text-gray-300 hover:bg-gray-700 transition-colors"
                >
                  Duplicate
                </button>
                <hr className="border-gray-700 my-1" />
                <button
                  onClick={() => {
                    onAction?.('archive');
                    setShowMenu(false);
                  }}
                  className="w-full px-4 py-2 text-sm text-left text-yellow-400 hover:bg-gray-700 transition-colors"
                >
                  Archive
                </button>
                <button
                  onClick={() => {
                    onAction?.('delete');
                    setShowMenu(false);
                  }}
                  className="w-full px-4 py-2 text-sm text-left text-red-400 hover:bg-gray-700 transition-colors"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
