// The Content-Security-Policy in netlify.toml and the HTML the build writes must agree.
// The policy allows the site's own stylesheets and scripts and nothing else.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, anchors, built, htmlFiles, read } from './helpers.mjs';

const toml = readFileSync(join(ROOT, 'netlify.toml'), 'utf8');
const config = JSON.parse(readFileSync(join(ROOT, 'site.config.json'), 'utf8'));
const sameOrigin = (url) => !/^[a-z][a-z0-9+.-]*:/i.test(url) && !url.startsWith('//');

test('A3 · netlify.toml sends a policy that allows only this site’s own files', () => {
  const policy = toml.match(/Content-Security-Policy = "([^"]+)"/)?.[1];
  assert.ok(policy, 'no Content-Security-Policy header');
  const directives = Object.fromEntries(policy.split(';').map((part) => part.trim().split(/\s+/)).map(([name, ...values]) => [name, values.join(' ')]));
  assert.deepEqual(directives, {
    'default-src': "'none'",
    'style-src': "'self'",
    'script-src': "'self'",
    'img-src': "'self'",
    'font-src': "'self'",
    'connect-src': "'none'",
    'form-action': "'none'",
    'base-uri': "'none'",
    'frame-ancestors': "'none'",
  });
  assert.match(toml, /Referrer-Policy = "no-referrer"/);
  assert.match(toml, /X-Content-Type-Options = "nosniff"/);
});

test('A3 · the no-index header and the "indexable" setting say the same thing', () => {
  const header = /X-Robots-Tag = "noindex, nofollow"/.test(toml);
  assert.equal(header, config.indexable !== true, 'site.config.json "indexable" and the X-Robots-Tag header disagree');
});

for (const channel of ['review', 'public']) {
  test(`A4 · ${channel}: no inline script, inline style or event-handler attribute`, () => {
    const { dir } = built(channel);
    for (const file of htmlFiles(dir)) {
      const html = read(dir, file);
      assert.ok(!/<style[\s>]/i.test(html), `${file}: inline <style>`);
      assert.ok(!/\sstyle="/i.test(html), `${file}: style attribute`);
      assert.ok(!/<[^>]+\son[a-z]+\s*=/i.test(html), `${file}: event-handler attribute`);
      assert.ok(!/href="javascript:/i.test(html), `${file}: javascript: link`);
      for (const [tag] of html.matchAll(/<script\b[^>]*>/gi)) {
        const data = /type="application\/json"/.test(tag) && !/\ssrc=/.test(tag);
        const external = /\ssrc="[^"]+"/.test(tag) && /\sdefer\b/.test(tag);
        assert.ok(data || external, `${file}: a script that is neither a data block nor an external file: ${tag}`);
      }
    }
  });

  test(`A3 · ${channel}: nothing is loaded from another host`, () => {
    const { dir } = built(channel);
    for (const file of htmlFiles(dir)) {
      const html = read(dir, file);
      for (const [, url] of html.matchAll(/<(?:script|img|source|video|audio|iframe|embed)\b[^>]*?\ssrc="([^"]*)"/gi)) assert.ok(sameOrigin(url), `${file}: loads ${url}`);
      for (const [, url] of html.matchAll(/<link\b[^>]*?\shref="([^"]*)"/gi)) assert.ok(sameOrigin(url), `${file}: links ${url}`);
      assert.ok(!/<(?:iframe|object|embed|form|base)\b/i.test(html), `${file}: a frame, plugin, form or base element`);
      assert.ok(!/http-equiv/i.test(html), `${file}: http-equiv meta`);
    }
  });

  test(`A3 · ${channel}: links that leave the site are https, carry rel="noopener noreferrer" and open in the same tab`, () => {
    const { dir } = built(channel);
    for (const file of htmlFiles(dir)) {
      for (const { href, tag } of anchors(read(dir, file))) {
        if (sameOrigin(href)) continue;
        assert.match(href, /^https:\/\//, `${file}: non-https link ${href}`);
        assert.match(tag, /rel="noopener noreferrer"/, `${file}: ${href} has no rel`);
        assert.ok(!/\starget=/.test(tag), `${file}: ${href} opens a new tab`);
      }
    }
  });
}
