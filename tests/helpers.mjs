// Shared by every test file: build each channel once into a temp folder, and a few small
// readers for the HTML the build writes. No dependencies; the HTML is our own and regular.
import { cpSync, mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../src/build.mjs';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const cache = new Map();
/** Build a channel once per test process and return { dir, report }. */
export function built(channel) {
  if (!cache.has(channel)) {
    const dir = mkdtempSync(join(tmpdir(), `fwu-${channel}-`));
    cache.set(channel, { dir, report: build({ root: ROOT, outDir: dir, channel }) });
  }
  return cache.get(channel);
}

/** A throwaway copy of the repository's sources, for tests that need to change something. */
export function scratchRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'fwu-scratch-'));
  for (const name of ['content', 'cases', 'workflows', 'evidence', 'governance', 'site.config.json']) {
    cpSync(join(ROOT, name), join(dir, name), { recursive: true });
  }
  cpSync(join(ROOT, 'src', 'assets'), join(dir, 'src', 'assets'), { recursive: true });
  return dir;
}

export function walk(dir, base = dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) out.push(...walk(abs, base));
    else out.push(posix.join(...abs.slice(base.length + 1).split(/[\\/]/)));
  }
  return out;
}

export const htmlFiles = (dir) => walk(dir).filter((file) => file.endsWith('.html'));
export const read = (dir, file) => readFileSync(join(dir, file), 'utf8');

/** Markup with the JSON data block and comments removed, so text checks see only the page. */
export function markup(html) {
  return html.replace(/<script type="application\/json"[\s\S]*?<\/script>/g, '').replace(/<!--[\s\S]*?-->/g, '');
}

export const attrs = (html, name) => [...html.matchAll(new RegExp(`\\s${name}="([^"]*)"`, 'g'))].map((m) => m[1]);
export const anchors = (html) => [...markup(html).matchAll(/<a\s[^>]*?href="([^"]*)"[^>]*>/g)].map((m) => ({ href: m[1], tag: m[0] }));
export const ids = (html) => attrs(markup(html), 'id');
export const headings = (html) => [...markup(html).matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
export const visibleText = (html) =>
  markup(html)
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ');
