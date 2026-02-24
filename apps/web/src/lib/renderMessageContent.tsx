import React from 'react';
import { MentionUser } from '@/lib/api';

/**
 * Parses a message string and renders @mentions as highlighted spans.
 *
 * A word is highlighted if:
 *   1. It starts with '@'
 *   2. The remainder exactly matches a username in the `mentions` array
 *      (case-insensitive)
 *
 * All other text is rendered as plain strings.
 */
export function renderMessageContent(
  content: string,
  mentions: MentionUser[] = [],
): React.ReactNode {
  if (!mentions.length) return content;

  const mentionMap = new Map(
    mentions.map((m) => [m.username.toLowerCase(), m]),
  );

  // Split on word boundaries but keep the delimiters so we can re-join
  const tokens = content.split(/(\s+)/);

  return (
    <>
      {tokens.map((token, i) => {
        if (token.startsWith('@')) {
          const name = token.slice(1).replace(/[.,!?;:]$/, ''); // strip trailing punctuation
          const trailing = token.slice(1 + name.length);
          const member = mentionMap.get(name.toLowerCase());

          if (member) {
            return (
              <React.Fragment key={i}>
                <span className="inline-flex items-center text-blue-400 font-semibold bg-blue-900/40 rounded px-1 py-0.5 text-sm">
                  @{member.username}
                </span>
                {trailing}
              </React.Fragment>
            );
          }
        }
        return token;
      })}
    </>
  );
}
