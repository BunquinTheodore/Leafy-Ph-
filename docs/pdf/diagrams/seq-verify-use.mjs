// Section 6: email verification token, part 2 (use the token).
import { sequenceDiagram } from './_seq.mjs';

export default async function seqVerifyUse(ctx) {
  return sequenceDiagram({
    alt: 'Email verification sequence, part two. The user opens the link; Next.js posts the token to FastAPI, which consumes it atomically with a single UPDATE. A valid token verifies the email. An unknown, used or expired token gives one uniform 400.',
    startAt: 6,
    participants: [
      { id: 'browser', title: 'Browser', kind: 'primary' },
      { id: 'next', title: 'Next.js' },
      { id: 'api', title: 'FastAPI', kind: 'primary' },
      { id: 'pg', title: 'PostgreSQL', sub: 'auth_token', kind: 'store' },
    ],
    items: [
      { t: 'note', over: ['browser', 'pg'], text: 'Later, the user taps the link. Consuming is one UPDATE that needs used_at empty and expires_at in the future, RETURNING user_id. Failure gives token_invalid_or_expired.' },
      { t: 'msg', from: 'browser', to: 'next', label: 'open link, page posts token' },
      { t: 'msg', from: 'next', to: 'api', label: 'POST /auth/verify-email {token}' },
      { t: 'msg', from: 'api', to: 'pg', label: 'consume token atomically' },
      { t: 'msg', from: 'api', to: 'next', label: '200, or 400 uniform error', style: 'response' },
      { t: 'msg', from: 'next', to: 'browser', label: 'Verified, or Send a new link', style: 'response' },
    ],
  }, ctx);
}
