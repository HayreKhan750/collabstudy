'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { motion, useInView, useScroll, useTransform } from 'framer-motion';
import { cn } from '@/lib/cn';

// ─── Animation Variants ───────────────────────────────────────────────────────

const fadeUp = {
  hidden: { opacity: 0, y: 32 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: 'easeOut' as const } },
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
};

const fadeIn = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.5 } },
};

// ─── Reusable Animated Section ────────────────────────────────────────────────

function AnimatedSection({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-80px' });
  return (
    <motion.div
      ref={ref}
      variants={stagger}
      initial="hidden"
      animate={isInView ? 'show' : 'hidden'}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ─── Feature Card ─────────────────────────────────────────────────────────────

interface FeatureCardProps {
  icon: string;
  title: string;
  description: string;
  gradient: string;
}

function FeatureCard({ icon, title, description, gradient }: FeatureCardProps) {
  return (
    <motion.div
      variants={fadeUp}
      className="group relative rounded-2xl border border-slate-200 dark:border-white/5 bg-white dark:bg-white/[0.03] p-6 backdrop-blur-sm hover:border-slate-300 dark:hover:border-white/10 hover:bg-slate-50 dark:hover:bg-white/[0.06] transition-all duration-300 shadow-sm dark:shadow-none"
    >
      {/* Gradient glow on hover */}
      <div className={cn('absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500', gradient)} />
      <div className="relative z-10">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 dark:bg-white/5 text-2xl border border-slate-200 dark:border-white/10">
          {icon}
        </div>
        <h3 className="mb-2 text-lg font-semibold text-slate-900 dark:text-white">{title}</h3>
        <p className="text-sm leading-relaxed text-slate-500 dark:text-white/50">{description}</p>
      </div>
    </motion.div>
  );
}

// ─── Pricing Card ─────────────────────────────────────────────────────────────

interface PricingCardProps {
  tier: string;
  price: string;
  description: string;
  features: string[];
  highlight?: boolean;
  badge?: string;
  ctaText: string;
  ctaHref: string;
}

function PricingCard({ tier, price, description, features, highlight, badge, ctaText, ctaHref }: PricingCardProps) {
  return (
    <motion.div
      variants={fadeUp}
      className={cn(
        'relative flex flex-col rounded-2xl border p-8 transition-all duration-300',
        highlight
          ? 'border-violet-500/50 bg-violet-50 dark:bg-violet-950/30 shadow-[0_0_60px_-10px_rgba(124,58,237,0.4)]'
          : 'border-slate-200 dark:border-white/5 bg-white dark:bg-white/[0.03] hover:border-slate-300 dark:hover:border-white/10 shadow-sm dark:shadow-none',
      )}
    >
      {badge && (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
          <span className="rounded-full bg-gradient-to-r from-violet-600 to-cyan-600 px-4 py-1 text-xs font-semibold text-white shadow-lg">
            {badge}
          </span>
        </div>
      )}
      <div className="mb-6">
        <p className="mb-1 text-sm font-medium uppercase tracking-widest text-slate-400 dark:text-white/40">{tier}</p>
        <div className="flex items-baseline gap-1">
          <span className="text-4xl font-bold text-slate-900 dark:text-white">{price}</span>
          {price !== 'Free' && <span className="text-slate-400 dark:text-white/40">/mo</span>}
        </div>
        <p className="mt-2 text-sm text-slate-500 dark:text-white/50">{description}</p>
      </div>
      <ul className="mb-8 flex flex-col gap-3 flex-1">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2.5 text-sm text-slate-600 dark:text-white/70">
            <span className="mt-0.5 text-violet-500 dark:text-violet-400 flex-shrink-0">✓</span>
            {f}
          </li>
        ))}
      </ul>
      <Link
        href={ctaHref}
        className={cn(
          'block w-full rounded-xl py-3 text-center text-sm font-semibold transition-all duration-200',
          highlight
            ? 'bg-gradient-to-r from-violet-600 to-cyan-600 text-white hover:opacity-90 shadow-lg'
            : 'border border-slate-200 dark:border-white/10 text-slate-700 dark:text-white/80 hover:border-violet-300 dark:hover:border-white/20 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-white/5',
        )}
      >
        {ctaText}
      </Link>
    </motion.div>
  );
}

