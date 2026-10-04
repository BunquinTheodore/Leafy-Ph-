// Section 6: account delete, part 1 (one transaction).
import { sequenceDiagram } from './_seq.mjs';

export default async function seqDelete(ctx) {
  return sequenceDiagram({
    alt: 'Account delete sequence, part one. Next.js sends the delete to FastAPI, which checks the password. In one transaction it queues every image key in the storage_deletion outbox and deletes the user, cascading to scans, feedback, identities and tokens. The request ends with 204 and the cookies are cleared.',
    participants: [
      { id: 'browser', title: 'Browser', kind: 'primary' },
      { id: 'next', title: 'Next.js' },
      { id: 'api', title: 'FastAPI', kind: 'primary' },
      { id: 'pg', title: 'PostgreSQL', sub: 'users, storage_deletion', kind: 'store' },
    ],
    items: [
      { t: 'msg', from: 'browser', to: 'next', label: 'DELETE /api/me' },
      { t: 'msg', from: 'next', to: 'api', label: 'DELETE /users/me' },
      { t: 'note', over: ['next', 'pg'], text: 'Password re-auth, else 403 password_incorrect. Google only users type DELETE after a fresh sign in (under 10 min). Then one transaction.' },
      { t: 'msg', from: 'api', to: 'pg', label: 'enqueue S3 keys' },
      { t: 'msg', from: 'api', to: 'pg', label: 'delete user, cascade' },
      { t: 'msg', from: 'api', to: 'next', label: '204 No Content', style: 'response' },
      { t: 'msg', from: 'next', to: 'browser', label: 'cookies cleared, goodbye', style: 'response' },
    ],
  }, ctx);
}
