// The digest an attestation binds to. One definition, used by the build, the tests and the
// attest command.
//
// The scheme is the Psychiatry Clerkship Library's (13_Faculty_Resources/_automation/
// attestation_hash.py), kept identical on purpose so a hash here can be re-derived by hand
// with nothing but git:
//
//   a page's contentHash  =  git blob SHA of a small manifest, one line per attested input:
//
//       content/cards/01-prepare-a-meeting.md 4a58007052a65fbc2fc3f910f2855f45a4058e74
//       page_meta e51494b9a628601e078505913ea6ff67d2039bad
//
//   each source line     =  `git hash-object --no-filters <path>`
//   the page_meta line   =  blob SHA of the page's reader-visible metadata (title, summary,
//                           and so on) as key-sorted JSON with no whitespace
//   the digest           =  `printf '%s' "$manifest" | git hash-object --stdin`
//
// Collision resistance is beside the point: the threat is drift (text changing after a
// review), not forgery.
import { createHash } from 'node:crypto';

export const HEX40 = /^[a-f0-9]{40}$/;
export const PENDING_SENTINEL = 'Pending faculty review';

/** The git blob SHA of `data`: identical to `git hash-object --stdin`. */
export function blobSha(data) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8');
  return createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
}

/** Key-sorted JSON with no whitespace, raw UTF-8. */
export function canonicalJson(value) {
  const sort = (v) => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.keys(v).sort().map((key) => [key, sort(v[key])]));
    }
    return v;
  };
  return JSON.stringify(sort(value));
}

/** The reader-visible metadata a review covers. Governance state is deliberately absent. */
export function reviewedMeta(page) {
  const keys = ['title', 'summary', 'kind', 'order', 'phase', 'minutes', 'evidence', 'practice'];
  return Object.fromEntries(keys.filter((key) => page[key] !== undefined).map((key) => [key, page[key]]));
}

/**
 * @param {{path: string, bytes: Buffer}[]} sources
 * @param {object} meta  the result of reviewedMeta()
 * @returns {{digest: string, manifest: string}}
 */
export function pageDigest(sources, meta) {
  if (!sources.length) throw new Error('a digest over no sources would cover nothing');
  const lines = [...sources]
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map((source) => `${source.path} ${blobSha(source.bytes)}`);
  lines.push(`page_meta ${blobSha(canonicalJson(meta))}`);
  const manifest = lines.map((line) => `${line}\n`).join('');
  return { digest: blobSha(manifest), manifest };
}

/** Re-derive an upstream (clerkship-library) ledger digest from the pinned blob SHAs. */
export function upstreamDigest({ path, blob, topicMetaBlob }) {
  const lines = [`${path} ${blob}`];
  if (topicMetaBlob) lines.push(`topic_meta ${topicMetaBlob}`);
  return blobSha(lines.map((line) => `${line}\n`).join(''));
}
