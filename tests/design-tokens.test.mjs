// The site is built with the owner's design system. These tests keep it that way: the
// palette is pinned to the values read from the system on 2026-11-15, and the site's own
// stylesheet may not introduce a colour.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './helpers.mjs';

const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const tokens = strip(readFileSync(join(ROOT, 'src/assets/tokens.css'), 'utf8'));
const site = strip(readFileSync(join(ROOT, 'src/assets/site.css'), 'utf8'));
const light = tokens.slice(tokens.indexOf(':root {'), tokens.indexOf('@media (prefers-color-scheme: dark)'));

// ReConnect Design Tokens v2.3, light palette.
const PINNED = {
  '--rc-primary': '#b0674e', '--rc-primary-dark': '#96523b', '--rc-primary-light': '#f3ebe5',
  '--rc-accent': '#3a7d6e', '--rc-accent-dark': '#2c6356', '--rc-accent-light': '#edf4f2',
  '--rc-success': '#357160', '--rc-success-strong': '#2d5e50', '--rc-success-light': '#ecf4f1',
  '--rc-warning': '#8b7040', '--rc-warning-strong': '#725b35', '--rc-warning-light': '#f7f0e2',
  '--rc-danger': '#a34132', '--rc-danger-strong': '#8f372a', '--rc-danger-light': '#fbefec',
  '--rc-info': '#4d6f95', '--rc-info-strong': '#3e5d80', '--rc-info-light': '#eef3f7',
  '--rc-bg': '#f6f3ee', '--rc-bg-alt': '#fbf8f3', '--rc-surface': '#ffffff', '--rc-surface-raised': '#fffdf9',
  '--rc-border': '#ddd3c6', '--rc-border-light': '#ebe5da', '--rc-border-strong': '#c8baa7',
  '--rc-text': '#3b332c', '--rc-text-mid': '#64574b', '--rc-text-light': '#87786a',
  '--rc-focus-ring': '#4d6f95',
  '--rc-bg-dark': '#1a1816', '--rc-surface-dark': '#2a2520', '--rc-text-dark': '#e8e2da', '--rc-text-mid-dark': '#b3a596',
  '--rc-primary-dark-mode': '#d4896e', '--rc-accent-dark-mode': '#5aad9a',
  '--rc-radius': '12px', '--rc-radius-sm': '8px', '--rc-space-md': '16px', '--rc-space-lg': '24px',
};

test('A12 · the palette matches the design system, value for value', () => {
  for (const [name, value] of Object.entries(PINNED)) {
    const found = light.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim();
    assert.equal(found, value, `${name} is ${found}; the design system says ${value}`);
  }
});

test('A12 · type comes from the design system: the body stack and the Georgia display face, with nothing downloaded', () => {
  assert.match(light, /--rc-font:\s*'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif;/);
  assert.match(light, /--rc-font-display:\s*Georgia, "Times New Roman", serif;/);
  assert.ok(!/@import|@font-face|url\(/.test(tokens));
});

test('A12 · the site stylesheet introduces no colour of its own', () => {
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(site), 'site.css contains a raw hex colour');
  assert.ok(!/\b(?:rgb|rgba|hsl|hsla)\(/.test(site), 'site.css contains a raw colour function');
  for (const [, name] of site.matchAll(/var\((--[a-z0-9-]+)/g)) {
    assert.ok(tokens.includes(`${name}:`), `site.css uses ${name}, which the design system does not define`);
  }
});

test('A12 · sizes in the site stylesheet come from the spacing and type scales', () => {
  // Raw pixel values are allowed only for hairlines and the few fixed layout tracks.
  const raw = [...site.matchAll(/:\s*[^;{}]*?\b(\d+)px/g)].map((m) => Number(m[1]));
  for (const px of raw) assert.ok([1, 2, 3, 4, 6, 220, 260, 280, 760].includes(px), `unexpected raw ${px}px in site.css`);
});
