// House rules for what the pages say and show, checked on the built review site.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadSite } from '../src/lib/model.mjs';
import { ROOT, built, htmlFiles, ids, read, visibleText } from './helpers.mjs';

const config = JSON.parse(readFileSync(join(ROOT, 'site.config.json'), 'utf8'));
const site = loadSite(ROOT);

test('A13 · every teaching page states its review status under its title, and none claims more than the ledger gives it', () => {
  const { dir } = built('review');
  for (const page of site.pages) {
    const html = read(dir, `${page.slug}.html`);
    const banners = html.match(/class="rc-alert [a-z-]+ status-banner"/g) || [];
    assert.equal(banners.length, 1, `${page.slug}: expected one status banner`);
    const expected = { attested: 'rc-alert--success', 'upstream-attested': 'rc-alert--info', pending: 'rc-alert--warning', stale: 'rc-alert--warning' }[page.state];
    assert.ok(banners[0].includes(expected), `${page.slug}: banner does not match state ${page.state}`);
    if (page.state !== 'attested') assert.ok(!/<strong>Attested\.<\/strong>/.test(html), `${page.slug} claims an attestation it does not have`);
  }
});

test('A13 · no AI system appears as a reviewer anywhere in the ledger', () => {
  for (const [slug, row] of Object.entries(site.ledger)) {
    assert.ok(!/claude|chatgpt|gpt|astra|assistant|agent|\bai\b/i.test(row.by), `${slug}: reviewer "${row.by}"`);
  }
});

test('A13 · no email address, phone number or leftover placeholder appears on the site', () => {
  const { dir } = built('review');
  for (const file of htmlFiles(dir)) {
    const text = visibleText(read(dir, file));
    assert.ok(!/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(text), `${file}: an email address`);
    assert.ok(!/\(?\b\d{3}\)?[-. ]\d{3}[-. ]\d{4}\b/.test(text), `${file}: a phone number`);
    assert.ok(!/\b(?:TODO|TBD|FIXME|lorem ipsum|XXX)\b/i.test(text), `${file}: a placeholder`);
    assert.ok(!/undefined|\[object Object\]|NaN/.test(text), `${file}: a rendering fault`);
  }
});

test('A13 · every page carries the two standing notices: educational only, and fictional people only', () => {
  const { dir } = built('review');
  for (const file of htmlFiles(dir)) {
    const text = visibleText(read(dir, file));
    assert.ok(text.includes('It is not clinical guidance for any particular patient and does not replace local policy or protocol.'), `${file}: educational notice`);
    assert.ok(text.includes('Every person and exchange on this site is fictional. Do not bring patient information here.'), `${file}: fictional notice`);
  }
});

test('A13 · each move card has a line to try and the three standing sections, in order', () => {
  const { dir } = built('review');
  assert.equal(site.cards.length, 6);
  for (const card of site.cards) {
    const html = read(dir, `${card.slug}.html`);
    assert.match(html, /<figure class="say rc-card rc-card--warm"><figcaption>Try saying<\/figcaption><blockquote>/, `${card.slug}: no model line`);
    const order = ['when-to-use-or-pause', 'misstep-and-repair', 'evidence-and-supervision'].map((id) => html.indexOf(`id="${id}"`));
    assert.ok(order.every((at) => at > 0) && order[0] < order[1] && order[1] < order[2], `${card.slug}: sections missing or out of order`);
    assert.ok(ids(html).includes('ev-heading') || !(card.evidence || []).length);
  }
});

test('A13 · the print bundle holds all six cards with unique headings', () => {
  const html = read(built('review').dir, 'guide-print.html');
  for (const card of site.cards) assert.ok(html.includes(`id="bundle-${card.order}"`), `card ${card.order} missing from the bundle`);
  assert.equal((html.match(/<figcaption>Try saying<\/figcaption>/g) || []).length, 6);
});

test('A13 · buttons are real buttons, and every labelled region points at a label that exists', () => {
  const { dir } = built('review');
  for (const file of htmlFiles(dir)) {
    const html = read(dir, file);
    for (const [tag] of html.matchAll(/<button\b[^>]*>/g)) assert.match(tag, /type="button"/, `${file}: ${tag}`);
    const have = new Set(ids(html));
    for (const [, id] of html.matchAll(/aria-labelledby="([^"]+)"/g)) assert.ok(have.has(id), `${file}: aria-labelledby="${id}" has no target`);
    for (const [, body] of html.matchAll(/<a\s[^>]*>([\s\S]*?)<\/a>/g)) assert.ok(body.replace(/<[^>]+>/g, '').trim().length > 0, `${file}: a link with no text`);
    for (const [tag] of html.matchAll(/<table\b[^>]*>/g)) assert.ok(/<th[\s>]/.test(html), `${file}: a table with no header cells (${tag})`);
  }
});

test('A13 · imported pages carry the attribution line their licence asks for', () => {
  const { dir } = built('review');
  for (const page of site.pages.filter((p) => p.origin === 'upstream')) {
    const text = visibleText(read(dir, `${page.slug}.html`));
    assert.ok(text.includes(`“${page.title}” from the Psychiatry Clerkship Library by Joshua Moss, MD`), `${page.slug}: attribution`);
    assert.ok(text.includes('licensed under CC BY-NC-SA 4.0 . Unmodified.') || text.includes('licensed under CC BY-NC-SA 4.0. Unmodified.'), `${page.slug}: licence`);
  }
});

test('A17 · the licence files, the footer and the owner’s switch say the same thing', () => {
  const confirmed = config.licenceConfirmed === true;
  for (const name of ['LICENSE', 'LICENSE-content']) {
    const proposed = /^PROPOSED\./m.test(readFileSync(join(ROOT, name), 'utf8'));
    assert.equal(proposed, !confirmed, `${name} and "licenceConfirmed" disagree`);
  }
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.license, confirmed ? 'MIT' : 'SEE LICENSE IN LICENSE');
  const footer = visibleText(read(built('review').dir, 'index.html'));
  assert.ok(footer.includes(confirmed ? 'Teaching content CC BY-NC-SA 4.0; software MIT.' : 'Licence not yet confirmed; all rights reserved for now.'));
});

test('A13 · the repository does not carry the private intake files', () => {
  const names = [];
  const walk = (dir) => {
    for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
      if (['node_modules', '.git', 'dist'].includes(entry.name)) continue;
      const rel = join(dir, entry.name);
      if (entry.isDirectory()) walk(rel);
      else names.push(rel);
    }
  };
  walk('.');
  for (const name of names) assert.ok(!/\.(docx|pptx|pdf|xlsx)$/i.test(name) && !/Rowan_Sal_Rehearsal\.html$/.test(name), `${name} should not be committed`);
});
