// Shared in-memory storage for mock data
// This will be replaced with S3 storage in production

import { NoteModel } from '@/lib/notes/types/note';
import { TreeModel, ROOT_ID } from '@/lib/notes/types/tree';
import { NOTE_DELETED, NOTE_PINNED, NOTE_SHARED, EDITOR_SIZE } from '@/lib/notes/types/meta';

// Notes storage
export const MOCK_NOTES_STORAGE = new Map<string, NoteModel>();

// Tree structure storage
export let MOCK_TREE_STORAGE: TreeModel = {
  rootId: ROOT_ID,
  items: {},
};

// Helper to create note data
const createNote = (
  id: string,
  title: string,
  content: string,
  pid?: string
): NoteModel => ({
  id,
  title,
  content,
  deleted: NOTE_DELETED.NORMAL,
  pinned: NOTE_PINNED.UNPINNED,
  shared: NOTE_SHARED.PRIVATE,
  editorsize: EDITOR_SIZE.LARGE,
  pid,
});

// Initialize with mock data
const INITIAL_NOTES: Record<string, NoteModel> = {
  'root': createNote(
    'root',
    'My Notes',
    '# My Notes\n\nWelcome to your note collection.'
  ),
  'welcome': createNote(
    'welcome',
    'Welcome to OghmaNotes',
    '# Welcome to OghmaNotes\n\nThis is your personal note-taking application.\n\n## Features\n\n- **Markdown editing** with live preview\n- **Hierarchical notes** organized in folders\n- **Search** across all your notes\n\n## Getting Started\n\nClick on a note in the sidebar to start editing, or create a new note using the + button.'
  ),
  'projects': createNote(
    'projects',
    '📁 Projects',
    '# Projects\n\nThis folder contains all my project notes.'
  ),
  'project-overview': createNote(
    'project-overview',
    'Project Overview',
    '# Project Overview\n\n## Goals\n\n1. Build a modern note-taking application\n2. Support markdown editing\n3. Enable hierarchical organization\n\n## Tech Stack\n\n- Next.js 16\n- React 19\n- Lexical Editor\n- PostgreSQL + S3 storage\n\n## Timeline\n\n- **Phase 1**: Core UI and editing (current)\n- **Phase 2**: Storage and persistence\n- **Phase 3**: Search and sharing',
    'projects'
  ),
  'research': createNote(
    'research',
    '📁 Research',
    '# Research\n\nMy research notes and findings.',
    'projects'
  ),
  'deep-note': createNote(
    'deep-note',
    'Deep Research Notes',
    '# Deep Research Notes\n\n## Literature Review\n\nKey findings from recent papers:\n\n- **Smith et al. (2024)**: Modern note-taking systems benefit from WYSIWYG markdown editors\n- **Jones (2023)**: Hierarchical organization improves note retrieval by 40%\n\n## Ideas\n\n- Implement backlinks for connected notes\n- Add graph view to visualize relationships\n- Support embedding images and files\n\n## Next Steps\n\n- [ ] Read 3 more papers\n- [ ] Prototype graph view\n- [ ] Test with users',
    'research'
  ),
};

// Initialize tree structure
const INITIAL_TREE: TreeModel = {
  rootId: ROOT_ID,
  items: {
    [ROOT_ID]: {
      id: ROOT_ID,
      children: ['welcome', 'projects'],
    },
    'welcome': {
      id: 'welcome',
      children: [],
      data: INITIAL_NOTES['welcome'],
    },
    'projects': {
      id: 'projects',
      children: ['project-overview', 'research'],
      data: INITIAL_NOTES['projects'],
    },
    'project-overview': {
      id: 'project-overview',
      children: [],
      data: INITIAL_NOTES['project-overview'],
    },
    'research': {
      id: 'research',
      children: ['deep-note'],
      data: INITIAL_NOTES['research'],
    },
    'deep-note': {
      id: 'deep-note',
      children: [],
      data: INITIAL_NOTES['deep-note'],
    },
  },
};

// Initialize storage if empty
if (MOCK_NOTES_STORAGE.size === 0) {
  Object.values(INITIAL_NOTES).forEach(note => {
    MOCK_NOTES_STORAGE.set(note.id, note);
  });
  MOCK_TREE_STORAGE = INITIAL_TREE;
}

// Helper to sync tree with notes storage
export const syncTreeWithNotes = () => {
  // Update tree items with latest note data from storage
  Object.keys(MOCK_TREE_STORAGE.items).forEach(id => {
    if (id !== ROOT_ID) {
      const note = MOCK_NOTES_STORAGE.get(id);
      if (note) {
        MOCK_TREE_STORAGE.items[id].data = note;
      }
    }
  });
};

// Helper to add note to tree
export const addNoteToTree = (noteId: string, parentId?: string) => {
  const note = MOCK_NOTES_STORAGE.get(noteId);
  if (!note) return;

  // Add to tree items
  MOCK_TREE_STORAGE.items[noteId] = {
    id: noteId,
    children: [],
    data: note,
  };

  // Add to parent's children
  const pid = parentId || note.pid || ROOT_ID;
  if (MOCK_TREE_STORAGE.items[pid]) {
    if (!MOCK_TREE_STORAGE.items[pid].children.includes(noteId)) {
      MOCK_TREE_STORAGE.items[pid].children.push(noteId);
    }
  }
};

// Helper to remove note from tree
export const removeNoteFromTree = (noteId: string) => {
  const item = MOCK_TREE_STORAGE.items[noteId];
  if (!item) return;

  // Remove from parent's children
  const parentId = item.data?.pid || ROOT_ID;
  if (MOCK_TREE_STORAGE.items[parentId]) {
    MOCK_TREE_STORAGE.items[parentId].children =
      MOCK_TREE_STORAGE.items[parentId].children.filter(id => id !== noteId);
  }

  // Remove item and its children recursively
  const removeRecursive = (id: string) => {
    const item = MOCK_TREE_STORAGE.items[id];
    if (item) {
      item.children.forEach(childId => removeRecursive(childId));
      delete MOCK_TREE_STORAGE.items[id];
    }
  };
  removeRecursive(noteId);
};
