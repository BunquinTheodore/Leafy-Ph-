// Section 6: password reset token, part 2 (set the new password).
import { sequenceDiagram } from './_seq.mjs';

export default async function seqResetUse(ctx) {
  return sequenceDiagram({
    alt: 'Password reset sequence, part two. The user posts the token and a new password. The token is consumed atomically, the password is replaced, every refresh token family is revoked and a password changed notice is mailed. A bad token gives one uniform 400.',
    startAt: 7,
    participants: [
      { id: 'browser', title: 'Browser', kind: 'primary' },
      { id: 'next', title: 'Next.js' },
      { id: 'api', title: 'FastAPI', kind: 'primary' },
      { id: 'pg', title: 'PostgreSQL', sub: 'auth + refresh tokens', kind: 'store' },
      { id: 'smtp', title: 'SMTP', sub: 'Mailpit in dev', kind: 'external' },
    ],
    items: [
      { t: 'note', over: ['browser', 'smtp'], text: 'Later, the user taps the link and chooses a new password.' },
      { t: 'msg', from: 'browser', to: 'next', label: 'new password with token' },
      { t: 'msg', from: 'next', to: 'api', label: 'POST /auth/reset-password' },
      { t: 'msg', from: 'api', to: 'pg', label: 'consume token, revoke sessions' },
      { t: 'msg', from: 'api', to: 'smtp', label: 'password changed notice' },
      { t: 'msg', from: 'api', to: 'next', label: '200, or 400 uniform error', style: 'response' },
      { t: 'msg', from: 'next', to: 'browser', label: 'cookies cleared, sign in', style: 'response' },
    ],
  }, ctx);
}
