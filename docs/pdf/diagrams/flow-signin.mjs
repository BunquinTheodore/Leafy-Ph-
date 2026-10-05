// Flow 3a: sign in, session expiry and sign out.
import { FLOW_LAYOUT, layoutDiagram } from '../lib/diagram.mjs';

export default async function flowSignin(ctx) {
  return layoutDiagram({
    alt: 'Sign in, session expiry and sign out. /login shows help text for a forgotten password that points to Google. /login submits to POST /auth/login. Success goes to next or the dashboard; wrong credentials show one uniform message and a rate limit shows a countdown. While signed in, middleware refreshes silently; if the refresh fails or the session was revoked the user lands on /login?reason=session_expired. Sign out clears the cookies, revokes the refresh token and returns to the landing page.',
    nodes: [
      { id: 'login', row: 0, col: 0, title: '/login', sub: 'Email and password, or Google', kind: 'primary' },
      { id: 'submit', row: 0, col: 1, title: 'POST /auth/login', sub: 'Rate limit: 10 per 15 min per ip and email' },
      { id: 'dest', row: 0, col: 2, title: 'Next or dashboard', sub: 'next is sanitized: starts with /, never //', kind: 'primary' },
      { id: 'logout', row: 0, col: 3, title: 'Sign out', sub: 'User menu' },
      { id: 'forgot', row: 1, col: 0, title: 'Forgot your password?', sub: 'Sign in with Google using the same email, then set a new password in Account' },
      { id: 'err', row: 1, col: 1, title: 'Message on the form', sub: 'One uniform error, or a countdown when rate limited' },
      { id: 'refresh', row: 1, col: 2, title: 'Silent refresh', sub: 'Middleware, when the token is within 30 s of expiry' },
      { id: 'cleared', row: 1, col: 3, title: 'Cookies cleared', sub: 'Refresh token revoked. Logout is idempotent' },
      { id: 'expired', row: 2, col: 2, title: 'Session expired page', sub: '/login?reason=session_expired with a friendly note, next kept' },
      { id: 'landing', row: 2, col: 3, title: 'Landing /', sub: 'Signed out' },
    ],
    edges: [
      { from: 'login', to: 'submit', label: 'submit' },
      { from: 'login', to: 'forgot', label: 'help text', style: 'optional', fromSide: 'bottom', toSide: 'top' },
      { from: 'submit', to: 'dest', label: 'ok' },
      { from: 'submit', to: 'err', label: 'wrong or limited' },
      { from: 'dest', to: 'logout', label: 'menu' },
      { from: 'dest', to: 'refresh', label: 'every request', fromAt: 0.15, toAt: 0.15 },
      { from: 'logout', to: 'cleared', label: 'confirm' },
      { from: 'cleared', to: 'landing', label: 'go' },
      { from: 'refresh', to: 'expired', label: 'fails or revoked' },
      { from: 'refresh', to: 'dest', label: 'ok', style: 'response', fromSide: 'top', toSide: 'bottom', fromAt: 0.85, toAt: 0.85 },
      { from: 'expired', to: 'login', label: 'sign in again', style: 'optional', fromSide: 'left', toSide: 'bottom', labelAt: 'end' },
    ],
    options: { gapX: 52, gapY: 46, maxNodeW: 165, ...FLOW_LAYOUT },
  }, ctx);
}
