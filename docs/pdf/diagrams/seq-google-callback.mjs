// Section 6: Google sign in, part 2: callback, code exchange and ID token checks.
import { sequenceDiagram } from './_seq.mjs';

export default async function seqGoogleCallback(ctx) {
  return sequenceDiagram({
    alt: 'Google sign in, part two. Google sends the browser to the callback. Next.js checks the state against the cookie and calls FastAPI, which exchanges the code with Google using the client secret, verifies the ID token, finds, links or creates the user and returns the session. Next.js sets the session cookies, clears the OAuth cookie and redirects.',
    participants: [
      { id: 'browser', title: 'Browser', kind: 'primary' },
      { id: 'next', title: 'Next.js', sub: 'Callback route' },
      { id: 'api', title: 'FastAPI', sub: 'Holds the client secret', kind: 'primary' },
      { id: 'google', title: 'Google', kind: 'external' },
      { id: 'pg', title: 'PostgreSQL', sub: 'users, oauth_identity', kind: 'store' },
    ],
    items: [
      { t: 'msg', from: 'browser', to: 'next', label: 'GET callback?code&state' },
      { t: 'note', over: ['browser', 'api'], text: 'The route is /api/auth/google/callback. state must equal the cookie, else invalid_state. The cookie is single use. Next sends on {code, code_verifier, nonce, redirect_uri}.' },
      { t: 'msg', from: 'next', to: 'api', label: 'POST /auth/google' },
      { t: 'msg', from: 'api', to: 'google', label: 'token endpoint + secret' },
      { t: 'msg', from: 'google', to: 'api', label: 'id_token', style: 'response' },
      { t: 'note', over: ['api', 'google'], text: 'Verify the signature with cached JWKS, then iss, aud, exp, nonce and email_verified=true.' },
      { t: 'msg', from: 'api', to: 'pg', label: 'find, link or create' },
      { t: 'msg', from: 'api', to: 'next', label: '200 AuthSessionOut', style: 'response' },
      { t: 'msg', from: 'next', to: 'browser', label: 'Set-Cookie, 302 to next', style: 'response' },
    ],
  }, ctx);
}
