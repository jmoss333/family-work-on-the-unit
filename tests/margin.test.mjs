// The margin (design pass, 2026-11-18). site.css restyles pages without changing what they
// say. These tests hold the promises the stylesheet's own comment makes: no stylesheet puts a
// word on a page, the pass leaves every print layout alone, the empty turn appears exactly
// where the case asks the resident to speak, and the board's lines agree with its sentence on
// handoffs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { adaptCore, payload } from '../src/lib/adapt.mjs';
import { ROOT, built, read } from './helpers.mjs';

const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const load = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
const siteRaw = readFileSync(join(ROOT, 'src/assets/site.css'), 'utf8');
const site = strip(siteRaw);
const tokens = strip(readFileSync(join(ROOT, 'src/assets/tokens.css'), 'utf8'));
const MARK = 'The margin (design pass, 2026-11-18)';

test('A24 · no stylesheet puts a word on a page', () => {
  // Generated content may draw a rule or a separator. It may not carry letters or digits,
  // because CSS is not a source any review covers. attr() prints the page's own markup.
  const keywords = /\b(?:none|normal|open-quote|close-quote|no-open-quote|no-close-quote)\b/g;
  for (const [name, css] of [['site.css', site], ['tokens.css', tokens]]) {
    for (const [, value] of css.matchAll(/(?<![-\w])content\s*:\s*([^;}]+)/g)) {
      const literal = value.replace(/attr\([^)]*\)/g, '').replace(keywords, '');
      assert.ok(!/[\p{L}\p{N}]/u.test(literal), `${name}: "content: ${value.trim()}" puts words on the page`);
    }
  }
});

test('A24 · the design pass is for screens only and leaves every print layout alone', () => {
  const at = siteRaw.indexOf(MARK);
  assert.ok(at > 0, 'site.css has the design pass section');
  const section = strip(siteRaw.slice(siteRaw.lastIndexOf('/*', at)));
  const preludes = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < section.length; i += 1) {
    if (section[i] === '{') {
      if (depth === 0) preludes.push(section.slice(start, i).trim());
      depth += 1;
    } else if (section[i] === '}') {
      depth -= 1;
      if (depth === 0) start = i + 1;
    }
  }
  assert.equal(depth, 0, 'the section is balanced');
  assert.ok(preludes.length > 0);
  for (const prelude of preludes) assert.match(prelude, /^@media screen\b/, `a rule outside "@media screen": ${prelude}`);
  assert.ok(!/@media print/.test(section), 'the design pass has a print rule');
});

test('A24 · the empty turn marks exactly the positions whose closing line asks the resident to speak', () => {
  // A position gets the empty turn when it is not a debrief and its closing line is an
  // instruction asking the resident to speak: it says "aloud", "say" or "repair the moment".
  // The script prints a position's lines in order and appends nothing after them, so the
  // instruction is the last paragraph of the scene, which is what the selector styles.
  const caseFile = load('cases/rowan-sal.case.json');
  const asked = Object.entries(caseFile.nodes)
    .filter(([, node]) => !node.debrief)
    .filter(([, node]) => {
      const last = node.lines.at(-1);
      return last?.kind === 'narration' && /\b(?:aloud|say|repair the moment)\b/i.test(last.text);
    })
    .map(([id]) => id)
    .sort();
  const listed = [...site.matchAll(/\[data-position="([^"]+)"\]/g)].map((m) => m[1]);
  const once = [...new Set(listed)].sort();
  assert.deepEqual(once, asked, 'site.css lists the positions the case asks the resident to speak in');
  for (const id of once) assert.equal(listed.filter((x) => x === id).length, 2, `${id} is in both selector lists`);
  assert.ok(asked.length > 0);
});

// ── The board ──────────────────────────────────────────────────────────────────────────
// The stylesheet joins two adjacent cells of a role's row when the role owns both steps.
// A gap between steps i and i+1 with no line in any row is therefore a gap where no one who
// owns step i also owns step i+1, which is the page's own definition of a handoff.

/** For each role row, which cells carry an "owns" mark, in the order they are drawn. */
const ownedCells = (html) =>
  [...html.matchAll(/<tr class="map-row map-row--role">([\s\S]*?)<\/tr>/g)].map((row) =>
    [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map((cell) => cell[1].includes('map-mark--owns')),
  );
/** The gaps (numbered by the step before them) that no row's line crosses. */
function unjoined(html, steps) {
  const joined = new Set();
  for (const cells of ownedCells(html)) {
    for (let i = 0; i + 1 < cells.length; i += 1) if (cells[i] && cells[i + 1]) joined.add(i + 1);
  }
  return Array.from({ length: steps - 1 }, (_, i) => i + 1).filter((gap) => !joined.has(gap));
}

const workflow = load('workflows/unit-family-meeting.workflow.json');
const spec = load('workflows/unit-family-meeting.adapt.json');

test('A24 · on the map, the breaks in the lines are the handoffs of the workflow as written', () => {
  const core = adaptCore();
  const given = payload(workflow, spec);
  const asWritten = [...core.handoffs(core.adapt(given.workflow, given.spec, core.defaults(spec)), given.spec)];
  const html = read(built('review').dir, 'start/how-it-fits.html');
  assert.deepEqual(unjoined(html, workflow.steps.length), asWritten);
});

test('A24 · on the adaptation board, the breaks in the lines agree with the handoff sentence (every 13th version)', () => {
  const core = adaptCore();
  const given = payload(workflow, spec);
  const base = core.defaults(spec);
  const lists = spec.slots.map((slot) => [...slot.options, 'none']);
  const total = lists.reduce((n, list) => n * list.length, 1);
  let printable = 0;
  for (let k = 0; k < total; k += 13) {
    let rest = k;
    const choices = {};
    for (let s = lists.length - 1; s >= 0; s -= 1) {
      choices[spec.slots[s].id] = lists[s][rest % lists[s].length];
      rest = Math.floor(rest / lists[s].length);
    }
    const result = core.adapt(given.workflow, given.spec, { ...base, ...choices });
    const breaks = unjoined(core.board(result, given.spec), result.workflow.steps.length);
    const handoffs = [...core.handoffs(result, given.spec)];
    const label = JSON.stringify(choices);
    if (!result.refused.length) {
      printable += 1;
      assert.deepEqual(breaks, handoffs, `${label}: lines and sentence disagree`);
    } else {
      // A step nobody owns breaks the line on both sides; the sentence does not count those.
      const unowned = result.workflow.steps.map((step, i) => (step.unowned ? i + 1 : 0)).filter(Boolean);
      for (const gap of breaks) {
        assert.ok(handoffs.includes(gap) || unowned.includes(gap) || unowned.includes(gap + 1), `${label}: an unexplained break after step ${gap}`);
      }
    }
  }
  assert.ok(printable > 1000, `only ${printable} printable versions were compared`);
});
