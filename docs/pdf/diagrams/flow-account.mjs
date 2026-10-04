// Flow 8: account.
import { FLOW_LAYOUT, layoutDiagram } from '../lib/diagram.mjs';

export default async function flowAccount(ctx) {
  return layoutDiagram({
    alt: 'Account. /account has three sideways panels: Profile, Password and Danger zone. Profile saves names with PATCH /users/me. Password changes the password, or lets a Google only user set a first one. The Danger zone explains what is removed and asks for the password, or typing DELETE after a fresh sign in for Google only users. A wrong password shows an inline error. On success the user is signed out and sees a goodbye page.',
    nodes: [
      { id: 'acct', row: 0, col: 0, title: '/account', sub: 'Three sideways panels', kind: 'primary' },
      { id: 'profile', row: 0, col: 1, title: 'Profile', sub: 'First and last name. Shows how you sign in: password and or Google' },
      { id: 'password', row: 0, col: 2, title: 'Password', sub: 'Current and new, with a strength hint' },
      { id: 'danger', row: 0, col: 3, title: 'Danger zone', sub: 'Delete account' },
      { id: 'save', row: 1, col: 1, title: 'Save profile', sub: 'PATCH /users/me. A toast confirms' },
      { id: 'change', row: 1, col: 2, title: 'Change or set password', sub: 'POST /users/me/password. Google only users set a first one, no current password needed' },
      { id: 'confirm', row: 1, col: 3, title: 'Confirm delete', sub: 'Lists what is removed. Password, or type DELETE after a fresh sign in (under 10 min)' },
      { id: 'inline', row: 2, col: 2, title: 'Inline error', sub: '403 password_incorrect. Nothing is deleted' },
      { id: 'goodbye', row: 2, col: 3, title: 'Goodbye page', sub: 'Signed out. Scans and files are removed', kind: 'primary' },
    ],
    edges: [
      { from: 'acct', to: 'profile', label: 'open' },
      { from: 'profile', to: 'password', label: 'next' },
      { from: 'password', to: 'danger', label: 'next' },
      { from: 'profile', to: 'save', label: 'edit' },
      { from: 'password', to: 'change', label: 'submit' },
      { from: 'danger', to: 'confirm', label: 'start' },
      { from: 'confirm', to: 'goodbye', label: 'confirmed' },
      { from: 'confirm', to: 'inline', label: 'wrong password', style: 'optional', fromSide: 'bottom', toSide: 'top' },
    ],
    options: { gapX: 52, gapY: 52, maxNodeW: 200, ...FLOW_LAYOUT },
  }, ctx);
}
