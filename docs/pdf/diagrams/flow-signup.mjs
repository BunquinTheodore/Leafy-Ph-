// Flow 2: sign up. No email step: the account is created and signed in at once.
import { FLOW_LAYOUT, layoutDiagram } from '../lib/diagram.mjs';

export default async function flowSignup(ctx) {
  return layoutDiagram({
    alt: 'Sign up. Register creates the account and signs the user in at once, then redirects to next or the dashboard. There is no email step and no verification, so every signed in user can open /scan. An email that already has an account shows an already used message with a link to sign in and the Google recovery hint.',
    nodes: [
      { id: 'register', row: 0, col: 0, title: '/register', sub: 'Name, email, password with a strength hint', kind: 'primary' },
      { id: 'create', row: 0, col: 1, title: 'Account created', sub: 'POST /auth/register, 201, signed in at once. No email is sent' },
      { id: 'dash', row: 0, col: 2, title: 'Dashboard or next', sub: 'next is sanitized. A guided first scan prompt', kind: 'primary' },
      { id: 'taken', row: 1, col: 0, title: 'Email already used', sub: '409 email_taken. That email already has an account' },
      { id: 'login', row: 1, col: 1, title: '/login', sub: 'Sign in, or use Google with the same email if the password is forgotten', kind: 'external' },
      { id: 'scan', row: 1, col: 2, title: '/scan', sub: 'Open to every signed in user, nothing to verify' },
    ],
    edges: [
      { from: 'register', to: 'create', label: 'submit' },
      { from: 'register', to: 'taken', label: 'email exists' },
      { from: 'create', to: 'dash', label: 'redirect', style: 'response' },
      { from: 'taken', to: 'login', label: 'sign in' },
      { from: 'dash', to: 'scan', label: 'Scan a leaf' },
    ],
    options: { gapX: 56, gapY: 56, maxNodeW: 220, ...FLOW_LAYOUT },
  }, ctx);
}
