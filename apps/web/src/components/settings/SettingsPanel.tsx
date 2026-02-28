'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';

type Tab = 'profile' | 'account' | 'appearance';
type Theme = 'dark' | 'light' | 'system';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// ── Reusable field components ─────────────────────────────────────────────────

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</label>
      {children}
      {hint && <p className="text-xs text-slate-500 dark:text-slate-500">{hint}</p>}
    </div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all ${props.className ?? ''}`}
    />
  );
}

function SaveButton({ loading, label = 'Save changes' }: { loading: boolean; label?: string }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors"
    >
      {loading ? 'Saving…' : label}
    </button>
  );
}

function Alert({ type, msg }: { type: 'success' | 'error'; msg: string }) {
  if (!msg) return null;
  return (
    <div className={`rounded-xl px-4 py-3 text-sm font-medium ${type === 'success' ? 'bg-green-500/10 border border-green-500/20 text-green-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'}`}>
      {msg}
    </div>
  );
}

// ── Profile Tab ───────────────────────────────────────────────────────────────
function ProfileTab({ token, onSaved }: { token: string; onSaved?: () => void }) {
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [avatar, setAvatar] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.getMe(token).then(u => {
      setFullName(u.fullName ?? '');
      setUsername(u.username ?? '');
      setAvatar(u.avatar ?? '');
    }).catch(() => setError('Failed to load profile.')).finally(() => setLoading(false));
  }, [token]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${API_URL}/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      setAvatar(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await api.updateProfile(token, { fullName, username, avatarUrl: avatar || undefined });
      setSuccess('Profile updated successfully!');
      onSaved?.(); // Refresh AuthContext so sidebar avatar updates immediately
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-slate-500 dark:text-slate-400 text-sm">Loading profile…</div>;

  const initial = (fullName || username || 'U').charAt(0).toUpperCase();

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">Profile</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">Update your name, username, and avatar.</p>
      </div>
      <Field label="Avatar">
        <div className="flex items-center gap-4">
          <div className="relative">
            {avatar ? (
              <img src={avatar} alt="Avatar" className="w-20 h-20 rounded-2xl object-cover ring-2 ring-white/10" />
            ) : (
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-3xl font-bold ring-2 ring-white/10">
                {initial}
              </div>
            )}
            {uploading && (
              <div className="absolute inset-0 rounded-2xl bg-black/50 flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
          <div className="space-y-2">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
            <button type="button" onClick={() => fileRef.current?.click()} className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-white bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/15 border border-slate-200 dark:border-white/10 rounded-xl transition-colors">
              {uploading ? 'Uploading…' : 'Upload photo'}
            </button>
            {avatar && (
              <button type="button" onClick={() => setAvatar('')} className="block text-xs text-slate-500 hover:text-red-400 transition-colors">
                Remove avatar
              </button>
            )}
          </div>
        </div>
      </Field>
      <Field label="Full name" hint="Your display name shown in messages.">
        <Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your full name" maxLength={80} />
      </Field>
      <Field label="Username" hint="Unique handle, 3–30 chars, letters/numbers/._-">
        <Input value={username} onChange={e => setUsername(e.target.value)} placeholder="username" maxLength={30} />
      </Field>
      <Alert type="success" msg={success} />
      <Alert type="error" msg={error} />
      <SaveButton loading={saving} />
    </form>
  );
}

// ── Account Tab ───────────────────────────────────────────────────────────────
function AccountTab({ token }: { token: string }) {
  const [email, setEmail] = useState('');
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwSuccess, setPwSuccess] = useState('');
  const [pwError, setPwError] = useState('');

  useEffect(() => {
    api.getMe(token).then(u => setEmail(u.email)).catch(() => {});
  }, [token]);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError('');
    setPwSuccess('');
    if (newPw !== confirmPw) { setPwError('New passwords do not match.'); return; }
    if (newPw.length < 8) { setPwError('New password must be at least 8 characters.'); return; }
    setPwSaving(true);
    try {
      const res = await api.changePassword(token, { currentPassword: currentPw, newPassword: newPw });
      setPwSuccess(res.message || 'Password changed!');
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
    } catch (err) {
      setPwError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setPwSaving(false);
    }
  };

  return (
    <div className="space-y-10">
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">Account</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Manage your email and password.</p>
        </div>
        <Field label="Email address" hint="Contact support to change your email address.">
          <Input value={email} disabled className="opacity-50 cursor-not-allowed" />
        </Field>
      </div>
      <form onSubmit={handlePasswordSubmit} className="space-y-5">
        <div className="border-t border-slate-200 dark:border-white/5 pt-8">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-1">Change password</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">Choose a strong password of at least 8 characters.</p>
        </div>
        <Field label="Current password">
          <Input type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} placeholder="Enter current password" required />
        </Field>
        <Field label="New password">
          <Input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="At least 8 characters" required />
        </Field>
        <Field label="Confirm new password">
          <Input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="Repeat new password" required />
        </Field>
        <Alert type="success" msg={pwSuccess} />
        <Alert type="error" msg={pwError} />
        <SaveButton loading={pwSaving} label="Update password" />
      </form>
    </div>
  );
}

// ── Appearance Tab ────────────────────────────────────────────────────────────
function AppearanceTab() {
  const [theme, setTheme] = useState<Theme>('dark');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const stored = (localStorage.getItem('theme') as Theme) || 'dark';
    setTheme(stored);
  }, []);

  const applyTheme = (t: Theme) => {
    setTheme(t);
    localStorage.setItem('theme', t);
    const root = document.documentElement;
    if (t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const themes: { value: Theme; label: string; desc: string; icon: string }[] = [
    { value: 'dark', label: 'Dark', desc: 'Easy on the eyes in low light.', icon: '🌙' },
    { value: 'light', label: 'Light', desc: 'Clean and bright.', icon: '☀️' },
    { value: 'system', label: 'System', desc: 'Matches your OS preference.', icon: '💻' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">Appearance</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">Choose how CollabStudy looks for you.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {themes.map(t => (
          <button
            key={t.value}
            onClick={() => applyTheme(t.value)}
            className={`relative flex flex-col items-start gap-2 p-4 rounded-2xl border transition-all text-left ${
              theme === t.value
                ? 'bg-indigo-600/20 border-indigo-500/50 ring-2 ring-indigo-500/30'
                : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10'
            }`}
          >
            <span className="text-2xl">{t.icon}</span>
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">{t.label}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t.desc}</p>
            </div>
            {theme === t.value && <span className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full bg-indigo-400" />}
          </button>
        ))}
      </div>
      {saved && <Alert type="success" msg="Theme preference saved!" />}
    </div>
  );
}

// ── Main SettingsPanel ────────────────────────────────────────────────────────

interface SettingsPanelProps {
  /** Called when the user clicks the ← back button */
  onClose: () => void;
}

export default function SettingsPanel({ onClose }: SettingsPanelProps) {
  const { token, refreshUser } = useAuth();
  const [tab, setTab] = useState<Tab>('profile');

  if (!token) return null;

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'profile', label: 'Profile', icon: '👤' },
    { id: 'account', label: 'Account', icon: '🔒' },
    { id: 'appearance', label: 'Appearance', icon: '🎨' },
  ];

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white">
      {/* Top bar */}
      <div className="h-14 flex-shrink-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-white/5 flex items-center px-6 gap-4">
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
          aria-label="Go back"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-base font-semibold text-slate-900 dark:text-white">Settings</h1>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 py-10 flex gap-8">
          {/* Sidebar tabs */}
          <nav className="w-48 flex-shrink-0 space-y-1">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left ${
                  tab === t.id
                    ? 'bg-indigo-500/10 dark:bg-white/10 text-indigo-600 dark:text-white'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5'
                }`}
              >
                <span>{t.icon}</span>
                {t.label}
              </button>
            ))}
          </nav>

          {/* Content */}
          <div className="flex-1 min-w-0 bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-white/5 rounded-2xl p-8">
            {tab === 'profile' && <ProfileTab token={token} onSaved={refreshUser} />}
            {tab === 'account' && <AccountTab token={token} />}
            {tab === 'appearance' && <AppearanceTab />}
          </div>
        </div>
      </div>
    </div>
  );
}
