'use client';

import { ImageLightbox } from './ImageLightbox';
import { VideoPlayerModal } from './VideoPlayerModal';
import { AudioPlayerModal } from './AudioPlayerModal';
import { PDFPreviewModal } from './PDFPreviewModal';
import { useEffect } from 'react';

export interface MediaViewerProps {
  src: string;
  mimeType: string | null;
  name?: string | null;
  /** For image galleries — pass all images in the current message list */
  allImages?: { src: string; alt: string }[];
  /** Index of this image within allImages */
  imageIndex?: number;
  onClose: () => void;
}

/**
 * Dispatches to the right viewer based on MIME type.
 * Falls back to a generic download-only view for unsupported types.
 */
export function MediaViewer({ src, mimeType, name, allImages, imageIndex = 0, onClose }: MediaViewerProps) {
  const mime = mimeType || '';

  // Trap focus: prevent Tab from leaving the modal
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    return () => { prev?.focus(); };
  }, []);

  if (mime.startsWith('image/')) {
    const images = allImages && allImages.length > 0
      ? allImages
      : [{ src, alt: name || 'Image' }];
    return (
      <ImageLightbox
        images={images}
        initialIndex={imageIndex}
        onClose={onClose}
      />
    );
  }

  if (mime.startsWith('video/')) {
    return <VideoPlayerModal src={src} name={name} onClose={onClose} />;
  }

  if (mime.startsWith('audio/')) {
    return <AudioPlayerModal src={src} name={name} onClose={onClose} />;
  }

  if (mime === 'application/pdf') {
    return <PDFPreviewModal src={src} name={name} onClose={onClose} />;
  }

  // Generic file — show a centred download card
  return <GenericFileViewer src={src} name={name} mimeType={mime} onClose={onClose} />;
}

// ─── Generic download card ───────────────────────────────────────────────────

function GenericFileViewer({ src, name, mimeType, onClose }: {
  src: string;
  name?: string | null;
  mimeType: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-gray-800 border border-white/10 rounded-2xl shadow-2xl max-w-sm w-full mx-4 p-8 flex flex-col items-center gap-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* File icon */}
        <div className="w-16 h-16 rounded-2xl bg-gray-700 border border-white/10 flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
        </div>

        <div className="text-center">
          <p className="text-white font-semibold text-sm break-all">{name || 'File'}</p>
          {mimeType && <p className="text-gray-400 text-xs mt-1">{mimeType}</p>}
        </div>

        <div className="flex gap-3 w-full">
          <a
            href={src}
            download={name || true}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-medium transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download
          </a>
          <button
            onClick={onClose}
            className="flex-1 py-2.5 bg-white/10 hover:bg-white/20 text-gray-200 rounded-xl text-sm font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
