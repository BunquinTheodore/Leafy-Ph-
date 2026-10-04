// Section 6: password reset token, part 1 (ask for the mail).
import { sequenceDiagram } from './_seq.mjs';

export default async function seqReset(ctx) {
  return sequenceDiagram({
    labelGap: 11, // 3px more clearance between each label and its arrow
    alt: 'Password reset sequence, part one. Forgot password always answers 200 with the same message. If the account exists a one hour token is stored as sha256 and mailed.',
    participants: [
      { id: 'browser', title: 'Browser', kind: 'primary' },
      { id: 'next', title: 'Next.js' },
      { id: 'api', title: 'FastAPI', kind: 'primary' },
      { id: 'pg', title: 'PostgreSQL', sub: 'auth_token', kind: 'store' },
      { id: 'smtp', title: 'SMTP', sub: 'Mailpit in dev', kind: 'external' },
    ],
    items: [
      { t: 'msg', from: 'browser', to: 'next', label: 'forgot password, email' },
      { t: 'msg', from: 'next', to: 'api', label: 'POST /auth/forgot-password' },
      { t: 'msg', from: 'api', to: 'pg', label: 'store reset token, if user' },
      { t: 'msg', from: 'api', to: 'smtp', label: 'reset mail, if account exists', style: 'optional' },
      { t: 'msg', from: 'api', to: 'next', label: '200, always the same', style: 'response' },
      { t: 'msg', from: 'next', to: 'browser', label: 'same message for everyone', style: 'response' },
    ],
  }, ctx);
}
