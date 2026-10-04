// Flow 3b: forgot and reset password.
import { FLOW_LAYOUT, layoutDiagram } from '../lib/diagram.mjs';

export default async function flowRecovery(ctx) {
  return layoutDiagram({
    alt: 'Forgot and reset password. The user enters an email on /forgot-password and always sees the same message. If an account exists an email with a one hour link is sent. The link opens /reset-password with the token; a valid token lets the user set a new password, ends all other sessions and sends a password changed notice, then the user signs in again. An invalid or expired token shows one uniform error and a way to ask again.',
    nodes: [
      { id: 'forgot', row: 0, col: 0, title: '/forgot-password', sub: 'Enter your email', kind: 'primary' },
      { id: 'sent', row: 0, col: 1, title: 'Same message always', sub: 'If an account exists, we sent a reset link' },
      { id: 'mail', row: 0, col: 2, title: 'Reset email', sub: 'Link valid for 1 hour. Read it in Mailpit while developing', kind: 'external' },
      { id: 'reset', row: 0, col: 3, title: '/reset-password', sub: 'Opened from the link with ?token=. New password with a strength hint' },
      { id: 'err', row: 1, col: 0, title: 'Link invalid or expired', sub: 'One uniform error: token_invalid_or_expired' },
      { id: 'updated', row: 1, col: 3, title: 'Password updated', sub: 'Ends every session and sends a password changed email' },
      { id: 'login', row: 2, col: 3, title: '/login', sub: 'Please sign in', kind: 'primary' },
    ],
    edges: [
      { from: 'forgot', to: 'sent', label: 'submit' },
      { from: 'sent', to: 'mail', label: 'mail', style: 'response' },
      { from: 'mail', to: 'reset', label: 'tap link' },
      { from: 'reset', to: 'updated', label: 'valid token' },
      { from: 'reset', to: 'err', label: 'bad token', fromSide: 'bottom', toSide: 'right', fromAt: 0.25 },
      { from: 'updated', to: 'login', label: 'continue' },
      { from: 'err', to: 'forgot', label: 'ask again', style: 'optional', fromSide: 'top', toSide: 'bottom' },
    ],
    options: { gapX: 52, gapY: 52, maxNodeW: 190, ...FLOW_LAYOUT },
  }, ctx);
}
