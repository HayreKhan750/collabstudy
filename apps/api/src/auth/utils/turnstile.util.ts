/**
 * Cloudflare Turnstile server-side token verification utility.
 * Docs: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */

interface TurnstileVerifyResponse {
  success: boolean;
  'error-codes'?: string[];
  challenge_ts?: string;
  hostname?: string;
}

/**
 * Verifies a Cloudflare Turnstile token against the siteverify API.
 * Returns true if valid, false otherwise.
 *
 * In development/test environments (when TURNSTILE_SECRET_KEY is not set),
 * this always returns true so engineers can work locally without a real key.
 */
export async function verifyTurnstileToken(
  token: string | undefined | null,
  remoteIp?: string,
): Promise<boolean> {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;

  // Bypass in local dev when no secret key is configured
  if (!secretKey) {
    return true;
  }

  // If token is missing, fail immediately
  if (!token) {
    return false;
  }

  // Turnstile test secret always passes — useful for automated tests
  // https://developers.cloudflare.com/turnstile/reference/testing/
  if (secretKey === '1x0000000000000000000000000000000AA') {
    return true;
  }

  try {
    const body = new URLSearchParams({
      secret: secretKey,
      response: token,
      ...(remoteIp ? { remoteip: remoteIp } : {}),
    });

    const response = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      },
    );

    if (!response.ok) {
      return false;
    }

    const data: TurnstileVerifyResponse = await response.json();
    return data.success === true;
  } catch {
    // Network error calling Turnstile — fail open only in dev, fail closed in prod
    return process.env.NODE_ENV !== 'production';
  }
}
