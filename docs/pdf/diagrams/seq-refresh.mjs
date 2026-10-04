// Section 6: refresh rotation with reuse detection and the grace window.
import { sequenceDiagram } from './_seq.mjs';

export default async function seqRefresh(ctx) {
  return sequenceDiagram({
    rowMin: 32,
    alt: 'Refresh rotation sequence. Next.js posts the refresh token to FastAPI, which locks the token row. An unknown, expired or revoked token gives 401 refresh_invalid. A valid unrotated token is rotated and the new tokens are returned. A token that was already rotated within the 10 second grace window gets an access token only. Reuse after the grace window revokes the whole token family, commits that, and answers 401 refresh_reuse_detected.',
    participants: [
      { id: 'next', title: 'Next.js', sub: 'Middleware or apiFetch, single flight', kind: 'primary' },
      { id: 'api', title: 'FastAPI', sub: 'Token service', kind: 'primary' },
      { id: 'pg', title: 'PostgreSQL', sub: 'refresh_token', kind: 'store' },
    ],
    items: [
      { t: 'msg', from: 'next', to: 'api', label: 'POST /auth/refresh {refresh_token}' },
      { t: 'msg', from: 'api', to: 'pg', label: 'SELECT the row FOR UPDATE, by token hash' },
      { t: 'frame', label: 'alt: unknown, expired or revoked' },
      { t: 'msg', from: 'api', to: 'next', label: '401 refresh_invalid', style: 'response' },
      { t: 'else', label: 'else: valid and not rotated yet' },
      { t: 'msg', from: 'api', to: 'pg', label: 'set rotated_at, insert the next token' },
      { t: 'msg', from: 'api', to: 'next', label: '200 new access and refresh token', style: 'response' },
      { t: 'else', label: 'else: already rotated, inside the 10 s grace window' },
      { t: 'msg', from: 'api', to: 'next', label: '200 access token only', style: 'response' },
      { t: 'else', label: 'else: already rotated, after the grace window (token reuse)' },
      { t: 'msg', from: 'api', to: 'pg', label: 'revoke the whole family, COMMIT first' },
      { t: 'msg', from: 'api', to: 'next', label: '401 refresh_reuse_detected', style: 'response' },
      { t: 'end' },
    ],
  }, ctx);
}
