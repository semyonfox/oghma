// Lexical-based markdown editor replacement for @notea/rich-markdown-editor
import { FC, useEffect, useCallback, forwardRef, useImperativeHandle, useRef, useMemo } from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { HashtagPlugin } from '@lexical/react/LexicalHashtagPlugin';
import { 
  $convertToMarkdownString, 
  $convertFromMarkdownString, 
  TRANSFORMERS 
} from '@lexical/markdown';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { ListNode, ListItemNode } from '@lexical/list';
import { CodeNode, CodeHighlightNode } from '@lexical/code';
import { LinkNode } from '@lexical/link';
import { HashtagNode } from '@lexical/hashtag';
import { EditorState, $getRoot } from 'lexical';

export interface LexicalEditorProps {
  id?: string;
  value?: string;
  onChange?: (getValue: () => string) => void;
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
  theme?: Record<string, any>;
  onSearchLink?: (keyword: string) => Promise<any[]>;
  onCreateLink?: (title: string) => Promise<string>;
  onClickLink?: (href: string) => void;
  onHoverLink?: (event: MouseEvent | React.MouseEvent) => void | boolean;
  onUploadImage?: (file: File) => Promise<string>;
  onShowToast?: (message: string, type?: string) => void;
  dictionary?: Record<string, any>;
  tooltip?: FC<any>;
  extensions?: any[];
  embeds?: any[];
}

// plugin to sync content changes
function OnChangeContentPlugin({ 
  onChange 
}: { 
  onChange?: (getValue: () => string) => void 
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!onChange) return;

    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const markdown = $convertToMarkdownString(TRANSFORMERS);
        onChange(() => markdown);
      });
    });
  }, [editor, onChange]);

  return null;
}

// plugin to set initial content only on mount or note switch
// does NOT re-run on every value change (that would reset the cursor)
function InitialContentPlugin({ value, id }: { value?: string; id?: string }) {
  const [editor] = useLexicalComposerContext();
  const hasSetInitial = useRef(false);
  const prevId = useRef(id);

  useEffect(() => {
    // set content on first mount or when switching to a different note
    const isNewNote = prevId.current !== id;
    if (isNewNote) {
      prevId.current = id;
      hasSetInitial.current = false;
    }

    if (!hasSetInitial.current && value !== undefined) {
      hasSetInitial.current = true;
      editor.update(() => {
        $convertFromMarkdownString(value, TRANSFORMERS);
      });
    }
  }, [editor, value, id]);

  return null;
}

// plugin to handle readOnly state
function ReadOnlyPlugin({ readOnly }: { readOnly?: boolean }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    editor.setEditable(!readOnly);
  }, [editor, readOnly]);

  return null;
}

// plugin to handle link clicks
function LinkClickPlugin({ 
  onClickLink 
}: { 
  onClickLink?: (href: string) => void 
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!onClickLink) return;

    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === 'A') {
        const href = (target as HTMLAnchorElement).href;
        event.preventDefault();
        onClickLink(href);
      }
    };

    const editorElement = editor.getRootElement();
    if (editorElement) {
      editorElement.addEventListener('click', handleClick);
      return () => editorElement.removeEventListener('click', handleClick);
    }
  }, [editor, onClickLink]);

  return null;
}

// plugin to handle link hover
function LinkHoverPlugin({ 
  onHoverLink 
}: { 
  onHoverLink?: (event: MouseEvent | React.MouseEvent) => void | boolean 
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!onHoverLink) return;

    const handleMouseOver = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === 'A') {
        onHoverLink(event);
      }
    };

    const editorElement = editor.getRootElement();
    if (editorElement) {
      editorElement.addEventListener('mouseover', handleMouseOver);
      return () => editorElement.removeEventListener('mouseover', handleMouseOver);
    }
  }, [editor, onHoverLink]);

  return null;
}

// plugin to expose editor instance to parent via ref
function EditorRefPlugin({ 
  editorRef 
}: { 
  editorRef: React.MutableRefObject<any> 
}) {
  const [editor] = useLexicalComposerContext();
  
  useEffect(() => {
    editorRef.current = editor;
  }, [editor, editorRef]);

  return null;
}

