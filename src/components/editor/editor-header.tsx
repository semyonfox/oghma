'use client';

import { FC, useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { EllipsisVerticalIcon, Cog6ToothIcon } from '@heroicons/react/24/outline';
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

  const handleTitleBlur = () => {
    setIsEditingTitle(false);
    if (title !== note?.title) {
      onTitleChange?.(title);
    }
  };

  const displayTitle = isEditingTitle ? title : (note?.title || 'Untitled Note');

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
    <div className="border-b border-gray-700 bg-gray-900 backdrop-blur">
      {/* Title + Breadcrumb + Menu in single row */}
      <div className="px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          {/* Breadcrumb */}
          {breadcrumbs.length > 0 && (
            <div className="text-[11px] text-gray-600 flex items-center gap-1">
              {breadcrumbs.map((crumb, i) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <span className="text-gray-700">/</span>}
                  <button className="hover:text-gray-500 transition-colors">{crumb}</button>
                </span>
              ))}
            </div>
          )}
          
          {/* Title */}
          {isEditingTitle ? (
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleTitleBlur}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleTitleBlur();
              }}
              className="w-full bg-gray-800 text-gray-100 text-lg font-medium rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          ) : (
            <h1
              onClick={() => {
                setTitle(note?.title || 'Untitled Note');
                setIsEditingTitle(true);
              }}
              className="text-lg font-medium text-gray-100 cursor-text hover:text-gray-200 transition-colors"
            >
              {displayTitle}
            </h1>
          )}
        </div>

         {/* Settings Link + Action Menu */}
         <div className="flex items-center gap-2 flex-shrink-0">
           {/* Settings Link */}
           <Link
             href="/settings"
             className="p-2 hover:bg-gray-800 rounded transition-colors text-gray-400 hover:text-gray-300"
             title="Editor settings"
           >
             <Cog6ToothIcon className="w-5 h-5" />
           </Link>

           {/* More Actions Menu */}
           <div className="relative" ref={menuRef}>
             <button
               onClick={() => setShowMenu(!showMenu)}
               className="p-2 hover:bg-gray-800 rounded transition-colors text-gray-400 hover:text-gray-300"
               title="More actions"
             >
               <EllipsisVerticalIcon className="w-5 h-5" />
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
              
              {/* Tags section in menu */}
              <hr className="border-gray-700 my-1" />
              <div className="px-4 py-2">
                <p className="text-xs uppercase tracking-widest text-gray-600 mb-2">Tags</p>
                <div className="flex flex-wrap gap-1 mb-2">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-white/5 text-gray-400 border border-white/8 rounded text-xs"
                    >
                      {tag}
                      <button
                        onClick={() => handleRemoveTag(tag)}
                        className="hover:text-gray-300 transition-colors"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
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
                    className="w-full px-2 py-1 bg-gray-700 text-white rounded text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                ) : (
                  <button
                    onClick={() => setShowTagInput(true)}
                    className="text-xs text-gray-500 hover:text-gray-400 transition-colors"
                  >
                    + Add tag
                  </button>
                )}
              </div>
              
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
