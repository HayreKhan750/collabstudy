import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * cn() — class name utility.
 *
 * Combines clsx (conditional classes) with tailwind-merge (deduplication).
 * This ensures Tailwind utility conflicts are resolved correctly — e.g.,
 * cn('px-2', 'px-4') → 'px-4' (last wins, no duplicate padding classes).
 *
 * Usage:
 *   cn('base-class', condition && 'conditional-class', 'always-class')
 *   cn(styles.root, isActive && 'bg-primary', className)
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
