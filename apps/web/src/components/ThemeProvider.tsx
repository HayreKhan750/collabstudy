'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ReactNode } from 'react';

/**
 * ThemeProvider wraps next-themes and sets the attribute to "data-theme"
 * so our CSS variables (defined on [data-theme="light"]) activate correctly.
 * Dark mode is the default and system preference is respected.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={true}
      disableTransitionOnChange={false}
    >
      {children}
    </NextThemesProvider>
  );
}
