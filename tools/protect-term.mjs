#!/usr/bin/env node
// Manage and run the protected-terms check.
//
//   node tools/protect-term.mjs scan            scan every tracked text file and its path
//   node tools/protect-term.mjs add -           add terms, one per line, read from the keyboard
//   node tools/protect-term.mjs add "A Name"    add a term given on the command line
//
// Prefer "add -": a term typed as an argument is kept in your shell history in clear text.
// Only hashes are written to governance/protected-terms.json (see src/lib/protect.mjs for
// what that does and does not protect). Matching ignores case, accents and punctuation, so
// add each spelling that differs by more than that ("Northside", "North Side").
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describeHits, findProtected, startHash, termHash, trackedFiles, words } from '../src/lib/protect.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = join(root, 'governance', 'protected-terms.json');
const terms = JSON.parse(readFileSync(file, 'utf8'));
const [command, ...args] = process.argv.slice(2);

if (command === 'scan') {
  const problems = [];
  const files = trackedFiles(root);
  for (const rel of files) {
    const inPath = findProtected(rel, terms);
    if (inPath.length) problems.push(`${rel}: a protected term in the file's name or path`);
    const hits = findProtected(readFileSync(join(root, rel), 'utf8'), terms);
    if (hits.length) problems.push(describeHits(rel, hits));
  }
  if (problems.length) {
    console.error(`Protected terms found:\n  - ${problems.join('\n  - ')}`);
    process.exit(1);
  }
  console.log(`No protected term in ${files.length} files (${terms.hashes.length} terms on the list).`);
} else if (command === 'add') {
  const given = args.length === 1 && args[0] === '-' ? readFileSync(0, 'utf8').split('\n') : args;
  const fresh = given.map((term) => term.trim()).filter((term) => words(term).length > 0);
  if (!fresh.length) {
    console.error('add: no term given.');
    process.exit(2);
  }
  const hashes = new Set(terms.hashes);
  const starts = new Set(terms.starts);
  let added = 0;
  for (const term of fresh) {
    const size = words(term).length;
    if (size > terms.maxWords) {
      console.error(`add: a term may have at most ${terms.maxWords} words; one given has ${size}. Raise "maxWords" first.`);
      process.exit(2);
    }
    if (!hashes.has(termHash(term))) added += 1;
    hashes.add(termHash(term));
    if (startHash(term)) starts.add(startHash(term));
  }
  terms.hashes = [...hashes].sort();
  terms.starts = [...starts].sort();
  writeFileSync(file, `${JSON.stringify(terms, null, 2)}\n`);
  console.log(`${added} added; ${terms.hashes.length} terms on the list. Run "node tools/protect-term.mjs scan" next.`);
} else {
  console.error('usage: node tools/protect-term.mjs scan | add - | add "<term>" ...');
  process.exit(2);
}
