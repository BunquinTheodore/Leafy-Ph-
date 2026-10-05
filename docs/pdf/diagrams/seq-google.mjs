// Section 6: Google sign in, part 1: the Firebase popup and the ID token (no server involved yet).
import { sequenceDiagram } from './_seq.mjs';

export default async function seqGoogle(ctx) {
  return sequenceDiagram({
    alt: 'Google sign in, part one. The user clicks Continue with Google. The browser lazy loads the Firebase SDK, which opens the Google popup. The user picks an account and approves. Firebase returns an ID token to the browser, which posts it to the Next.js route handler.',
    participants: [
      { id: 'browser', title: 'Browser', sub: 'Leafy UI and Firebase SDK', kind: 'primary' },
      { id: 'firebase', title: 'Firebase and Google', sub: 'Popup, account picker', kind: 'external' },
      { id: 'next', title: 'Next.js', sub: '/api/auth/google' },
    ],
    items: [
      { t: 'note', over: ['browser'], text: 'Click on Continue with Google. Only now the SDK loads (firebase/app and firebase/auth). No analytics.' },
      { t: 'msg', from: 'browser', to: 'firebase', label: 'signInWithPopup (redirect if blocked)' },
      { t: 'note', over: ['firebase'], text: 'The user picks a Google account and approves.' },
      { t: 'msg', from: 'firebase', to: 'browser', label: 'Firebase ID token', style: 'response' },
      { t: 'msg', from: 'browser', to: 'next', label: 'POST /api/auth/google {id_token}' },
      { t: 'note', over: ['next'], text: 'Same origin check, and next is sanitized. No token is ever placed in a URL.' },
    ],
  }, ctx);
}
