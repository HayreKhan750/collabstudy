'use client';

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface SummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  loading: boolean;
  summary: string | null;
  channelName: string;
}

function renderMarkdown(text: string): React.ReactNode {
  return text.split('\n').map((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return <div key={i} className="h-2" />;

    const isBullet = trimmed.startsWith('- ') || trimmed.startsWith('• ');
    const content = isBullet ? trimmed.slice(2) : trimmed;

    const parts = content.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, j) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={j} className="text-slate-900 dark:text-white font-semibold">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return <code key={j} className="bg-slate-100 dark:bg-slate-700 text-blue-600 dark:text-blue-300 px-1 rounded text-xs font-mono">{part.slice(1, -1)}</code>;
      }
      return <span key={j}>{part}</span>;
    });

    if (isBullet) {
      return (
        <div key={i} className="flex items-start gap-2 text-slate-700 dark:text-slate-200 text-sm leading-relaxed">
          <span className="text-blue-500 mt-0.5 flex-shrink-0">•</span>
          <span>{parts}</span>
        </div>
      );
    }

    if (trimmed.startsWith('*') && trimmed.endsWith('*') && !trimmed.startsWith('**')) {
      return (
        <p key={i} className="text-slate-400 dark:text-slate-400 text-xs italic leading-relaxed">{trimmed.slice(1, -1)}</p>
      );
    }

    return (
      <p key={i} className="text-slate-700 dark:text-slate-200 text-sm leading-relaxed">{parts}</p>
    );
  });
}

export default function SummaryModal({ isOpen, onClose, loading, summary, channelName }: SummaryModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isError = !loading && !!summary && (
    summary.startsWith('⚠️') ||
    summary.startsWith('Failed') ||
    summary.startsWith('AI took') ||
    summary.startsWith('AI summary is not configured')
  );

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60 backdrop-blur-sm p-4 animate-fade-in"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="AI Summary"
    >
      <div className="bg-white dark:bg-gray-900/95 backdrop-blur-2xl border border-slate-200 dark:border-white/[0.08] rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[80vh] animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200/80 dark:border-white/[0.08] flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xl">{loading ? '⏳' : isError ? '⚠️' : '✨'}</span>
            <div>
              <h2 className="text-slate-900 dark:text-white font-semibold text-sm">AI Summary</h2>
              <p className="text-slate-500 dark:text-slate-300 text-xs truncate max-w-[18rem]">{channelName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 flex-shrink-0"
            aria-label="Close summary"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-1 min-h-[120px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-10 gap-4">
              <svg
                className="animate-spin h-8 w-8 text-blue-500"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <p className="text-slate-500 dark:text-slate-400 text-sm">Summarising last 50 messages…</p>
              <p className="text-slate-400 dark:text-slate-500 text-xs">This may take up to 15 seconds</p>
              <div className="w-full space-y-2 mt-2">
                {[90, 75, 85, 60].map((w, i) => (
                  <div
                    key={i}
                    className="h-3 bg-slate-200 dark:bg-slate-700 rounded animate-pulse"
                    style={{ width: `${w}%` }}
                  />
                ))}
              </div>
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
              <span className="text-3xl">⚠️</span>
              <p className="text-red-500 dark:text-red-400 text-sm font-medium">{summary}</p>
              <p className="text-slate-400 dark:text-slate-500 text-xs">Please close and try again.</p>
            </div>
          ) : summary ? (
            <div className="space-y-1">
              {renderMarkdown(summary)}
            </div>
          ) : (
            <p className="text-slate-400 dark:text-slate-500 text-sm text-center py-6">No summary available.</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200/80 dark:border-white/[0.08] flex-shrink-0 flex justify-end">
          <button
            onClick={onClose}
            className="bg-gradient-to-br from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 active:scale-95 text-white text-sm font-medium px-4 py-2 rounded-xl transition-all duration-200 shadow-[0_0_16px_rgba(139,92,246,0.3)] hover:shadow-[0_0_24px_rgba(139,92,246,0.5)]"
          >
            {loading ? 'Cancel' : 'Close'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
