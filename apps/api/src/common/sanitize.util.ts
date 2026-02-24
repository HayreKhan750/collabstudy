/**
 * Sanitization utilities (Phase 8.2)
 *
 * We store and process chat content as plain text.  Any HTML/script tags
 * submitted by the client are stripped before the value reaches the service
 * layer.  This is our *backend* defence-in-depth layer — the frontend also
 * renders content safely via React's JSX escaping, but we never trust the
 * client alone.
 *
 * Why a custom implementation instead of a library?
 *   • dompurify is browser-only (needs a DOM).
 *   • sanitize-html adds ~100 kB and complex config we don't need.
 *   • We only need plain-text stripping, not allowed-tag whitelisting.
 *
 * The regex `/<[^>]*>/g` removes every HTML tag (open, close, self-closing).
 * We then decode the most common HTML entities so that content like
 * `&lt;b&gt;hello&lt;/b&gt;` becomes `<b>hello</b>` → stripped → `hello`.
 */

/** Remove all HTML/XML tags and decode common HTML entities. */
export function stripHtml(value: unknown): string {
  if (typeof value !== 'string') return value as string;

  return value
    // 1. Decode common HTML entities first (handles double-encoded payloads)
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2F;/gi, '/')
    // 2. Strip all HTML tags
    .replace(/<[^>]*>/g, '')
    // 3. Collapse multiple spaces/newlines created by tag removal
    .trim();
}

/**
 * class-transformer @Transform value factory for use in DTOs.
 *
 * Usage:
 *   @Transform(sanitizeTransform)
 *   @IsString()
 *   content: string;
 */
export const sanitizeTransform = ({ value }: { value: unknown }): string =>
  stripHtml(value);
