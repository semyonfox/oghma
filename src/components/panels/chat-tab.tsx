'use client';

import { FC, useState, useRef, useEffect } from 'react';
import { PaperAirplaneIcon, SparklesIcon } from '@heroicons/react/24/outline';
import useLayoutStore from '@/lib/notes/state/layout.zustand';
import useI18n from '@/lib/notes/hooks/use-i18n';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

/**
 * Chat tab - AI-powered chat interface
 * Currently shows placeholder UI, ready for RAG API integration
 */
const ChatTab: FC = () => {
  const { t } = useI18n();
  const { paneA } = useLayoutStore();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: t('Hi! I\'m your AI assistant. Ask me questions about your notes.'),
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // TODO: Call RAG API with context from paneA.fileId
      // For now, simulate a response
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `I understood your message: "${input}". RAG API integration coming soon.`,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Chat error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-surface">
      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-xs px-4 py-2 rounded-lg ${
                message.role === 'user'
                  ? 'bg-primary-600 text-text rounded-br-none'
                  : 'bg-surface-elevated text-text rounded-bl-none'
              }`}
            >
              <p className="text-sm">{message.content}</p>
              <p
                className={`text-xs mt-1 ${
                  message.role === 'user' ? 'text-primary-200' : 'text-text-tertiary'
                }`}
              >
                {new Date(message.timestamp).toLocaleTimeString()}
              </p>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-surface-elevated text-text px-4 py-2 rounded-lg rounded-bl-none">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-text-tertiary rounded-full animate-pulse" />
                <div className="w-2 h-2 bg-text-tertiary rounded-full animate-pulse delay-100" />
                <div className="w-2 h-2 bg-text-tertiary rounded-full animate-pulse delay-200" />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="flex-shrink-0 border-t border-border-subtle bg-background p-3">
        {/* Context Info */}
        {paneA?.fileId && (
          <div className="mb-3 px-3 py-2 bg-surface rounded text-xs text-text-tertiary flex items-center gap-2">
            <SparklesIcon className="w-3 h-3" />
            <span>{t('Analyzing')}: {paneA.title || t('Untitled')}</span>
          </div>
        )}

        {/* Input Field */}
         <div className="flex items-center gap-2">
           <input
             type="text"
             value={input}
             onChange={(e) => setInput(e.target.value)}
             onKeyPress={(e) => e.key === 'Enter' && handleSend()}
             placeholder={t('Ask about your notes...')}
             disabled={isLoading}
             className="flex-1 bg-surface border border-border-subtle rounded px-3 py-2 text-sm text-text-secondary placeholder:text-text-tertiary focus:outline-none focus:border-primary-500/50 disabled:opacity-50"
           />
           <button
             onClick={handleSend}
             disabled={isLoading || !input.trim()}
             className="p-2 bg-primary-500 hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed text-text rounded transition-colors"
             title={t('Send message (Enter)')}
           >
             <PaperAirplaneIcon className="w-4 h-4" />
           </button>
         </div>
      </div>
    </div>
  );
};

export default ChatTab;
