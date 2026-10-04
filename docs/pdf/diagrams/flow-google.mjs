// Flow 2b: Google sign in (authorization code with PKCE, state and nonce).
import { FLOW_LAYOUT, layoutDiagram } from '../lib/diagram.mjs';

export default async function flowGoogle(ctx) {
  return layoutDiagram({
    alt: 'Google sign in. Continue with Google starts GET /api/auth/google, which redirects to the Google account picker. Google redirects back to the callback with a code and state. Next checks the state, FastAPI exchanges the code and verifies the ID token, then finds, links or creates the account. When it links an existing password account, a notice says so. Next sets the cookies and redirects to next or the dashboard. Cancelling or a failed check returns to /login with a calm note.',
    nodes: [
      { id: 'btn', row: 0, col: 0, title: 'Continue with Google', noWrapTitle: true, sub: 'On /login and /register', kind: 'primary' },
      { id: 'start', row: 0, col: 1, title: '/api/auth/google', sub: 'GET. Makes state, nonce and PKCE verifier. 10 min cookie' },
      { id: 'google', row: 0, col: 2, title: 'Google account picker', noWrapTitle: true, sub: 'openid email profile, select_account', kind: 'external' },
      { id: 'cancel', row: 0, col: 3, title: 'Back to /login', sub: 'Calm note: Sign in was cancelled' },
      { id: 'callback', row: 1, col: 2, title: 'Callback route', sub: '/api/auth/google/callback checks state' },
      { id: 'error', row: 1, col: 3, title: 'Sign in failed', sub: 'invalid_state or google_auth_failed. An unverified Google email is refused' },
      { id: 'fastapi', row: 1, col: 1, title: 'POST /auth/google', sub: 'Exchange the code, verify the ID token and nonce' },
      { id: 'account', row: 1, col: 0, title: 'Find, link or create', sub: 'Keyed by Google sub. Verified email links' },
      { id: 'notice', row: 2, col: 0, title: 'Notice shown', sub: 'We linked your Google account to your existing account' },
      { id: 'session', row: 2, col: 1, title: 'Cookies set', sub: 'Next sets leafy_at and leafy_rt' },
      { id: 'done', row: 2, col: 2, title: 'Dashboard or next', sub: 'First time: short welcome', kind: 'primary' },
      { id: 'setpw', row: 2, col: 3, title: 'Set a password', sub: 'Optional panel in Account' },
    ],
    edges: [
      { from: 'btn', to: 'start', label: 'click' },
      { from: 'start', to: 'google', label: '302', style: 'response' },
      { from: 'google', to: 'cancel', label: 'cancel' },
      { from: 'google', to: 'callback', label: '302 with code and state', style: 'response' },
      { from: 'callback', to: 'error', label: 'bad state', fromAt: 0.3, toAt: 0.3 },
      { from: 'callback', to: 'fastapi', label: 'code, verifier' },
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
