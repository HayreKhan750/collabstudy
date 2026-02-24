'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface PromptModalProps {
  open: boolean;
  title: string;
  label: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

/**
 * PromptModal — replaces all window.prompt() calls with a styled,
 * accessible input modal. Auto-focuses the input and submits on Enter.
 */
export function PromptModal({
  open,
  title,
  label,
  defaultValue = '',
  placeholder = '',
  confirmLabel = 'Save',
  onConfirm,
  onCancel,
}: PromptModalProps) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync value when defaultValue changes (e.g., different item selected)
  useEffect(() => {
    setValue(defaultValue);
  }, [defaultValue, open]);

  // Auto-focus + select text when modal opens
  useEffect(() => {
    if (open) {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 60);
    }
  }, [open]);

  // Escape = cancel, Enter = confirm
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter' && value.trim()) onConfirm(value.trim());
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, value, onConfirm, onCancel]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onCancel}
          />

          {/* Dialog */}
          <motion.div
            className="relative z-10 w-full max-w-sm rounded-2xl border border-white/10 bg-[var(--color-surface)] p-6 shadow-2xl"
            initial={{ opacity: 0, scale: 0.92, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 8 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            <h2 className="mb-4 text-base font-semibold text-[var(--color-fg)]">{title}</h2>

            <label className="mb-1.5 block text-xs font-medium text-[var(--color-fg-muted)]">
              {label}
            </label>
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={placeholder}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-[var(--color-fg)] placeholder:text-[var(--color-fg-muted)] outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-all"
            />

            <div className="mt-4 flex gap-3">
              <button
                onClick={onCancel}
                className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-[var(--color-fg-muted)] transition-all hover:bg-white/10 hover:text-[var(--color-fg)]"
              >
                Cancel
              </button>
              <button
                onClick={() => value.trim() && onConfirm(value.trim())}
                disabled={!value.trim()}
                className="flex-1 rounded-xl bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-[var(--color-primary-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
