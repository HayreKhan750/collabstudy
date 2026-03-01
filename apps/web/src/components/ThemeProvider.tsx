'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ReactNode } from 'react';

/**
 * ThemeProvider wraps next-themes.
 *
 * Key props:
 * - attribute="class"         → adds/removes `dark` class on <html>
 * - defaultTheme="dark"       → fallback when no preference is stored
 * - enableSystem              → respects OS prefers-color-scheme
 * - disableTransitionOnChange → CRITICAL: prevents CSS transitions from
 *   firing mid-swap, which caused the UI to look broken on toggle until
 *   a page refresh. Transitions are disabled for the swap frame only.
 * - storageKey="theme"        → matches what SettingsPanel reads via useTheme
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={true}
      disableTransitionOnChange={true}
      storageKey="theme"
    >
      {children}
    </NextThemesProvider>
  );
}
