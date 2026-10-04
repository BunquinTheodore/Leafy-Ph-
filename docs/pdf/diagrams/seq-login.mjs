// Section 6: login with cookies.
import { sequenceDiagram } from './_seq.mjs';

export default async function seqLogin(ctx) {
  return sequenceDiagram({
    alt: 'Login sequence. The browser posts email and password to Next.js, which checks the origin and calls FastAPI. FastAPI loads the user, verifies the argon2id hash, stores a new refresh token family and returns the session. Next.js sets the leafy_at and leafy_rt httpOnly cookies and redirects. Wrong credentials give one uniform 401 and no cookies.',
    participants: [
      { id: 'browser', title: 'Browser', sub: 'Leafy UI', kind: 'primary' },
      { id: 'next', title: 'Next.js', sub: 'Route handler' },
      { id: 'api', title: 'FastAPI', sub: 'Auth service', kind: 'primary' },
      { id: 'pg', title: 'PostgreSQL', sub: 'users, refresh_token', kind: 'store' },
    ],
    items: [
      { t: 'msg', from: 'browser', to: 'next', label: 'POST /api/auth/login {email, password}' },
      { t: 'msg', from: 'next', to: 'api', label: 'POST /auth/login' },
      { t: 'msg', from: 'api', to: 'pg', label: 'find user by email, get the hash' },
      { t: 'frame', label: 'alt: credentials are right' },
      { t: 'msg', from: 'api', to: 'pg', label: 'insert refresh_token, new family' },
      { t: 'msg', from: 'api', to: 'next', label: '200 AuthSessionOut', style: 'response' },
      { t: 'note', over: ['browser', 'api'], text: 'Set `leafy_at` (900 s) and `leafy_rt` (30 d): httpOnly, SameSite=Lax, path /.' },
      { t: 'msg', from: 'next', to: 'browser', label: '200 + Set-Cookie, then redirect', style: 'response' },
      { t: 'else', label: 'else: wrong credentials, no such user, or no password set' },
      { t: 'msg', from: 'api', to: 'next', label: '401 invalid_credentials', style: 'response' },
      { t: 'msg', from: 'next', to: 'browser', label: '401, no cookies set', style: 'response' },
      { t: 'end' },
    ],
  }, ctx);
}
