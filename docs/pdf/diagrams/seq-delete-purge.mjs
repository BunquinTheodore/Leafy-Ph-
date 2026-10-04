// Section 6: account delete, part 2 (the purge job drains the outbox).
import { sequenceDiagram } from './_seq.mjs';

export default async function seqDeletePurge(ctx) {
  return sequenceDiagram({
    alt: 'Account delete sequence, part two. After the commit a purge job drains the storage_deletion outbox: it takes pending keys from PostgreSQL, deletes the objects from S3 in chunks, marks the rows done and retries failures, so the account is gone even when S3 is down.',
    startAt: 8,
    participants: [
      { id: 'api', title: 'FastAPI', kind: 'primary' },
      { id: 'purge', title: 'Purge job' },
      { id: 's3', title: 'S3 storage', kind: 'store' },
      { id: 'pg', title: 'PostgreSQL', sub: 'storage_deletion', kind: 'store' },
    ],
    items: [
      { t: 'msg', from: 'api', to: 'purge', label: 'async: drain after commit', style: 'optional' },
      { t: 'msg', from: 'purge', to: 'pg', label: 'take pending keys' },
      { t: 'msg', from: 'purge', to: 's3', label: 'delete objects' },
      { t: 'msg', from: 'purge', to: 'pg', label: 'mark rows done' },
      { t: 'note', over: ['pg', 's3'], text: 'If S3 is down the rows stay and are retried. The account is already gone. Deleting one scan uses the same outbox.' },
    ],
  }, ctx);
}
