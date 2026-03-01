'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await api.forgotPassword(email);
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-[#0c0f1a] dark:to-[#111827] p-4">
      <div className="w-full max-w-md mx-auto p-8 bg-white/85 dark:bg-[#141829]/80 backdrop-blur-2xl border border-slate-200/60 dark:border-white/[0.06] rounded-2xl shadow-xl dark:shadow-2xl">

        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-violet-500/10 flex items-center justify-center">
            <svg className="w-7 h-7 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </div>
        </div>

        {!submitted ? (
          <>
            <div className="mb-6 text-center">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Forgot your password?</h2>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                No worries. Enter your email and we&apos;ll send you a 6-digit reset code.
              </p>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 rounded-lg text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 bg-white dark:bg-[#161A2D] text-slate-900 dark:text-white border border-slate-300/60 dark:border-white/[0.07] rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500/50 placeholder-slate-400 dark:placeholder-white/25 text-sm transition-all duration-200 shadow-sm dark:shadow-[inset_0_1px_3px_rgba(0,0,0,0.4)]"
                  placeholder="you@example.com"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 bg-gradient-to-br from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 active:scale-[0.98] text-white font-semibold rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-[0_0_20px_rgba(139,92,246,0.35)] hover:shadow-[0_0_28px_rgba(139,92,246,0.55)]"
              >
                {loading ? 'Sending code…' : 'Send reset code'}
              </button>
            </form>
          </>
        ) : (
          <>
            <div className="mb-6 text-center">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Check your email</h2>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                If <span className="font-medium text-slate-700 dark:text-slate-200">{email}</span> is registered,
                a 6-digit reset code has been sent.
              </p>
            </div>

            <button
              onClick={() => router.push(`/reset-password?email=${encodeURIComponent(email)}`)}
              className="w-full py-3 px-4 bg-gradient-to-br from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 active:scale-[0.98] text-white font-semibold rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/50 transition-all duration-200 shadow-[0_0_20px_rgba(139,92,246,0.35)] hover:shadow-[0_0_28px_rgba(139,92,246,0.55)]"
            >
              Enter reset code
            </button>

            <p className="mt-4 text-center text-xs text-slate-400 dark:text-slate-500">
              Didn&apos;t receive it?{' '}
              <button
                onClick={() => { setSubmitted(false); setEmail(''); }}
                className="text-blue-500 dark:text-blue-400 hover:underline"
              >
                Try again
              </button>
            </p>
          </>
        )}

        <div className="mt-6 text-center">
          <a
            href="/login"
            className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            ← Back to sign in
          </a>
        </div>
      </div>
    </div>
  );
}
