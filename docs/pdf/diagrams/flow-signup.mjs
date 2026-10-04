// Flow 2: sign up and verify email.
import { FLOW_LAYOUT, layoutDiagram } from '../lib/diagram.mjs';

export default async function flowSignup(ctx) {
  return layoutDiagram({
    alt: 'Sign up and verify. Register creates the account and signs the user in, then redirects to the dashboard with a verify banner and sends a verification email. The link opens /verify-email which verifies on load, or shows an expired state with Send a new link. An unverified user who taps Scan is told to verify and can resend with a 60 second cooldown. An existing email shows an already used message.',
    nodes: [
      { id: 'register', row: 0, col: 0, title: '/register', sub: 'Name, email, password with a strength hint', kind: 'primary' },
      { id: 'create', row: 0, col: 1, title: 'Account created', sub: 'POST /auth/register, 201, signed in at once' },
      { id: 'dash', row: 0, col: 2, title: 'Dashboard or next', sub: 'Banner: check your email to verify' },
      { id: 'taken', row: 1, col: 0, title: 'Email already used', sub: '409 email_taken. Links to sign in or reset' },
      { id: 'email', row: 1, col: 1, title: 'Verification email', sub: 'Mailpit in dev. Link valid for 24 h', kind: 'external' },
      { id: 'resend', row: 1, col: 2, title: 'Resend link', sub: 'POST /auth/resend-verification, 60 s cooldown. Scan says: Verify your email to scan' },
      { id: 'success', row: 2, col: 0, title: 'Email verified', sub: 'Success state with a Continue button' },
      { id: 'verify', row: 2, col: 1, title: '/verify-email?token=', sub: 'Verifies on load, POST /auth/verify-email' },
      { id: 'expired', row: 2, col: 2, title: 'Link expired', sub: 'One uniform error. Send a new link' },
    ],
    edges: [
      { from: 'register', to: 'create', label: 'submit' },
      { from: 'register', to: 'taken', label: 'email exists' },
      { from: 'create', to: 'dash', label: 'redirect', style: 'response' },
      { from: 'create', to: 'email', label: 'mail sent', style: 'response' },
      { from: 'dash', to: 'resend', label: 'tap Scan while unverified', style: 'optional' },
      { from: 'resend', to: 'email', label: 'new mail', style: 'response' },
      { from: 'email', to: 'verify', label: 'tap link' },
      { from: 'verify', to: 'success', label: 'valid' },
      { from: 'verify', to: 'expired', label: 'expired or used' },
      { from: 'expired', to: 'resend', label: 'new link' },
    ],
    options: { gapX: 56, gapY: 46, maxNodeW: 220, ...FLOW_LAYOUT },
  }, ctx);
}
