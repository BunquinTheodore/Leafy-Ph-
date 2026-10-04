// Section 6: Google sign in, part 1: start and consent (PKCE, state and nonce are created here).
import { sequenceDiagram } from './_seq.mjs';

export default async function seqGoogle(ctx) {
  return sequenceDiagram({
    alt: 'Google sign in, part one. The browser asks Next.js to start. Next.js makes state, nonce and a PKCE code verifier and stores them in a short lived httpOnly cookie, then redirects to Google. The user picks an account and approves, and Google redirects back to the callback with a code and state.',
    participants: [
      { id: 'browser', title: 'Browser', sub: 'Leafy UI', kind: 'primary' },
      { id: 'next', title: 'Next.js', sub: 'Route handlers' },
      { id: 'google', title: 'Google', sub: 'Account picker and consent', kind: 'external' },
    ],
    items: [
      { t: 'msg', from: 'browser', to: 'next', label: 'GET /api/auth/google' },
      { t: 'note', over: ['next'], text: 'Make state, nonce and a PKCE code_verifier. Keep them, and the sanitized next, in a 10 min httpOnly `__Host-` cookie (SameSite=Lax).' },
      { t: 'msg', from: 'next', to: 'browser', label: '302 to Google + OAuth cookie', style: 'response' },
      { t: 'msg', from: 'browser', to: 'google', label: 'GET authorize: S256 challenge, state, nonce, select_account' },
      { t: 'note', over: ['google'], text: 'The user picks an account and approves openid, email and profile.' },
      { t: 'msg', from: 'google', to: 'browser', label: '302 to the callback with code and state', style: 'response' },
    ],
  }, ctx);
}
