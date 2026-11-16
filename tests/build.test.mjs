// What the build must produce, whatever the content says.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, posix } from 'node:path';
import { build } from '../src/build.mjs';
import { ROOT, anchors, built, headings, htmlFiles, ids, read, walk } from './helpers.mjs';

const manifest = JSON.parse(readFileSync(join(ROOT, 'content/manifest.json'), 'utf8'));

test('A1 · the review build writes one file for every page in the manifest', () => {
  const { dir } = built('review');
  for (const page of manifest.pages) assert.ok(existsSync(join(dir, `${page.slug}.html`)), `${page.slug}.html is missing`);
  for (const file of ['index.html', 'guide.html', 'guide-print.html', 'about/governance.html', '404.html', 'robots.txt', 'build-report.json', 'assets/tokens.css', 'assets/site.css', 'assets/site.js', 'assets/studio.js']) {
    assert.ok(existsSync(join(dir, file)), `${file} is missing`);
  }
});

test('A1 · the build is deterministic: the same sources give byte-identical files', () => {
  const first = built('review').dir;
  const second = mkdtempSync(join(tmpdir(), 'fwu-again-'));
  build({ root: ROOT, outDir: second, channel: 'review' });
  const files = walk(first);
  assert.deepEqual(walk(second), files);
  for (const file of files) assert.ok(readFileSync(join(first, file)).equals(readFileSync(join(second, file))), `${file} differs between two builds`);
});

for (const channel of ['review', 'public']) {
  test(`A2 · ${channel}: every internal link lands on a file, and every #anchor on an id`, () => {
    const { dir } = built(channel);
    const idCache = new Map();
    const idsOf = (file) => {
      if (!idCache.has(file)) idCache.set(file, new Set(ids(read(dir, file))));
      return idCache.get(file);
    };
    let checked = 0;
    for (const file of htmlFiles(dir)) {
      for (const { href } of anchors(read(dir, file))) {
        if (/^https:\/\//.test(href)) continue;
        assert.ok(!/^[a-z]+:/i.test(href), `${file}: unexpected link scheme in "${href}"`);
        const [path, anchor] = href.split('#');
        // The 404 page is served at any address, so its links are absolute.
        const target = path === '' ? file : path.startsWith('/') ? (path === '/' ? 'index.html' : path.slice(1)) : posix.normalize(posix.join(dirname(file), path));
        assert.ok(existsSync(join(dir, target)), `${file}: link "${href}" points at ${target}, which was not built`);
        if (anchor) assert.ok(idsOf(target).has(anchor), `${file}: link "${href}" points at #${anchor}, which ${target} does not have`);
        checked += 1;
      }
    }
    assert.ok(checked > 0);
  });

  test(`A11 · ${channel}: each page has a language, one h1, a main landmark, a skip link, and an outline that never skips a level`, () => {
    const { dir } = built(channel);
    for (const file of htmlFiles(dir)) {
      const html = read(dir, file);
      assert.match(html, /<html lang="en">/, `${file}: no lang`);
      assert.match(html, /<title>[^<]+<\/title>/, `${file}: no title`);
      assert.match(html, /<main id="main"/, `${file}: no main landmark`);
      assert.match(html, /<a class="skip-link" href="#main">/, `${file}: no skip link`);
      const levels = headings(html);
      assert.equal(levels.filter((level) => level === 1).length, 1, `${file}: expected exactly one h1`);
      assert.equal(levels[0], 1, `${file}: the first heading is not the h1`);
      levels.reduce((previous, level) => {
        assert.ok(level <= previous + 1, `${file}: heading jumps from h${previous} to h${level}`);
        return level;
      }, 1);
      const seen = new Set();
      for (const id of ids(html)) {
        assert.ok(!seen.has(id), `${file}: duplicate id "${id}"`);
        seen.add(id);
      }
      assert.ok(!/<img\b/.test(html), `${file}: images need alt text; none are expected yet`);
    }
  });
}

test('A9 · a review build is marked on every page and asks not to be indexed', () => {
  const { dir } = built('review');
  for (const file of htmlFiles(dir)) {
    const html = read(dir, file);
    assert.match(html, /class="review-ribbon"/, `${file}: no review ribbon`);
    assert.match(html, /<meta name="robots" content="noindex, nofollow">/, `${file}: indexable`);
  }
  assert.equal(read(dir, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
});
