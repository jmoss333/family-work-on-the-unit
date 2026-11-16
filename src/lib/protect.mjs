// Names this site must not print: the unit its workflow comes from, that unit's institution
// and affiliates, and the products it uses.
//
// The list is stored as SHA-256 hashes (governance/protected-terms.json), so the file that
// guards the names does not itself spell them out in a public repository. Be clear about
// what that buys: a hash of a short name can be confirmed by anyone who already suspects
// the name. The hashes keep the names from being written down here; they do not keep a
// determined reader from guessing them. The author is named on the site, and an author's
// employer is a search away. "De-identified" on this site means: not named, no patient or
// staff detail, no internal figure.
import { createHash } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Lower-case words: letters and digits only, accents folded. "Ward-7" and "ward 7" agree. */
export const words = (text) =>
  String(text)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

const sha256 = (text) => createHash('sha256').update(text).digest('hex');

/** The stored form of a term. */
export const termHash = (term) => sha256(words(term).join(' '));
/** For a term of several words: the hash of its first word, so a scan can skip quickly. */
export const startHash = (term) => {
  const list = words(term);
  return list.length > 1 ? sha256(list[0]) : null;
};

/**
 * Find protected terms in a text.
 * @param {string} text
 * @param {{hashes: string[], starts: string[], maxWords: number}} terms
 * @returns {{line: number, words: number}[]} where each hit begins. The matched term is
 *          deliberately not returned: a failing test in a public build log must not print it.
 */
export function findProtected(text, terms) {
  const hashes = new Set(terms.hashes);
  const starts = new Set(terms.starts);
  const cache = new Map();
  const one = (word) => {
    if (!cache.has(word)) cache.set(word, sha256(word));
    return cache.get(word);
  };
  const tokens = [];
  String(text)
    .split('\n')
    .forEach((line, index) => {
      for (const word of words(line)) tokens.push({ word, line: index + 1 });
    });
  const hits = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const first = one(tokens[i].word);
    if (hashes.has(first)) hits.push({ line: tokens[i].line, words: 1 });
    if (!starts.has(first)) continue;
    for (let n = 2; n <= terms.maxWords && i + n <= tokens.length; n += 1) {
      const phrase = tokens.slice(i, i + n).map((token) => token.word).join(' ');
      if (hashes.has(sha256(phrase))) hits.push({ line: tokens[i].line, words: n });
    }
  }
  return hits;
}

/** Every file git would track, as paths relative to `root`. Third-party code is left out. */
export function trackedFiles(root, dir = root) {
  const skip = new Set(['.git', 'node_modules', 'dist', 'dist-public', 'vendor', '.DS_Store']);
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...trackedFiles(root, abs));
    else out.push(abs.slice(root.length + 1).split('\\').join('/'));
  }
  return out.sort();
}

/** A one-line description of hits that names the place and never the term. */
export const describeHits = (where, hits) =>
  `${where}: ${hits.length} protected ${hits.length === 1 ? 'term' : 'terms'} (line ${[...new Set(hits.map((hit) => hit.line))].join(', ')})`;
