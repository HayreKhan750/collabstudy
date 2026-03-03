'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion, PanInfo } from 'framer-motion';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface AIAssistantPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const STORAGE_KEY = 'collabstudy_ai_chat_history';
const BUTTON_POSITION_KEY = 'collabstudy_ai_button_position';

export default function AIAssistantPanelPremium({ isOpen, onClose }: AIAssistantPanelProps) {
  const { token } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Draggable button position state
  const [buttonPosition, setButtonPosition] = useState({ x: 0, y: 0 });

  // Load button position from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(BUTTON_POSITION_KEY);
      if (stored) {
        setButtonPosition(JSON.parse(stored));
      }
    } catch (err) {
      console.error('Failed to load button position:', err);
    }
  }, []);

  // Save button position to localStorage
  const saveButtonPosition = (x: number, y: number) => {
    try {
      localStorage.setItem(BUTTON_POSITION_KEY, JSON.stringify({ x, y }));
    } catch (err) {
      console.error('Failed to save button position:', err);
    }
  };

  // Load chat history from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setMessages(parsed);
      }
    } catch (err) {
      console.error('Failed to load chat history:', err);
    }
  }, []);

  // Save chat history to localStorage whenever it changes
  useEffect(() => {
    if (messages.length > 0) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
      } catch (err) {
        console.error('Failed to save chat history:', err);
      }
    }
  }, [messages]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading || !token) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: input.trim(),
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setError(null);
    setStreamingContent('');

    // Create abort controller for this request
    abortControllerRef.current = new AbortController();

    try {
      // Get AI service URL
      const aiServiceUrl = process.env.NEXT_PUBLIC_AI_SERVICE_URL || 'https://collabstudyai-production.up.railway.app';
      
      // Format history for API (last 20 messages)
      const history = messages.slice(-20).map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      const response = await fetch(`${aiServiceUrl}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage.content,
          history,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(errorData.detail || `AI service error: ${response.status}`);
      }

      // Handle SSE streaming
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

      if (!reader) throw new Error('Response body is not readable');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.error) {
                throw new Error(data.error);
              } else if (data.done) {
                // Streaming complete
                const assistantMessage: ChatMessage = {
                  role: 'assistant',
                  content: fullContent,
                  timestamp: Date.now(),
                };
                setMessages((prev) => [...prev, assistantMessage]);
                setStreamingContent('');
              } else if (data.chunk) {
                // Append chunk to streaming content
                fullContent += data.chunk;
                setStreamingContent(fullContent);
              }
            } catch (parseErr) {
              console.error('Failed to parse SSE data:', parseErr);
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('Request aborted');
        return;
      }
      const errorMessage = err instanceof Error ? err.message : 'Failed to get AI response';
      setError(errorMessage);
      console.error('AI chat error:', err);
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const clearHistory = () => {
    setMessages([]);
    localStorage.removeItem(STORAGE_KEY);
  };

  const handleDragEnd = (event: any, info: PanInfo) => {
    const newX = buttonPosition.x + info.offset.x;
    const newY = buttonPosition.y + info.offset.y;
    
    // Get viewport dimensions
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const buttonSize = 56; // 14 * 4 (w-14 h-14 in Tailwind)

    // Constrain to viewport with padding
    const padding = 16;
    const constrainedX = Math.max(padding - viewportWidth / 2 + buttonSize / 2, Math.min(newX, viewportWidth / 2 - buttonSize / 2 - padding));
    const constrainedY = Math.max(padding - viewportHeight / 2 + buttonSize / 2, Math.min(newY, viewportHeight / 2 - buttonSize / 2 - padding));

    setButtonPosition({ x: constrainedX, y: constrainedY });
    saveButtonPosition(constrainedX, constrainedY);
  };

  if (!isOpen) {
    // Draggable floating button
    return (
      <motion.button
        drag
        dragMomentum={false}
        dragElastic={0}
        dragConstraints={{
          left: -window.innerWidth / 2 + 40,
          right: window.innerWidth / 2 - 40,
          top: -window.innerHeight / 2 + 40,
          bottom: window.innerHeight / 2 - 40,
        }}
        onDragEnd={handleDragEnd}
        initial={buttonPosition}
        animate={buttonPosition}
        onClick={onClose}
        className="fixed bottom-6 right-6 w-14 h-14 bg-gradient-to-br from-purple-600 via-purple-500 to-blue-600 hover:from-purple-700 hover:via-purple-600 hover:to-blue-700 text-white rounded-full shadow-2xl hover:shadow-purple-500/50 transition-all duration-300 flex items-center justify-center z-50 group cursor-move"
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        aria-label="Open AI Study Tutor"
      >
        <span className="text-2xl group-hover:scale-110 transition-transform duration-300 select-none">✨</span>
        <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full animate-pulse border-2 border-white" />
      </motion.button>
    );
  }

  return (
    <>
      {/* Backdrop with blur */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-md z-40"
        onClick={onClose}
      />

      {/* Premium Glassmorphism Panel */}
      <motion.div
        initial={{ x: '100%', opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="fixed right-0 top-0 h-full w-full sm:w-[520px] bg-white/10 dark:bg-[#0B0F19]/60 backdrop-blur-2xl border-l border-white/10 shadow-2xl z-50 flex flex-col"
      >
        {/* Premium Header with Glassmorphism */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/10 bg-gradient-to-r from-purple-600/20 via-purple-500/20 to-blue-600/20 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center shadow-lg shadow-purple-500/30">
              <span className="text-2xl">✨</span>
            </div>
            <div>
              <h2 className="text-lg font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
                AI Study Tutor
              </h2>
              <p className="text-xs text-white/60">Powered by Gemini 2.5 Flash</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2.5 rounded-xl hover:bg-white/10 transition-colors text-white/80 hover:text-white"
            aria-label="Close AI Assistant"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Messages - Premium Scroll */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
          {messages.length === 0 && !streamingContent ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.1 }}
                className="w-24 h-24 rounded-3xl bg-gradient-to-br from-purple-600/20 to-blue-600/20 backdrop-blur-xl border border-white/10 flex items-center justify-center mb-6 shadow-xl"
              >
                <span className="text-5xl">🎓</span>
              </motion.div>
              <h3 className="text-xl font-bold text-white mb-3">
                Welcome to your AI Study Tutor!
              </h3>
              <p className="text-sm text-white/60 max-w-sm mb-8">
                Ask me anything about your studies, coding problems, or complex topics. I'm here to help you learn!
              </p>
              <div className="grid grid-cols-1 gap-3 w-full max-w-sm">
                {[
                  { emoji: '💡', text: 'Explain quantum entanglement', prompt: 'Explain quantum entanglement in simple terms' },
                  { emoji: '🐛', text: 'Debug Python code', prompt: 'Help me debug this Python function' },
                  { emoji: '📚', text: 'Study tips & habits', prompt: 'How can I improve my study habits?' },
                ].map((item, idx) => (
                  <motion.button
                    key={idx}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 + idx * 0.1 }}
                    onClick={() => setInput(item.prompt)}
                    className="text-left px-4 py-3.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all duration-200 text-sm text-white/80 hover:text-white flex items-center gap-3 group"
                  >
                    <span className="text-xl group-hover:scale-110 transition-transform">{item.emoji}</span>
                    <span>{item.text}</span>
                  </motion.button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-5 py-3.5 ${
                      msg.role === 'user'
                        ? 'bg-gradient-to-br from-purple-600/90 to-blue-600/90 text-white shadow-lg shadow-purple-500/20'
                        : 'bg-white/10 backdrop-blur-xl border border-white/10 text-white shadow-lg'
                    }`}
                  >
                    {msg.role === 'assistant' ? (
                      <div className="prose prose-sm prose-invert max-w-none">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            code({ inline, className, children, ...props }: any) {
                              return !inline ? (
                                <pre className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-xl p-4 overflow-x-auto my-3 shadow-inner">
                                  <code className={className} {...props}>
                                    {children}
                                  </code>
                                </pre>
                              ) : (
                                <code className="bg-white/10 px-2 py-0.5 rounded-lg text-sm border border-white/10" {...props}>
                                  {children}
                                </code>
                              );
                            },
                            p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
                            ul: ({ children }) => <ul className="space-y-1 my-2">{children}</ul>,
                            ol: ({ children }) => <ol className="space-y-1 my-2">{children}</ol>,
                            li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                          }}
                        >
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    )}
                  </div>
                </motion.div>
              ))}
              {streamingContent && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex justify-start"
                >
                  <div className="max-w-[85%] rounded-2xl px-5 py-3.5 bg-white/10 backdrop-blur-xl border border-white/10 text-white shadow-lg">
                    <div className="prose prose-sm prose-invert max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {streamingContent}
                      </ReactMarkdown>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <div className="flex gap-1">
                        <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
              {isLoading && !streamingContent && (
                <div className="flex justify-start">
                  <div className="rounded-2xl px-5 py-3.5 bg-white/5 backdrop-blur-xl border border-white/10">
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                      <span className="text-xs text-white/50">AI is thinking...</span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Error */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="px-6 py-3 bg-red-500/10 backdrop-blur-xl border-t border-red-500/20"
          >
            <p className="text-sm text-red-400">❌ {error}</p>
          </motion.div>
        )}

        {/* Premium Input Area */}
        <div className="border-t border-white/10 px-6 py-5 bg-white/5 backdrop-blur-xl">
          {messages.length > 0 && (
            <button
              onClick={clearHistory}
              className="text-xs text-white/50 hover:text-white/80 mb-3 flex items-center gap-1.5 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Clear conversation
            </button>
          )}
          <div className="flex gap-3">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask me anything..."
              disabled={isLoading}
              rows={1}
              className="flex-1 resize-none rounded-xl px-4 py-3.5 bg-white/5 backdrop-blur-xl border border-white/10 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20 text-white placeholder-white/40 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            />
            <button
              onClick={handleSendMessage}
              disabled={!input.trim() || isLoading}
              className="px-5 py-3.5 bg-gradient-to-br from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-medium shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50 disabled:shadow-none flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span className="hidden sm:inline text-sm">Sending</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                  <span className="hidden sm:inline text-sm">Send</span>
                </>
              )}
            </button>
          </div>
          <p className="text-xs text-white/40 mt-2.5 flex items-center gap-1">
            <kbd className="px-2 py-0.5 bg-white/10 backdrop-blur-xl border border-white/10 rounded text-xs">Enter</kbd>
            to send
            <span className="mx-1">•</span>
            <kbd className="px-2 py-0.5 bg-white/10 backdrop-blur-xl border border-white/10 rounded text-xs">Shift + Enter</kbd>
            for new line
          </p>
        </div>
      </motion.div>
    </>
  );
}
