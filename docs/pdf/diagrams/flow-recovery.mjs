// Flow 3b: forgot password. No email: a recent Google sign in lets the user set a new password.
import { FLOW_LAYOUT, layoutDiagram } from '../lib/diagram.mjs';

export default async function flowRecovery(ctx) {
  return layoutDiagram({
    alt: 'Forgot password, with no email. The login page shows the help text: Forgot your password? Sign in with Google using the same email, then set a new password in Account. Continue with Google links to the existing account and starts a fresh session. In Account, Password, a Google session younger than 10 minutes asks only for the new password, which ends every other session. An older Google session, or a password sign in, still asks for the current password, and the user can sign in with Google again to start a fresh session. Then the user signs in with the new password.',
    nodes: [
      { id: 'help', row: 0, col: 0, title: '/login help text', sub: 'Forgot your password? Sign in with Google using the same email', kind: 'primary' },
      { id: 'google', row: 0, col: 1, title: 'Continue with Google', noWrapTitle: true, sub: 'Same email as the account. It links to it', kind: 'external' },
      { id: 'fresh', row: 0, col: 2, title: 'Fresh Google session', sub: 'Firebase sign in under 10 minutes ago' },
      { id: 'account', row: 0, col: 3, title: 'Account, Password', sub: 'POST /users/me/password. New password only', kind: 'primary' },
      { id: 'stale', row: 1, col: 2, title: 'Older session', sub: 'Over 10 minutes, or a password sign in. Asks for the current password' },
      { id: 'updated', row: 1, col: 3, title: 'Password updated', sub: 'Ends every other session. No email is sent' },
      { id: 'login', row: 2, col: 3, title: '/login', sub: 'Sign in with the new password', kind: 'primary' },
    ],
    edges: [
      { from: 'help', to: 'google', label: 'tap' },
      { from: 'google', to: 'fresh', label: 'signed in', style: 'response' },
      { from: 'fresh', to: 'account', label: 'open Account' },
      { from: 'account', to: 'updated', label: 'fresh: valid' },
      { from: 'account', to: 'stale', label: 'stale', fromSide: 'bottom', toSide: 'right', fromAt: 0.25, style: 'optional' },
      { from: 'stale', to: 'google', label: 'sign in again', style: 'optional', fromSide: 'left', toSide: 'bottom' },
      { from: 'updated', to: 'login', label: 'continue' },
    ],
    options: { gapX: 36, gapY: 52, maxNodeW: 176, ...FLOW_LAYOUT },
  }, ctx);
}
