'use client';

import React, { useEffect, useRef } from 'react';

interface SummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  loading: boolean;
  summary: string | null;
  channelName: string;
}

/**
 * Renders a Markdown-ish summary string by converting a small subset of
 * Markdown syntax to JSX — enough to handle the AI response format cleanly:
 *  **bold**, `code`, - bullet, blank line → paragraph break.
 */
function renderMarkdown(text: string): React.ReactNode {
  return text.split('\n').map((line, i) => {
    const trimmed = line.trim();

    // Blank line → spacer
    if (!trimmed) return <div key={i} className="h-2" />;

    // Bullet point
    const isBullet = trimmed.startsWith('- ') || trimmed.startsWith('• ');
    const content = isBullet ? trimmed.slice(2) : trimmed;

    // Inline: **bold** and `code`
    const parts = content.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, j) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={j} className="text-white font-semibold">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return <code key={j} className="bg-gray-700 text-blue-300 px-1 rounded text-xs font-mono">{part.slice(1, -1)}</code>;
      }
      return <span key={j}>{part}</span>;
    });

    if (isBullet) {
      return (
        <div key={i} className="flex items-start gap-2 text-gray-200 text-sm leading-relaxed">
          <span className="text-blue-400 mt-0.5 flex-shrink-0">•</span>
          <span>{parts}</span>
        </div>
      );
    }

    // Italic / meta lines (starts with *)
    if (trimmed.startsWith('*') && trimmed.endsWith('*') && !trimmed.startsWith('**')) {
      return (
        <p key={i} className="text-gray-400 text-xs italic leading-relaxed">{trimmed.slice(1, -1)}</p>
      );
    }

    return (
      <p key={i} className="text-gray-200 text-sm leading-relaxed">{parts}</p>
    );
  });
}

export default function SummaryModal({ isOpen, onClose, loading, summary, channelName }: SummaryModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  // Close on Escape key — always works, even while loading
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

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="AI Summary"
    >
      <div className="bg-gray-800 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[80vh]">
        {/* Header — close button ALWAYS visible */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xl">{loading ? '⏳' : isError ? '⚠️' : '✨'}</span>
            <div>
              <h2 className="text-white font-semibold text-sm">AI Summary</h2>
              <p className="text-gray-400 text-xs truncate max-w-[18rem]">{channelName}</p>
            </div>
          </div>
          {/* Close is ALWAYS rendered — not gated on loading state */}
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-700 flex-shrink-0"
            aria-label="Close summary"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-1 min-h-[120px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-10 gap-4">
              {/* Spinner */}
              <svg
                className="animate-spin h-8 w-8 text-blue-400"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <p className="text-gray-400 text-sm">Summarising last 50 messages…</p>
              <p className="text-gray-500 text-xs">This may take up to 15 seconds</p>
              {/* Skeleton lines */}
              <div className="w-full space-y-2 mt-2">
                {[90, 75, 85, 60].map((w, i) => (
                  <div
                    key={i}
                    className="h-3 bg-gray-700 rounded animate-pulse"
                    style={{ width: `${w}%` }}
                  />
                ))}
              </div>
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
              <span className="text-3xl">⚠️</span>
              <p className="text-red-400 text-sm font-medium">{summary}</p>
              <p className="text-gray-500 text-xs">Please close and try again.</p>
            </div>
          ) : summary ? (
            <div className="space-y-1">
              {renderMarkdown(summary)}
            </div>
          ) : (
            <p className="text-gray-400 text-sm text-center py-6">No summary available.</p>
          )}
        </div>

        {/* Footer — always shown */}
        <div className="px-5 py-3 border-t border-gray-700 flex-shrink-0 flex justify-end">
          <button
            onClick={onClose}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {loading ? 'Cancel' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}
