// ER diagram of the Leafy database. Arrows point from the child table to the parent it references.
import { layoutDiagram } from '../lib/diagram.mjs';

export default async function erDatabase(ctx) {
  return layoutDiagram({
    alt: 'Entity relationship diagram. users owns oauth_identity, refresh_token, auth_token and scan rows, all deleted with the user. scan has one optional scan_feedback row and references plant and disease, where the pair (disease_id, plant_id) is a composite key so a disease cannot pair with the wrong plant. disease belongs to plant and owns disease_entry, disease_affected_species and disease_image rows. storage_deletion is a standalone outbox of object keys with no foreign key.',
    nodes: [
      { id: 'oauth', col: 0, row: 0, title: 'oauth_identity', sub: 'provider, provider_sub, email' },
      { id: 'refresh', col: 0, row: 1, title: 'refresh_token', sub: 'family_id, token_hash, rotated_at' },
      { id: 'authtok', col: 0, row: 2, title: 'auth_token', sub: 'type, token_hash, expires_at' },
      { id: 'users', col: 1, row: 1, title: 'users', sub: 'email citext, password_hash, email_verified_at', kind: 'primary' },
      { id: 'feedback', col: 2, row: 0, title: 'scan_feedback', sub: 'is_correct, correct slugs, comment' },
      { id: 'scan', col: 2, row: 1, title: 'scan', sub: 'status, stage, verdict, image_key', kind: 'primary' },
      { id: 'outbox', col: 2, row: 2, title: 'storage_deletion', sub: 'bucket, object_key, attempts', kind: 'store' },
      { id: 'plant', col: 3, row: 0, title: 'plant', sub: 'slug, names, growth fields', kind: 'primary' },
      { id: 'disease', col: 3, row: 1, title: 'disease', sub: 'slug per plant, pathogen_type, severity', kind: 'primary' },
      { id: 'entry', col: 4, row: 0, title: 'disease_entry', sub: 'kind, position, text' },
      { id: 'species', col: 4, row: 1, title: 'disease_affected_species', sub: 'species' },
      { id: 'image', col: 4, row: 2, title: 'disease_image', sub: 'storage_key, sha256' },
    ],
    edges: [
      { from: 'oauth', to: 'users', fromSide: 'right', toSide: 'top' },
      { from: 'refresh', to: 'users', fromSide: 'right', toSide: 'left' },
      { from: 'authtok', to: 'users', fromSide: 'right', toSide: 'bottom' },
      { from: 'scan', to: 'users', fromSide: 'left', toSide: 'right' },
      { from: 'feedback', to: 'scan', fromSide: 'bottom', toSide: 'top' },
      { from: 'scan', to: 'plant', label: 'restrict', style: 'optional', width: 3.2, fromSide: 'right', toSide: 'left' },
      { from: 'scan', to: 'disease', label: 'composite', style: 'optional', width: 3.2, fromSide: 'right', toSide: 'left' },
      { from: 'disease', to: 'plant', label: 'restrict', labelSide: 'left', style: 'optional', width: 3.2, fromSide: 'top', toSide: 'bottom' },
      { from: 'entry', to: 'disease', fromSide: 'left', toSide: 'top' },
      { from: 'species', to: 'disease', fromSide: 'left', toSide: 'right' },
      { from: 'image', to: 'disease', fromSide: 'left', toSide: 'bottom' },
    ],
    options: { gapX: 38, gapY: 40, maxNodeW: 132, minNodeW: 118, fontSize: { title: 12, sub: 12, label: 12 } },
  }, ctx);
}
