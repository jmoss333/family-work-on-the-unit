// WCAG 2.2 AA contrast, computed from the tokens for every text/background pairing the
// site actually uses, in the light palette and in the dark one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './helpers.mjs';

const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const tokens = strip(readFileSync(join(ROOT, 'src/assets/tokens.css'), 'utf8'));
const site = strip(readFileSync(join(ROOT, 'src/assets/site.css'), 'utf8'));
const darkStart = tokens.indexOf('@media (prefers-color-scheme: dark)');
const darkEnd = tokens.indexOf('*, *::before', darkStart);
const read = (block) => Object.fromEntries([...block.matchAll(/(--rc-[a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim().replace(/\s+/g, ' ')]));
const palette = { light: read(tokens.slice(0, darkStart)), dark: { ...read(tokens.slice(0, darkStart)), ...read(tokens.slice(darkStart, darkEnd)) } };

function colour(name, mode) {
  let value = palette[mode][`--rc-${name}`];
  for (let hop = 0; /^var\(/.test(value) && hop < 8; hop += 1) value = palette[mode][value.match(/var\((--[a-z0-9-]+)/)[1]];
  assert.ok(value, `no token --rc-${name}`);
  if (value.startsWith('#')) return [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16)).concat(1);
  const parts = value.match(/rgba?\(([^)]+)\)/)[1].split(',').map(Number);
  return [parts[0], parts[1], parts[2], parts[3] ?? 1];
}
const over = (top, base) => [0, 1, 2].map((i) => top[i] * top[3] + base[i] * (1 - top[3])).concat(1);
const luminance = (c) => {
  const f = (x) => (x / 255 <= 0.03928 ? x / 255 / 12.92 : ((x / 255 + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
};
function ratio(text, ground, mode) {
  // "a>b" means tint a painted over ground b.
  const layers = ground.split('>').reverse();
  let base = colour(layers[0], mode);
  for (const layer of layers.slice(1)) base = over(colour(layer, mode), base);
  const [hi, lo] = [luminance(over(colour(text, mode), base)), luminance(base)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

// [text token, ground, where it is used]
const BOTH = [
  ['text', 'bg', 'body text'], ['text', 'surface', 'cards'], ['text', 'bg-alt', 'footer'], ['text', 'surface-raised', 'header'],
  ['text-mid', 'bg', 'secondary text'], ['text-mid', 'surface', 'card summaries'], ['text-mid', 'bg-alt', 'footer'], ['text-mid', 'surface-raised', 'navigation'], ['text-mid', 'surface-alt', 'neutral badge'],
  ['link', 'bg', 'links'], ['link', 'surface', 'links on cards'],
  ['accent-dark', 'bg', 'accent text'], ['accent-dark', 'surface', 'secondary button'], ['accent-dark', 'accent-light>surface', 'evidence chip, calm button'], ['accent-dark', 'accent-light>bg', 'evidence chip in text'],
  ['primary-dark', 'surface', 'move numbers'],
  ['text', 'accent-light>surface', 'speech bubble'], ['text', 'primary-light>surface', 'learner speech bubble'], ['text', 'surface-quiet', 'inline code'],
];
const LIGHT_ONLY = [
  ['success-strong', 'success-light>surface', 'attested badge and banner'], ['success-strong', 'success-light>bg', 'attested banner'],
  ['warning-strong', 'warning-light>surface', 'in-review badge'], ['warning-strong', 'warning-light>bg', 'in-review banner, review ribbon'],
  ['info-strong', 'info-light>surface', 'upstream badge'], ['info-strong', 'info-light>bg', 'upstream banner'],
];
// The dark overrides in site.css: the system's "-strong" texts fail on dark tints.
const DARK_ONLY = [
  ['success-soft', 'success-light>surface', 'attested badge'], ['success-soft', 'success-light>bg', 'attested banner'],
  ['warning-soft', 'warning-light>surface', 'in-review badge'], ['warning-soft', 'warning-light>bg', 'in-review banner, review ribbon'],
  ['text', 'info-light>surface', 'upstream badge'], ['text', 'info-light>bg', 'upstream banner'],
];

for (const [mode, pairs] of [['light', [...BOTH, ...LIGHT_ONLY]], ['dark', [...BOTH, ...DARK_ONLY]]]) {
  test(`A11 · ${mode} palette: every text pairing in use is at least 4.5:1`, () => {
    for (const [text, ground, where] of pairs) {
      const value = ratio(text, ground, mode);
      assert.ok(value >= 4.5, `${mode}: ${text} on ${ground} (${where}) is ${value.toFixed(2)}:1`);
    }
  });
  test(`A11 · ${mode} palette: the focus ring is at least 3:1 against the page and against cards`, () => {
    for (const ground of ['bg', 'surface']) assert.ok(ratio('focus-ring', ground, mode) >= 3, `${mode}: focus ring on ${ground}`);
  });
}

test('A11 · the design system’s low-contrast pairings are measured, and the site does not use them', () => {
  // Recorded so the numbers in site.css stay true. If the design system fixes one of these,
  // this test says so and the workaround can go.
  assert.ok(ratio('text-inverse', 'primary', 'light') < 4.5, 'white on primary now passes; primary buttons can be used');
  assert.ok(ratio('text-light', 'bg', 'light') < 4.5, 'text-light now passes on the page ground');
  assert.ok(ratio('accent', 'bg', 'light') < 4.5, 'accent now passes as text');
  assert.ok(ratio('success-strong', 'success-light>surface', 'dark') < 4.5, 'dark success badge now passes; drop the override');
  assert.ok(ratio('danger-strong', 'danger-light>surface', 'dark') < 4.5, 'dark danger alert now passes');

  assert.ok(!/color:\s*var\(--rc-text-light\)/.test(site), 'site.css sets text in --rc-text-light');
  assert.ok(!/[^-]color:\s*var\(--rc-accent\)/.test(site), 'site.css sets text in --rc-accent');
  const sources = readdirSync(join(ROOT, 'src/lib')).map((name) => readFileSync(join(ROOT, 'src/lib', name), 'utf8')).join('\n');
  for (const cls of ['rc-btn--primary', 'rc-btn--danger', 'rc-alert--danger', 'rc-badge--danger']) {
    assert.ok(!sources.includes(cls), `a template uses ${cls}, which does not meet AA in this palette`);
  }
  assert.match(site, /\.rc-badge--success, \.rc-alert--success \{ color: var\(--rc-success-soft\); \}/);
  assert.match(site, /\.rc-badge--warning, \.rc-alert--warning \{ color: var\(--rc-warning-soft\); \}/);
  assert.match(site, /\.rc-badge--info, \.rc-alert--info \{ color: var\(--rc-text\); \}/);
});
