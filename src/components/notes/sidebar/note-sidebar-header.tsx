// Notes Sidebar Header - Logo + New Note + Collapse Toggle
import { PlusIcon, ChevronDoubleLeftIcon } from '@heroicons/react/24/outline';
import { useRouter } from 'next/navigation';
import React, { FC, useCallback, useState } from 'react';
import useUIComposite from '@/lib/notes/state/ui';
import useNoteStore from '@/lib/notes/state/note';
import useNoteTreeStore from '@/lib/notes/state/tree';
import CreateNoteModal from '@/components/notes/create-note-modal';

interface NoteSidebarHeaderProps {
  onToggleSidebar?: () => void;
}

const NoteSidebarHeader: FC<NoteSidebarHeaderProps> = ({ onToggleSidebar }) => {
  const router = useRouter();
  const { sidebar } = useUIComposite();
  const { genNewId } = useNoteTreeStore();
  const { createNote, createFolder } = useNoteStore();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleCreateNote = useCallback(
    async (title: string, language: string) => {
      const newNote = await createNote({
        title: title,
        content: '\n',
        pid: undefined,
      });

      if (newNote) {
        router.push(`/notes/${newNote.id}`);
      }
    },
    [createNote, router]
  );

  const handleUploadFile = useCallback(async (file: File) => {
    const noteId = genNewId();
    const fileName = file.name || 'Untitled';
    const ext = fileName.split('.').pop()?.toLowerCase() ?? '';

    // determine file type for the renderer
    let fileType: 'note' | 'pdf' | 'image' | 'video' = 'note';
    if (ext === 'pdf') fileType = 'pdf';
    else if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp'].includes(ext)) fileType = 'image';
    else if (['mp4', 'webm', 'ogg', 'mov'].includes(ext)) fileType = 'video';

    // upload file to S3 via the upload API
    const formData = new FormData();
    formData.append('file', file);
    formData.append('noteId', noteId);

    const uploadRes = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });

    if (!uploadRes.ok) {
      console.error('Upload failed:', await uploadRes.text());
      return;
    }

    const uploadData = await uploadRes.json();

    // create a note record so it appears in the tree
    // for non-markdown files, store the S3 path as content so the viewer can retrieve it
    const content = fileType === 'note'
      ? (await file.text())
      : uploadData.path;

    const newNote = await createNote({
      id: noteId,
      title: fileName,
      content,
    });

    if (newNote) {
      router.push(`/notes/${newNote.id}`);
    }
  }, [genNewId, createNote, router]);

  const handleCreateFolder = useCallback(
    async () => {
      await createFolder(undefined);
    },
    [createFolder]
  );

  return (
    <>
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white">📝 Notes</span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {/* New Note Button */}
          <button
            onClick={() => setIsModalOpen(true)}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-white/5 rounded transition-colors"
            title="Create new note or upload file"
            aria-label="Create new note or upload file"
          >
            <PlusIcon className="w-5 h-5" />
          </button>

          {/* Collapse Toggle */}
          <button
            onClick={onToggleSidebar}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-white/5 rounded transition-colors"
            title="Collapse sidebar"
            aria-label="Toggle sidebar"
          >
            <ChevronDoubleLeftIcon
              className={`w-5 h-5 transition-transform ${sidebar?.isFold ? 'rotate-180' : ''}`}
            />
          </button>
        </div>
      </div>

      <CreateNoteModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreateNote={handleCreateNote}
        onCreateFolder={handleCreateFolder}
        onUploadFile={handleUploadFile}
      />
    </>
  );
};

export default React.memo(NoteSidebarHeader);
