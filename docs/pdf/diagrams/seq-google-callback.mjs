// Section 6: Google sign in, part 2: ID token verification in FastAPI, then the session.
import { sequenceDiagram } from './_seq.mjs';

export default async function seqGoogleCallback(ctx) {
  return sequenceDiagram({
    alt: 'Google sign in, part two. Next.js sends the ID token to FastAPI. FastAPI gets Google public securetoken certificates, cached by Cache-Control, verifies the RS256 signature, iss, aud, exp, iat, auth_time, sub, the google.com provider and the verified email, then finds, links or creates the user and returns the session. Next.js sets the session cookies and redirects.',
    participants: [
      { id: 'browser', title: 'Browser', kind: 'primary' },
      { id: 'next', title: 'Next.js', sub: '/api/auth/google' },
      { id: 'api', title: 'FastAPI', sub: 'No secret, no Admin SDK', kind: 'primary' },
      { id: 'google', title: 'Google', sub: 'Public certificates', kind: 'external' },
      { id: 'pg', title: 'PostgreSQL', sub: 'users, oauth_identity', kind: 'store' },
    ],
    items: [
      { t: 'msg', from: 'next', to: 'api', label: 'POST /auth/google' },
      { t: 'msg', from: 'api', to: 'google', label: 'GET certs (cached)' },
      { t: 'msg', from: 'google', to: 'api', label: 'x509 certs', style: 'response' },
      { t: 'note', over: ['api', 'google'], text: 'Check the RS256 signature by kid, iss = securetoken.google.com/project, aud = project id, exp, iat, auth_time, sub, provider google.com, email_verified=true.' },
      { t: 'msg', from: 'api', to: 'pg', label: 'find, link or create' },
      { t: 'msg', from: 'api', to: 'next', label: '200 AuthSessionOut', style: 'response' },
      { t: 'msg', from: 'next', to: 'browser', label: 'Set-Cookie, go to next', style: 'response' },
    ],
  }, ctx);
}