export interface LexicalEditorRef {
  getEditor: () => any;
  props: LexicalEditorProps;
  focusAtEnd: () => void;
}

const LexicalEditor = forwardRef<LexicalEditorRef, LexicalEditorProps>(
  (
    {
      id,
      value = '',
      onChange,
      readOnly = false,
      placeholder = 'Start writing...',
      className = '',
      theme = {},
      onSearchLink,
      onCreateLink,
      onClickLink,
      onHoverLink,
      onUploadImage,
      onShowToast,
      dictionary,
      tooltip,
      extensions,
      embeds,
    },
    ref
  ) => {
    const editorInstanceRef = useRef<any>(null);
    
    // memoize config to avoid recreating on every render
    const initialConfig = useMemo(() => ({
      namespace: 'LexicalEditor',
      editable: !readOnly,
      theme: {
        ...theme,
        paragraph: 'editor-paragraph',
        heading: {
          h1: 'editor-heading-h1',
          h2: 'editor-heading-h2',
          h3: 'editor-heading-h3',
        },
        list: {
          ul: 'editor-list-ul',
          ol: 'editor-list-ol',
          listitem: 'editor-listitem',
        },
        link: 'editor-link',
        code: 'editor-code',
        quote: 'editor-quote',
      },
      nodes: [
        HeadingNode,
        QuoteNode,
        ListNode,
        ListItemNode,
        CodeNode,
        CodeHighlightNode,
        LinkNode,
        HashtagNode,
      ],
      onError: (error: Error) => {
        console.error('Lexical error:', error);
        if (onShowToast) {
          onShowToast('Editor error: ' + error.message, 'error');
        }
      },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [id, readOnly]);

    // expose editor instance via ref
    useImperativeHandle(ref, () => ({
      getEditor: () => {
        // return a minimal compatible interface
        return {
          props: {
            id,
            value,
            readOnly,
            // add other props as needed
          },
        };
      },
      props: {
        id,
        value,
        onChange,
        readOnly,
        placeholder,
        className,
        theme,
        onSearchLink,
        onCreateLink,
        onClickLink,
        onHoverLink,
        onUploadImage,
        onShowToast,
        dictionary,
        tooltip,
        extensions,
        embeds,
      },
      focusAtEnd: () => {
        const editor = editorInstanceRef.current;
        if (!editor) return;
        
        editor.update(() => {
          const root = $getRoot();
          const lastChild = root.getLastDescendant();
          
          if (lastChild) {
            lastChild.selectEnd();
          } else {
            root.selectEnd();
          }
        });
        
        // ensure the editor is focused
        editor.focus();
      },
    }));

     return (
        <LexicalComposer key={id} initialConfig={initialConfig}>
          <div className={`relative w-full ${className}`} dir="ltr">
            <RichTextPlugin
              contentEditable={
                <ContentEditable 
                  className="w-full text-gray-200 outline-none min-h-[300px] px-6 py-4 text-base leading-relaxed focus:outline-none"
                  dir="ltr"
                />
              }
             placeholder={
               <div className="absolute top-0 left-0 text-gray-600 pointer-events-none select-none px-6 py-4 text-base leading-relaxed">{placeholder}</div>
             }
            ErrorBoundary={LexicalErrorBoundary}
          />
          <HistoryPlugin />
          <LinkPlugin />
          <ListPlugin />
          <HashtagPlugin />
          <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
          <OnChangeContentPlugin onChange={onChange} />
          <InitialContentPlugin value={value} id={id} />
          <ReadOnlyPlugin readOnly={readOnly} />
          <EditorRefPlugin editorRef={editorInstanceRef} />
          {onClickLink && <LinkClickPlugin onClickLink={onClickLink} />}
          {onHoverLink && <LinkHoverPlugin onHoverLink={onHoverLink} />}
        </div>
      </LexicalComposer>
    );
  }
);

LexicalEditor.displayName = 'LexicalEditor';

export default LexicalEditor;
