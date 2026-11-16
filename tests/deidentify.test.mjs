// What the site must not name, and what a page about a real unit must not report.
//
// The names are checked against a list of hashes (src/lib/protect.mjs says what that does
// and does not protect). No test here prints a protected term: a failure names the file and
// the line, because a public repository has public build logs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from '../src/build.mjs';
import { SiteError, loadSite } from '../src/lib/model.mjs';
import { describeHits, findProtected, startHash, termHash, trackedFiles } from '../src/lib/protect.mjs';
import { ROOT, built, htmlFiles, read, scratchRepo } from './helpers.mjs';

const terms = JSON.parse(readFileSync(join(ROOT, 'governance/protected-terms.json'), 'utf8'));
// Two invented terms, used only to prove the check works.
const planted = {
  ...terms,
  hashes: [...terms.hashes, termHash('Qzx Test Infirmary'), termHash('QX7')],
  starts: [...terms.starts, startHash('Qzx Test Infirmary')],
};

test('A14 · the protected list holds hashes only, and no file lists the names in clear text', () => {
  assert.ok(terms.hashes.length >= 12, 'the list is shorter than expected');
  for (const hash of [...terms.hashes, ...terms.starts]) assert.match(hash, /^[a-f0-9]{64}$/);
  assert.deepEqual(Object.keys(terms).sort(), ['algorithm', 'hashes', 'limits', 'maxWords', 'note', 'schema', 'starts']);
  assert.ok(!/protectedNames/.test(readFileSync(join(ROOT, 'site.config.json'), 'utf8')), 'site.config.json lists names in clear text');
});

test('A14 · no tracked file carries a protected term, in its text or in its name', () => {
  const files = trackedFiles(ROOT);
  assert.ok(files.includes('workflows/unit-family-meeting.workflow.json') && files.includes('README.md'));
  const problems = [];
  for (const rel of files) {
    if (findProtected(rel, terms).length) problems.push(`${rel}: a protected term in the path`);
    const hits = findProtected(readFileSync(join(ROOT, rel), 'utf8'), terms);
    if (hits.length) problems.push(describeHits(rel, hits));
  }
  assert.deepEqual(problems, []);
});

for (const channel of ['review', 'public']) {
  test(`A14 · ${channel}: no built file prints a protected term, in text, attribute or data block`, () => {
    const { dir } = built(channel);
    const problems = [];
    for (const file of [...htmlFiles(dir), 'build-report.json', 'robots.txt']) {
      const hits = findProtected(read(dir, file), terms);
      if (hits.length) problems.push(describeHits(file, hits));
    }
    assert.deepEqual(problems, []);
  });
}

test('A14 · the check finds a planted name whatever its case or punctuation, across a line break, and not inside another word', () => {
  assert.equal(findProtected('Seen at QZX-Test\ninfirmary today.', planted).length, 1);
  assert.equal(findProtected('the qx7 unit', planted).length, 1);
  assert.equal(findProtected('"Qx7."', planted).length, 1);
  assert.equal(findProtected('Qzx Test Clinic, and an aqx7b code', planted).length, 0);
  const message = describeHits('content/pages/example.md', findProtected('line one\nthe QX7 unit', planted));
  assert.equal(message, 'content/pages/example.md: 1 protected term (line 2)');
});

test('A14 · the build refuses to write any page while one page prints a protected name, and does not print the name', () => {
  const dir = scratchRepo();
  writeFileSync(join(dir, 'governance/protected-terms.json'), `${JSON.stringify(planted, null, 2)}\n`);
  appendFileSync(join(dir, 'content/pages/start-how-to-use.md'), '\nFirst used at the Qzx Test Infirmary.\n');
  assert.throws(
    () => build({ root: dir, outDir: mkdtempSync(join(tmpdir(), 'fwu-out-')), channel: 'review' }),
    (error) => error instanceof SiteError && /start\/how-to-use\.html: 1 protected term/.test(error.message) && !/qzx|infirmary/i.test(error.message),
  );
});

test('A14 · the scan command passes on this repository', () => {
  const run = spawnSync(process.execPath, [join(ROOT, 'tools/protect-term.mjs'), 'scan'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /No protected term in \d+ files/);
});

// ── Pages about a real unit ───────────────────────────────────────────────────────────
// "Reports no internal figure" is a person's judgement (the release record), with one
// mechanical backstop: every number on such a page must be on the list below. The numbers
// here are the procedure's own rules (day 1, 24 h, 72 h, 5–6 h of sleep, the three format
// lengths), its version and date, and one regulation. Adding a number to this list is a
// decision: ask whether it is a count, a rate or a result from the unit.
const NUMBERS_ALLOWED = new Set(['1', '2', '2.0', '5', '6', '24', '30', '42', '60', '72', '90', '2026']);

/** The words a reader sees: every string in a workflow file except link targets. */
function readerText(value, key = '') {
  if (typeof value === 'string') return key === 'to' || key === 'id' || key === 'checksStep' ? '' : `${value}\n`;
  if (Array.isArray(value)) return value.map((item) => readerText(item)).join('');
  if (value && typeof value === 'object') return Object.entries(value).map(([k, v]) => (k === 'roles' ? Object.values(v).join('\n') : readerText(v, k))).join('');
  return '';
}

test('A14 · a page about a real unit prints no number that is not on its list, and names no individual', () => {
  const site = loadSite(ROOT);
  const pages = site.pages.filter((page) => page.release === 'unit-practice');
  assert.deepEqual(pages.map((page) => page.slug), ['system/unit-workflow', 'system/set-it-up']);
  for (const page of pages) {
    const source = page.kind === 'workflow' ? readerText(page.workflowFile) : page.sourceText;
    const text = source
      .replace(/\]\([^)]*\)/g, ']') // link targets
      .replace(/\[(?:[DXRG]\d+)(?:,\s*[DXRG]\d+)*\]/g, ''); // evidence references
    for (const [number] of text.matchAll(/\d+(?:\.\d+)?/g)) assert.ok(NUMBERS_ALLOWED.has(number), `${page.slug}: the number ${number} is not on the list of numbers this page may print`);
    assert.ok(!/\b(?:Dr|Mr|Mrs|Ms|Prof)\.?\s+[A-Z][a-z]+/.test(text), `${page.slug}: names an individual`);
    assert.ok(!/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(text), `${page.slug}: an email address`);
  }
});
