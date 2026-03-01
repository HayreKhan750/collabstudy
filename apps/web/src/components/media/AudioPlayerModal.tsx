'use client';

import { useEffect, useRef, useState } from 'react';

interface AudioPlayerModalProps {
  src: string;
  name?: string | null;
  onClose: () => void;
}

function formatDuration(secs: number): string {
  if (!isFinite(secs)) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function AudioPlayerModal({ src, name, onClose }: AudioPlayerModalProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onDurationChange = () => setDuration(audio.duration);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('durationchange', onDurationChange);
    return () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('durationchange', onDurationChange);
    };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === ' ') {
        e.preventDefault();
        const audio = audioRef.current;
        if (audio) {
          audio.paused ? audio.play() : audio.pause();
        }
      }
      if (e.key === 'ArrowLeft') {
        const audio = audioRef.current;
        if (audio) audio.currentTime = Math.max(0, audio.currentTime - 5);
      }
      if (e.key === 'ArrowRight') {
        const audio = audioRef.current;
        if (audio) audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 5);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.paused ? audio.play() : audio.pause();
  };

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Number(e.target.value);
    setCurrentTime(Number(e.target.value));
  };

  const changeVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    setVolume(v);
    if (audioRef.current) audioRef.current.volume = v;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 flex flex-col gap-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Hidden audio element */}
        <audio ref={audioRef} src={src} autoPlay onEnded={() => setPlaying(false)} />

        {/* Title + close */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            {/* Music note icon */}
            <div className="w-12 h-12 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6 text-blue-500 dark:text-blue-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-slate-900 dark:text-white font-semibold text-sm truncate">
                {name || 'Audio'}
              </p>
              <p className="text-slate-500 dark:text-slate-400 text-xs">
                {formatDuration(currentTime)} / {formatDuration(duration)}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors flex-shrink-0"
            aria-label="Close"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Animated waveform bars (CSS-only visualizer) */}
        <div className="flex items-end justify-center gap-0.5 h-10 overflow-hidden">
          {Array.from({ length: 28 }).map((_, i) => (
            <div
              key={i}
              className={`w-1 rounded-full transition-all ${playing ? 'bg-blue-400' : 'bg-slate-300 dark:bg-slate-600'}`}
              style={{
                height: playing
                  ? `${20 + Math.abs(Math.sin(i * 0.8 + Date.now() / 1000)) * 20}%`
                  : `${15 + Math.abs(Math.sin(i * 0.9)) * 30}%`,
                animationName: playing ? 'bounce' : 'none',
                animationDuration: `${0.4 + (i % 5) * 0.12}s`,
                animationDelay: `${(i % 7) * 0.07}s`,
                animationIterationCount: 'infinite',
                animationTimingFunction: 'ease-in-out',
                animationDirection: 'alternate',
              }}
            />
          ))}
        </div>

        {/* Seek bar */}
        <div className="flex flex-col gap-1">
          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.1}
            value={currentTime}
            onChange={seek}
            className="w-full h-1.5 rounded-full appearance-none bg-slate-200 dark:bg-slate-600 accent-blue-500 cursor-pointer"
            aria-label="Seek"
          />
          <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>{formatDuration(currentTime)}</span>
            <span>{formatDuration(duration)}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between">
          {/* Volume */}
          <div className="flex items-center gap-2 w-28">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4 text-slate-400 dark:text-slate-400 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.536 8.464a5 5 0 010 7.072M12 6v12m-3.536-9.536A5 5 0 008 12m0 0a5 5 0 001.464 3.536"
              />
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l-3 3m0 0l3 3m-3-3h12" />
            </svg>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4 text-slate-400 dark:text-slate-400 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.536 8.464a5 5 0 010 7.072M12 6v12"
              />
            </svg>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={changeVolume}
              className="flex-1 h-1 rounded-full appearance-none bg-slate-200 dark:bg-slate-600 accent-blue-500 cursor-pointer"
              aria-label="Volume"
            />
          </div>

          {/* Play/Pause */}
          <button
            onClick={togglePlay}
            className="w-12 h-12 rounded-full bg-blue-600 hover:bg-blue-500 text-white hover:text-white flex items-center justify-center transition-colors shadow-lg"
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6 translate-x-0.5"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          {/* Download */}
          <a
            href={src}
            download={name || true}
            target="_blank"
            rel="noopener noreferrer"
            className="w-9 h-9 rounded-full bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition-colors"
            aria-label="Download"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
          </a>
        </div>
      </div>
    </div>
  );
}