// ─── Mock Chat Preview ────────────────────────────────────────────────────────

function ChatPreview() {
  const messages = [
    { user: 'Alex', avatar: '🧑‍💻', text: 'Just pushed the new feature branch. Can someone review?', time: '10:42 AM', self: false },
    { user: 'Maya', avatar: '👩‍🎨', text: 'On it! The PR looks clean. Love the new animations 🎉', time: '10:43 AM', self: false },
    { user: 'You', avatar: '⚡', text: 'Thanks! Also, I used the AI summary — it perfectly captured last week\'s discussion.', time: '10:44 AM', self: true },
    { user: 'Alex', avatar: '🧑‍💻', text: '✨ That AI feature is insane. Saves me 20 min every standup.', time: '10:45 AM', self: false },
  ];

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0f0f13]/80 backdrop-blur-xl overflow-hidden shadow-2xl">
      {/* Window bar */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-white/5 px-4 py-3">
        <div className="h-3 w-3 rounded-full bg-red-500/70" />
        <div className="h-3 w-3 rounded-full bg-yellow-500/70" />
        <div className="h-3 w-3 rounded-full bg-green-500/70" />
        <div className="mx-auto flex items-center gap-2 text-xs text-slate-400 dark:text-white/30">
          <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
          #engineering · CollabStudy
        </div>
      </div>
      {/* Messages */}
      <div className="flex flex-col gap-4 p-4">
        {messages.map((m, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: m.self ? 16 : -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 + i * 0.15, duration: 0.4, ease: 'easeOut' }}
            className={cn('flex items-start gap-3', m.self && 'flex-row-reverse')}
          >
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-white/5 text-sm border border-slate-200 dark:border-white/10">
              {m.avatar}
            </div>
            <div className={cn('flex max-w-[75%] flex-col gap-1', m.self && 'items-end')}>
              <div className="flex items-center gap-2">
                {!m.self && <span className="text-xs font-medium text-violet-600 dark:text-violet-400">{m.user}</span>}
                <span className="text-[10px] text-slate-400 dark:text-white/20">{m.time}</span>
              </div>
              <div className={cn(
                'rounded-2xl px-3 py-2 text-xs leading-relaxed',
                m.self
                  ? 'rounded-tr-sm bg-violet-600/80 text-white'
                  : 'rounded-tl-sm bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-white/80 border border-slate-200 dark:border-white/5',
              )}>
                {m.text}
              </div>
            </div>
          </motion.div>
        ))}
        {/* Typing indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
          className="flex items-center gap-2 text-xs text-slate-400 dark:text-white/30"
        >
          <div className="flex gap-1 px-3 py-2 rounded-2xl rounded-tl-sm bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/5">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 dark:bg-white/30 [animation-delay:0ms]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 dark:bg-white/30 [animation-delay:150ms]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 dark:bg-white/30 [animation-delay:300ms]" />
          </div>
          <span>Maya is typing…</span>
        </motion.div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();
  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ offset: ['start start', 'end start'] });
  const heroY = useTransform(scrollYProgress, [0, 1], ['0%', '30%']);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  // Redirect authenticated users straight to the app
  useEffect(() => {
    if (!loading && isAuthenticated) {
      router.push('/dashboard');
    }
  }, [isAuthenticated, loading, router]);

  // While checking auth, show nothing (avoids flash)
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-[#0f0f13]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 dark:border-white/10 border-t-violet-500" />
      </div>
    );
  }

  // Authenticated users are redirected — don't render landing page
  if (isAuthenticated) return null;

  const features: FeatureCardProps[] = [
    {
      icon: '⚡',
      title: 'Real-Time Messaging',
      description: 'Sub-50ms message delivery powered by Socket.io. Channels, threads, mentions, reactions, and read receipts — everything you expect, nothing you don\'t.',
      gradient: 'bg-gradient-to-br from-violet-600/10 to-transparent',
    },
    {
      icon: '✨',
      title: 'AI Smart Summaries',
      description: 'Missed a long discussion? One click and Gemini AI distills hours of conversation into a crisp, actionable summary. Never be out of the loop again.',
      gradient: 'bg-gradient-to-br from-cyan-600/10 to-transparent',
    },
    {
      icon: '🎥',
      title: 'HD Video & Voice Calls',
      description: 'Browser-native WebRTC video calls and Discord-style voice rooms — no downloads, no plugins. Just click and talk, with up to 8 participants.',
      gradient: 'bg-gradient-to-br from-emerald-600/10 to-transparent',
    },
    {
      icon: '📎',
      title: 'Smart File Sharing',
      description: 'Drag and drop any file type. Images render inline, videos play in-chat, and documents get rich previews. S3-powered storage with zero size anxiety.',
      gradient: 'bg-gradient-to-br from-orange-600/10 to-transparent',
    },
  ];

  const plans: PricingCardProps[] = [
    {
      tier: 'Free',
      price: 'Free',
      description: 'Perfect for individuals and small teams getting started.',
      features: [
        'Up to 3 workspaces',
        'Unlimited channels',
        '10,000 message history',
        '500 MB file storage',
        'Standard video calls (2 users)',
      ],
      ctaText: 'Start for free',
      ctaHref: '/register',
    },
    {
      tier: 'Pro',
      price: '$9',
      description: 'For growing teams that need more power and history.',
      features: [
        'Unlimited workspaces',
        'Unlimited message history',
        '50 GB file storage',
        'AI summaries (100/month)',
        'HD video calls (8 users)',
        'Priority support',
      ],
      highlight: true,
      badge: 'Most Popular',
      ctaText: 'Start Pro trial',
      ctaHref: '/register',
    },
    {
      tier: 'Diamond',
      price: '$29',
      description: 'Unlimited everything for high-performance teams.',
      features: [
        'Everything in Pro',
        'Unlimited AI summaries',
        '1 TB file storage',
        'Custom domain & branding',
        'Advanced RBAC & audit logs',
        'SSO / SAML integration',
        'Dedicated support channel',
      ],
      ctaText: 'Contact sales',
      ctaHref: '/register',
    },
  ];

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-slate-50 dark:bg-[#0f0f13] text-slate-900 dark:text-white">

      {/* ── Fixed Nav ──────────────────────────────────────────────────────── */}
      <motion.nav
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 backdrop-blur-md border-b border-slate-200 dark:border-white/5 bg-white/80 dark:bg-[#0f0f13]/70"
      >
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-cyan-600 text-sm font-bold">
            C
          </div>
          <span className="text-base font-semibold tracking-tight text-slate-900 dark:text-white">CollabStudy</span>
        </div>
        <div className="hidden items-center gap-8 text-sm text-slate-500 dark:text-white/60 md:flex">
          <a href="#features" className="hover:text-slate-900 dark:hover:text-white transition-colors">Features</a>
          <a href="#pricing" className="hover:text-slate-900 dark:hover:text-white transition-colors">Pricing</a>
          <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="hover:text-slate-900 dark:hover:text-white transition-colors">GitHub</a>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/login" className="text-sm text-slate-600 dark:text-white/70 hover:text-slate-900 dark:hover:text-white transition-colors px-3 py-2">
            Log in
          </Link>
          <Link
            href="/register"
            className="rounded-lg bg-gradient-to-r from-violet-600 to-violet-700 px-4 py-2 text-sm font-semibold text-white hover:opacity-90 transition-opacity shadow-lg shadow-violet-900/30"
          >
            Get started
          </Link>
        </div>
      </motion.nav>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section ref={heroRef} className="relative flex min-h-screen flex-col items-center justify-center px-6 pt-20 text-center">
        {/* Radial gradient background */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(124,58,237,0.25),transparent)]" />
        {/* Grid overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:72px_72px] [mask-image:radial-gradient(ellipse_70%_70%_at_50%_50%,black,transparent)]" />

        <motion.div style={{ y: heroY, opacity: heroOpacity }} className="relative z-10 flex flex-col items-center gap-6 max-w-4xl">
          {/* Badge */}
          <motion.div variants={fadeUp} initial="hidden" animate="show">
            <span className="inline-flex items-center gap-2 rounded-full border border-violet-100 dark:border-violet-500/20 bg-violet-50 dark:bg-violet-500/10 px-4 py-1.5 text-xs font-medium text-violet-700 dark:text-violet-300 shadow-sm dark:shadow-none">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-500 dark:bg-violet-400 animate-pulse" />
              ✨ Now with Gemini 2.5 Flash AI — Powered by WebRTC &amp; Socket.io
            </span>
          </motion.div>

          {/* Headline */}
          <motion.h1
            variants={fadeUp}
            initial="hidden"
            animate="show"
            transition={{ delay: 0.1 }}
            className="text-5xl font-extrabold leading-[1.1] tracking-tight md:text-7xl"
          >
            The collaboration platform{' '}
            <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-cyan-400 bg-clip-text text-transparent">
              built for builders
            </span>
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            variants={fadeUp}
            initial="hidden"
            animate="show"
            transition={{ delay: 0.2 }}
            className="max-w-2xl text-lg text-slate-500 dark:text-white/50 leading-relaxed"
          >
            CollabStudy brings your team together with real-time channels, AI-powered summaries, 
            crystal-clear video calls, and seamless file sharing — all in one beautiful workspace.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="show"
            transition={{ delay: 0.3 }}
            className="flex flex-col gap-3 sm:flex-row"
          >
            <Link
              href="/register"
              className="group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-violet-600 to-cyan-600 px-8 py-3.5 text-sm font-semibold text-white shadow-[0_0_40px_-8px_rgba(124,58,237,0.6)] transition-all duration-300 hover:shadow-[0_0_60px_-8px_rgba(124,58,237,0.8)] hover:scale-[1.02]"
            >
              <span>Start for free</span>
              <span className="transition-transform duration-200 group-hover:translate-x-0.5">→</span>
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 px-8 py-3.5 text-sm font-semibold text-slate-700 dark:text-white/80 backdrop-blur-sm transition-all duration-200 hover:border-slate-300 dark:hover:border-white/20 hover:bg-slate-50 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
            >
              Sign in to workspace
            </Link>
          </motion.div>

          {/* Social proof */}
          <motion.p
            variants={fadeIn}
            initial="hidden"
            animate="show"
            transition={{ delay: 0.5 }}
            className="text-xs text-slate-400 dark:text-white/25"
          >
            No credit card required · Free forever plan available
          </motion.p>
        </motion.div>

        {/* Hero chat preview */}
        <motion.div
          initial={{ opacity: 0, y: 48, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.5, ease: 'easeOut' as const }}
          className="relative z-10 mt-20 w-full max-w-2xl"
        >
          {/* Glow behind card */}
          <div className="absolute -inset-4 rounded-3xl bg-gradient-to-r from-violet-600/20 to-cyan-600/20 blur-3xl" />
          <div className="relative">
            <ChatPreview />
          </div>
        </motion.div>

        {/* Scroll hint */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-slate-300 dark:text-white/20 text-xs"
        >
          <motion.div
            animate={{ y: [0, 6, 0] }}
            transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
          >
            ↓
          </motion.div>
          <span>Scroll to explore</span>
        </motion.div>
      </section>

      {/* ── Features ───────────────────────────────────────────────────────── */}
      <section id="features" className="px-6 py-32">
        <AnimatedSection className="mx-auto max-w-6xl">
          {/* Section header */}
          <motion.div variants={fadeUp} className="mb-16 text-center">
            <p className="mb-3 text-sm font-medium uppercase tracking-widest text-violet-400">
              Everything you need
            </p>
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white md:text-5xl">
              Built for the way teams actually work
            </h2>
            <p className="mt-4 text-base text-slate-500 dark:text-white/40 max-w-xl mx-auto">
              Every feature was designed with one goal: reduce friction and let your team focus on what matters.
            </p>
          </motion.div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <FeatureCard key={f.title} {...f} />
            ))}
          </div>
        </AnimatedSection>
      </section>

      {/* ── Social Proof / Stats ───────────────────────────────────────────── */}
      <section className="px-6 py-16 border-y border-slate-200 dark:border-white/5">
        <AnimatedSection className="mx-auto max-w-4xl">
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
            {[
              { value: '<50ms', label: 'Message delivery' },
              { value: '99.9%', label: 'Uptime SLA' },
              { value: '8-way', label: 'Voice mesh rooms' },
              { value: '∞', label: 'Message history' },
            ].map(({ value, label }) => (
              <motion.div key={label} variants={fadeUp} className="text-center">
                <p className="text-3xl font-bold text-slate-900 dark:text-white md:text-4xl">{value}</p>
                <p className="mt-1 text-sm text-slate-400 dark:text-white/40">{label}</p>
              </motion.div>
            ))}
          </div>
        </AnimatedSection>
      </section>

      {/* ── Pricing ────────────────────────────────────────────────────────── */}
      <section id="pricing" className="px-6 py-32">
        <AnimatedSection className="mx-auto max-w-5xl">
          <motion.div variants={fadeUp} className="mb-16 text-center">
            <p className="mb-3 text-sm font-medium uppercase tracking-widest text-violet-400">Pricing</p>
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white md:text-5xl">
              Simple, transparent pricing
            </h2>
            <p className="mt-4 text-base text-slate-500 dark:text-white/40">
              Start free. Upgrade when your team is ready. No surprises.
            </p>
          </motion.div>
          <div className="grid gap-6 md:grid-cols-3">
            {plans.map((p) => (
              <PricingCard key={p.tier} {...p} />
            ))}
          </div>
        </AnimatedSection>
      </section>

      {/* ── Final CTA ──────────────────────────────────────────────────────── */}
      <section className="px-6 py-32">
        <AnimatedSection className="mx-auto max-w-3xl">
          <motion.div
            variants={fadeUp}
            className="relative overflow-hidden rounded-3xl border border-violet-500/30 bg-gradient-to-br from-slate-900 via-violet-950/80 to-slate-900 p-12 text-center shadow-2xl shadow-violet-900/30 dark:shadow-[0_0_80px_-20px_rgba(124,58,237,0.5)]"
          >
            {/* Radial glow */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_120%,rgba(124,58,237,0.2),transparent)]" />
            {/* Top shimmer line */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2/3 h-px bg-gradient-to-r from-transparent via-violet-500/60 to-transparent" />
            <div className="relative z-10">
              <h2 className="text-3xl font-bold text-white md:text-4xl">
                Ready to build something great?
              </h2>
              <p className="mt-4 text-base text-white/60">
                Join your team in minutes. No setup fees, no lock-in.
              </p>
              <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
                <Link
                  href="/register"
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-violet-900/40 transition-all duration-200 hover:scale-[1.02] hover:shadow-violet-900/60"
                >
                  Create your workspace →
                </Link>
                <Link
                  href="/login"
                  className="text-sm text-white/50 hover:text-white transition-colors hover:underline underline-offset-4"
                >
                  Already have an account? Sign in
                </Link>
              </div>
            </div>
          </motion.div>
        </AnimatedSection>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-200 dark:border-white/5 px-6 py-10">
        <div className="mx-auto max-w-6xl flex flex-col items-center justify-between gap-6 md:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-violet-600 to-cyan-600 text-xs font-bold">
              C
            </div>
            <span className="text-sm font-semibold text-slate-500 dark:text-white/60">CollabStudy</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-slate-400 dark:text-white/30">
            <Link href="/login" className="hover:text-slate-700 dark:hover:text-white/60 transition-colors">Sign In</Link>
            <Link href="/register" className="hover:text-slate-700 dark:hover:text-white/60 transition-colors">Register</Link>
            <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="hover:text-slate-700 dark:hover:text-white/60 transition-colors">GitHub</a>
          </div>
          <p className="text-xs text-slate-300 dark:text-white/20">
            © {new Date().getFullYear()} CollabStudy. Built with ♥ and caffeine.
          </p>
        </div>
      </footer>

    </main>
  );
}
