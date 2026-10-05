// Section 6: set a new password. A recent Google sign in replaces the current password (the recovery path, no email).
import { sequenceDiagram } from './_seq.mjs';

export default async function seqPassword(ctx) {
  return sequenceDiagram({
    alt: 'Set a new password sequence. The browser posts the new password, with a current password when it has one, to Next.js, which calls FastAPI. FastAPI reads how the session was created. If the session came from a Google sign in less than 10 minutes ago, the new password is accepted without the current one, the hash is replaced and every other refresh family is revoked. Otherwise, a stale Google session or a password sign in, the current password is required and a wrong or missing one gives 403 password_incorrect. No email is sent.',
    participants: [
      { id: 'browser', title: 'Browser', sub: 'Account, Password', kind: 'primary' },
      { id: 'next', title: 'Next.js', sub: 'Route handler' },
      { id: 'api', title: 'FastAPI', sub: 'Account service', kind: 'primary' },
      { id: 'pg', title: 'PostgreSQL', sub: 'users, refresh_token', kind: 'store' },
    ],
    items: [
      { t: 'msg', from: 'browser', to: 'next', label: 'POST /api/me/password' },
      { t: 'msg', from: 'next', to: 'api', label: 'POST /users/me/password' },
      { t: 'note', over: ['next', 'pg'], text: 'The session records how it began: `google` or `password` and the Firebase sign in time. A refresh keeps that time.' },
      { t: 'frame', label: 'alt: Google sign in under 10 minutes ago' },
      { t: 'msg', from: 'api', to: 'pg', label: 'set hash, revoke other families' },
      { t: 'msg', from: 'api', to: 'next', label: '200 updated, no email', style: 'response' },
      { t: 'msg', from: 'next', to: 'browser', label: '200, other sessions end', style: 'response' },
      { t: 'else', label: 'else: older Google session, or a password sign in' },
      { t: 'msg', from: 'api', to: 'pg', label: 'check current_password' },
      { t: 'msg', from: 'api', to: 'next', label: '200, or 403 password_incorrect', style: 'response' },
      { t: 'msg', from: 'next', to: 'browser', label: 'updated, or an inline error', style: 'response' },
      { t: 'end' },
    ],
  }, ctx);
}
