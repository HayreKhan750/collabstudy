'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface VideoPlayerModalProps {
  src: string;
  name?: string | null;
  onClose: () => void;
}

export function VideoPlayerModal({ src, name, onClose }: VideoPlayerModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === ' ') {
        e.preventDefault();
        if (videoRef.current) {
          videoRef.current.paused ? videoRef.current.play() : videoRef.current.pause();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/80 dark:bg-black/95 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Header bar */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/80 to-transparent z-10">
        <span className="text-sm text-white font-medium truncate max-w-xs">{name || 'Video'}</span>
        <div className="flex items-center gap-2">
          {/* Download */}
          <a
            href={src}
            download={name || true}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            aria-label="Download video"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </a>
          {/* Close */}
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Video player */}
      <video
        ref={videoRef}
        src={src}
        controls
        autoPlay
        className="max-w-[92vw] max-h-[85vh] rounded-xl shadow-2xl outline-none"
        onClick={(e) => e.stopPropagation()}
      />

      {/* Keyboard hint */}
      <p className="absolute bottom-4 text-xs text-white/40 select-none">
        Press <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-white/60 text-[10px]">Space</kbd> to pause ·{' '}
        <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-white/60 text-[10px]">Esc</kbd> to close
      </p>
    </div>,
    document.body
  );
}
