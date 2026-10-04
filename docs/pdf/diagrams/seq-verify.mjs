// Section 6: email verification token, part 1 (issue the token).
import { sequenceDiagram } from './_seq.mjs';

export default async function seqVerify(ctx) {
  return sequenceDiagram({
    alt: 'Email verification sequence, part one. Register or resend makes a random token, stores only its sha256 in PostgreSQL and mails a link through SMTP. FastAPI answers 201 with a session, or 200 on resend.',
    participants: [
      { id: 'browser', title: 'Browser', kind: 'primary' },
      { id: 'next', title: 'Next.js' },
      { id: 'api', title: 'FastAPI', kind: 'primary' },
      { id: 'pg', title: 'PostgreSQL', sub: 'auth_token', kind: 'store' },
      { id: 'smtp', title: 'SMTP', sub: 'Mailpit in dev', kind: 'external' },
    ],
    items: [
      { t: 'msg', from: 'browser', to: 'next', label: 'sign up or resend' },
      { t: 'msg', from: 'next', to: 'api', label: 'POST /auth/register or resend' },
      { t: 'note', over: ['next', 'pg'], text: 'Random 256 bit token. Only its sha256 is stored: type verify_email, expires in 24 h. Resend has a 60 s cooldown. The link is /verify-email?token=.' },
      { t: 'msg', from: 'api', to: 'pg', label: 'insert token hash' },
      { t: 'msg', from: 'api', to: 'smtp', label: 'mail with the link', style: 'response' },
      { t: 'msg', from: 'api', to: 'next', label: '201 session, or 200 on resend', style: 'response' },
    ],
  }, ctx);
}
