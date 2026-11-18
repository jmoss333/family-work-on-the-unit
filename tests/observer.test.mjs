import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { build } from '../src/build.mjs';
import { loadSite } from '../src/lib/model.mjs';
import { observerSources, observerVersions } from '../src/lib/observer.mjs';
import { esc } from '../src/lib/render.mjs';
import { ROOT, built, read, scratchRepo } from './helpers.mjs';

const slug = 'teach/observer-card';
const studio = 'studio/when-a-friend-answers-first';
const file = `${slug}.html`;
const pathToRehearsal = `../${studio}.html#practice-heard`;

test('both complete comparison transcripts and the paper card are readable before scripts run', () => {
  const html = read(built('review').dir, file);
  const caseFile = JSON.parse(read(ROOT, 'cases/rowan-sal.case.json'));
  const versions = observerVersions(caseFile);
  assert.deepEqual(versions.map((version) => version.id), ['early', 'correct']);
  for (const { id, label, turns } of versions) {
    const section = html.match(new RegExp(`<section data-version="${id}"[^>]*>([\\s\\S]*?)</section>`));
    assert.ok(section);
    assert.doesNotMatch(section[0].slice(0, section[0].indexOf('>')), /hidden/);
    assert.match(section[1], /data-turns hidden>/);
    assert.ok(section[1].includes(`>${label}</h3>`));
    const transcript = section[1].match(/<ol class="observer-transcript">([\s\S]*?)<\/ol>/)[1];
    const lines = [...transcript.matchAll(/<li><strong>([^<]+)<\/strong><p>“([^<]*)”<\/p><\/li>/g)];
    assert.deepEqual(lines.map(([, name, quote]) => [name, quote]), turns.map((turn, i) => [`${turn.speaker} · Turn ${i + 1}`, esc(turn.text)]));
  }
  assert.ok(html.includes(`href="${pathToRehearsal}"`));
  assert.match(html, /data-print>Print observer card<\/button>/);
  assert.equal((html.match(/class="write-in"/g) || []).length, 3);
});

test('the observer links to a released rehearsal only and reopens when any reviewed input changes', () => {
  const root = scratchRepo();
  const pages = loadSite(root).pages;
  const observer = pages.find((page) => page.slug === slug);
  const ledger = JSON.parse(read(root, 'governance/ledger.json'));
  function markReviewed(page) {
    ledger[page.slug] = {
      status: 'reviewed', risk: page.ledger.risk, by: 'Test Reviewer, MD', at: '2026-11-18', contentHash: page.contentHash,
    };
    writeFileSync(join(root, 'governance/ledger.json'), JSON.stringify(ledger));
  }
  const outDir = join(root, 'public');
  function publicBuild() {
    build({ root, outDir, channel: 'public' });
    return existsSync(join(outDir, file)) ? read(outDir, file) : '';
  }
  assert.equal(publicBuild(), '');
  assert.equal(existsSync(join(outDir, 'assets/observer.js')), false);
  markReviewed(observer);
  assert.ok(publicBuild().includes('class="observer-transcript"'));
  assert.ok(!read(outDir, file).includes(pathToRehearsal));
  markReviewed(pages.find((page) => page.slug === studio));
  assert.ok(publicBuild().includes(pathToRehearsal));

  for (const source of observerSources) {
    const path = join(root, source);
    const before = readFileSync(path);
    appendFileSync(path, '\n');
    assert.equal(loadSite(root).pages.find((page) => page.slug === slug).state, 'stale', source);
    assert.equal(publicBuild(), '', source);
    writeFileSync(path, before);
  }
});
