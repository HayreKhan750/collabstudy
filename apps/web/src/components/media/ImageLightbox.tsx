'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface ImageLightboxProps {
  images: { src: string; alt: string }[];
  initialIndex?: number;
  onClose: () => void;
}

export function ImageLightbox({ images, initialIndex = 0, onClose }: ImageLightboxProps) {
  const [index, setIndex] = useState(initialIndex);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const current = images[index];

  const resetTransform = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  const goNext = useCallback(() => {
    setIndex((i) => (i + 1) % images.length);
    resetTransform();
  }, [images.length, resetTransform]);

  const goPrev = useCallback(() => {
    setIndex((i) => (i - 1 + images.length) % images.length);
    resetTransform();
  }, [images.length, resetTransform]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === '+' || e.key === '=') setScale((s) => Math.min(s + 0.25, 5));
      if (e.key === '-') setScale((s) => Math.max(s - 0.25, 0.25));
      if (e.key === '0') resetTransform();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, goNext, goPrev, resetTransform]);

  // Scroll to zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    setScale((s) => Math.min(Math.max(s + delta, 0.25), 5));
  };

  // Drag to pan (only when zoomed in)
  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale <= 1) return;
    e.preventDefault();
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !dragStart.current) return;
    setOffset({
      x: dragStart.current.ox + e.clientX - dragStart.current.x,
      y: dragStart.current.oy + e.clientY - dragStart.current.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    dragStart.current = null;
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
      onClick={handleBackdropClick}
      onMouseUp={handleMouseUp}
      onMouseMove={handleMouseMove}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-60 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
        aria-label="Close"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Download button */}
      <a
        href={current.src}
        download
        target="_blank"
        rel="noopener noreferrer"
        className="absolute top-4 right-16 z-60 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
        aria-label="Download image"
        onClick={(e) => e.stopPropagation()}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
      </a>

      {/* Zoom controls */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-60 flex items-center gap-2 bg-black/60 rounded-full px-3 py-1.5 border border-white/10">
        <button
          onClick={() => setScale((s) => Math.max(s - 0.25, 0.25))}
          className="p-1 text-white hover:text-blue-300 transition-colors"
          aria-label="Zoom out"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
          </svg>
        </button>
        <button
          onClick={resetTransform}
          className="text-xs text-white/60 hover:text-white w-12 text-center tabular-nums transition-colors"
          aria-label="Reset zoom"
        >
          {Math.round(scale * 100)}%
        </button>
        <button
          onClick={() => setScale((s) => Math.min(s + 0.25, 5))}
          className="p-1 text-white hover:text-blue-300 transition-colors"
          aria-label="Zoom in"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {/* Prev arrow */}
      {images.length > 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); goPrev(); }}
          className="absolute left-4 top-1/2 -translate-y-1/2 z-60 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          aria-label="Previous image"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}

      {/* Next arrow */}
      {images.length > 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); goNext(); }}
          className="absolute right-4 top-1/2 -translate-y-1/2 z-60 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          aria-label="Next image"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}

      {/* Image */}
      <div
        className="relative select-none"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        style={{ cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
      >
        <img
          ref={imgRef}
          src={current.src}
          alt={current.alt}
          draggable={false}
          onClick={(e) => e.stopPropagation()}
          className="max-w-[90vw] max-h-[85vh] rounded-lg object-contain transition-transform duration-100 shadow-2xl"
          style={{
            transform: `scale(${scale}) translate(${offset.x / scale}px, ${offset.y / scale}px)`,
          }}
        />
      </div>

      {/* Image counter */}
      {images.length > 1 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 text-xs text-white/70 bg-black/50 rounded-full px-3 py-1">
          {index + 1} / {images.length}
        </div>
      )}
    </div>
  );
}
