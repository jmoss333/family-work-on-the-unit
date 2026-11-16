// Every claim that cites evidence points at a register entry that exists, carries a real
// identifier and records when it was checked against its source.
//
// WHY THIS IS A TEST AND NOT A HABIT: in the Psychiatry Clerkship Library, two agent-written
// changes once added 85 citations to reviewed pages, and 53 of the 74 that could be checked
// were misattributed or fabricated. A citation that no test can trace is a liability.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, anchors, built, htmlFiles, ids, read } from './helpers.mjs';

const register = JSON.parse(readFileSync(join(ROOT, 'evidence/register.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(join(ROOT, 'content/manifest.json'), 'utf8'));
const byId = new Map(register.records.map((record) => [record.id, record]));

test('A10 · every register entry has an identifier a reader can follow and a dated source check', () => {
  assert.equal(byId.size, register.records.length, 'duplicate ids');
  for (const record of register.records) {
    const c = record.citation || {};
    assert.ok(c.pmid || c.doi || (record.links || []).length, `${record.id}: no PMID, DOI or link`);
    if (c.pmid) assert.match(c.pmid, /^\d{6,9}$/, `${record.id}: PMID`);
    if (c.doi) assert.match(c.doi, /^10\.\d{4,9}\/\S+$/, `${record.id}: DOI`);
    if (c.pmcid) assert.match(c.pmcid, /^PMC\d+$/, `${record.id}: PMCID`);
    for (const link of record.links || []) assert.match(link.url, /^https:\/\//, `${record.id}: link`);
    assert.match(record.check.on, /^\d{4}-\d{2}-\d{2}$/, `${record.id}: check date`);
    assert.ok(record.check.source, `${record.id}: check source`);
    assert.ok(['matches', 'matches-with-notes'].includes(record.check.result), `${record.id}: check result`);
    if (record.check.result === 'matches-with-notes') assert.ok(record.check.notes.length, `${record.id}: says "with notes" and gives none`);
    assert.ok(['astra-brief', 'claude'].includes(record.summaryBy), `${record.id}: who drafted the summary`);
    assert.ok(record.summary.length > 40, `${record.id}: summary`);
  }
});

test('A10 · every [D1]-style reference in the teaching text resolves to a register entry', () => {
  const dirs = ['content/cards', 'content/pages', 'content/upstream'];
  const files = [];
  const collect = (dir) => {
    for (const name of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
      if (name.isDirectory()) collect(join(dir, name.name));
      else if (name.name.endsWith('.md')) files.push(join(dir, name.name));
    }
  };
  dirs.forEach(collect);
  let found = 0;
  for (const file of files) {
    const text = readFileSync(join(ROOT, file), 'utf8');
    for (const [, list] of text.matchAll(/\\?\[((?:[DXRG]\d+)(?:,\s*[DXRG]\d+)*)\\?\]/g)) {
      for (const id of list.split(/,\s*/)) {
        found += 1;
        assert.ok(byId.has(id), `${file} cites [${id}], which is not in the register`);
      }
    }
  }
  assert.ok(found >= 9, `expected the six cards to cite the register; found ${found} references`);
  for (const page of manifest.pages) for (const id of page.evidence || []) assert.ok(byId.has(id), `${page.slug} lists unknown evidence ${id}`);
});

test('A10 · on the built site, every evidence chip lands on its entry in the register', () => {
  const { dir } = built('review');
  const registerIds = new Set(ids(read(dir, 'evidence/register.html')));
  for (const id of byId.keys()) assert.ok(registerIds.has(id), `the register page has no anchor for ${id}`);
  let chips = 0;
  for (const file of htmlFiles(dir)) {
    for (const { href, tag } of anchors(read(dir, file))) {
      if (!/class="ev-ref"/.test(tag)) continue;
      chips += 1;
      const anchor = href.split('#')[1];
      assert.ok(byId.has(anchor), `${file}: chip points at #${anchor}`);
    }
  }
  assert.ok(chips >= 20);
});

test('A10 · the register page says plainly what its check does and does not establish', () => {
  const page = read(built('review').dir, 'evidence/register.html');
  assert.match(page, /It is not a faculty review of what the studies mean for practice\./);
  assert.match(page, /Do not carry an OR or NNT onto these cards\./);
  // The move cards obey that rule: no effect size appears on any of them.
  for (const name of readdirSync(join(ROOT, 'content/cards'))) {
    const card = readFileSync(join(ROOT, 'content/cards', name), 'utf8');
    assert.ok(!/\b(?:OR|NNT|RR|HR)\s*[=≈]?\s*\d/.test(card), `${name} quotes an effect size`);
    assert.ok(!/\d\s*%/.test(card), `${name} quotes a percentage`);
  }
});
