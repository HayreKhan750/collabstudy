'use client';

import { useState } from 'react';

interface UserProfileModalProps {
  user: {
    id: string;
    username: string;
    fullName: string | null;
    avatar: string | null;
    email?: string | null;
  };
  isOnline?: boolean;
  onClose: () => void;
  /** Called when the user wants to start / open a DM with this person */
  onStartDM?: (userId: string) => void;
  /** Whether the current viewer is this user themselves */
  isSelf?: boolean;
}

function AvatarPlaceholder({ name, size = 20 }: { name: string; size?: number }) {
  const initial = (name || '?').charAt(0).toUpperCase();
  const colors = ['bg-indigo-500','bg-purple-500','bg-pink-500','bg-blue-500','bg-teal-500','bg-green-500','bg-orange-500','bg-rose-500'];
  const color = colors[initial.charCodeAt(0) % colors.length];
  return (
    <div className={`w-${size} h-${size} rounded-full ${color} flex items-center justify-center text-white font-bold text-3xl flex-shrink-0`}>
      {initial}
    </div>
  );
}

export default function UserProfileModal({
  user,
  isOnline = false,
  onClose,
  onStartDM,
  isSelf = false,
}: UserProfileModalProps) {
  const displayName = user.fullName || user.username;

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Card */}
      <div
        className="relative w-80 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header gradient banner */}
        <div className="h-24 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500" />

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-7 h-7 rounded-full bg-black/20 hover:bg-black/40 flex items-center justify-center text-white transition-colors"
          aria-label="Close"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Avatar — overlaps the banner */}
        <div className="px-6 pb-5">
          <div className="flex items-end gap-4 -mt-10 mb-4">
            <div className="relative flex-shrink-0">
              {user.avatar ? (
                <img
                  src={user.avatar}
                  alt={displayName}
                  className="w-20 h-20 rounded-full object-cover border-4 border-white dark:border-slate-800 shadow-lg"
                />
              ) : (
                <div className="w-20 h-20 rounded-full border-4 border-white dark:border-slate-800 shadow-lg overflow-hidden">
                  <AvatarPlaceholder name={displayName} size={20} />
                </div>
              )}
              {/* Online dot */}
              <span
                className={`absolute bottom-1 right-1 w-4 h-4 rounded-full border-2 border-white dark:border-slate-800 ${
                  isOnline ? 'bg-emerald-400' : 'bg-slate-400'
                }`}
              />
            </div>
            <div className="flex-1 min-w-0 pb-1">
              <div className="flex items-center gap-2">
                <h2 className="text-slate-900 dark:text-white font-bold text-lg truncate">{displayName}</h2>
              </div>
              <p className="text-slate-500 dark:text-slate-400 text-sm truncate">@{user.username}</p>
            </div>
          </div>

          {/* Status */}
          <div className="flex items-center gap-2 mb-4">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isOnline ? 'bg-emerald-400' : 'bg-slate-400'}`} />
            <span className="text-sm text-slate-600 dark:text-slate-300">
              {isOnline ? 'Active now' : 'Offline'}
            </span>
          </div>

          {/* Actions */}
          {!isSelf && onStartDM && (
            <button
              onClick={() => { onStartDM(user.id); onClose(); }}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold text-sm transition-colors shadow-lg shadow-indigo-500/25"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              Send Message
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
