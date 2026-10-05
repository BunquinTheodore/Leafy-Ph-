// Flow 2b: Google sign in (Firebase popup, ID token, verification in FastAPI).
import { FLOW_LAYOUT, layoutDiagram } from '../lib/diagram.mjs';

export default async function flowGoogle(ctx) {
  return layoutDiagram({
    alt: 'Google sign in. Continue with Google lazy loads the Firebase SDK and opens the Google popup, or a redirect when popups are blocked. Firebase returns an ID token and the browser posts it to /api/auth/google. Next checks the origin and calls FastAPI, which verifies the ID token with Google public certificates, then finds, links or creates the account. When it links an existing password account, a notice says so. Next sets the cookies and the user goes to next or the dashboard. Closing the popup or a failed check returns to /login with a calm note.',
    nodes: [
      { id: 'btn', row: 0, col: 0, title: 'Continue with Google', noWrapTitle: true, sub: 'On /login and /register', kind: 'primary' },
      { id: 'popup', row: 0, col: 1, title: 'Firebase popup', sub: 'SDK loads on click. Redirect if the popup is blocked', kind: 'external' },
      { id: 'token', row: 0, col: 2, title: 'Firebase ID token', sub: 'The browser gets a signed JWT' },
      { id: 'cancel', row: 0, col: 3, title: 'Back to /login', sub: 'Calm note: Sign in was cancelled' },
      { id: 'handler', row: 1, col: 2, title: '/api/auth/google', sub: 'POST {id_token}. Same origin check' },
      { id: 'error', row: 1, col: 3, title: 'Sign in failed', sub: 'google_auth_failed. An unverified Google email is refused' },
      { id: 'fastapi', row: 1, col: 1, title: 'POST /auth/google', sub: 'Verify signature, iss, aud, exp, provider, email' },
      { id: 'account', row: 1, col: 0, title: 'Find, link or create', sub: 'Keyed by Firebase uid. Verified email links' },
      { id: 'notice', row: 2, col: 0, title: 'Notice shown', sub: 'We linked your Google account to your existing account' },
      { id: 'session', row: 2, col: 1, title: 'Cookies set', sub: 'Next sets leafy_at and leafy_rt' },
      { id: 'done', row: 2, col: 2, title: 'Dashboard or next', sub: 'First time: short welcome', kind: 'primary' },
      { id: 'setpw', row: 2, col: 3, title: 'Set a password', sub: 'Optional panel in Account' },
    ],
    edges: [
      { from: 'btn', to: 'popup', label: 'click' },
      { from: 'popup', to: 'token', label: 'signed in', style: 'response' },
      { from: 'popup', to: 'cancel', label: 'closed', fromSide: 'top', toSide: 'top', stubFrom: 24, stubTo: 24 },
      { from: 'token', to: 'handler', label: 'POST id_token' },
      { from: 'handler', to: 'error', label: 'bad origin', fromAt: 0.3, toAt: 0.3 },
      { from: 'handler', to: 'fastapi', label: 'id_token' },
      { from: 'fastapi', to: 'error', label: 'rejected', fromSide: 'bottom', toSide: 'bottom', fromAt: 0.35, toAt: 0.8, stubFrom: 30, labelAt: 'start' },
      { from: 'fastapi', to: 'account', label: 'verified' },
      { from: 'account', to: 'notice', label: 'if linked', style: 'optional' },
      { from: 'notice', to: 'session', label: 'then', style: 'response' },
      { from: 'account', to: 'session', label: 'new user', style: 'response', fromSide: 'right', toSide: 'top' },
      { from: 'session', to: 'done', label: '302', style: 'response' },
      { from: 'done', to: 'setpw', label: 'later', style: 'optional' },
    ],
    options: { gapX: 36, gapY: 54, maxNodeW: 152, ...FLOW_LAYOUT },
  }, ctx);
}
