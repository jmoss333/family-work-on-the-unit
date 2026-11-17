// The map: the unit workflow, the meeting and the site's pages on one screen.
//
// Everything a reader sees on it is copied from a file another page already draws on. So
// what has to hold is:
//   - every mark on the board is in the procedure's own words;
//   - the board, the step cards and the parts are faithful copies of their sources;
//   - every page that ships can be reached from the map, and a page that does not is not named;
//   - the page is whole without its script, and the script writes nothing;
//   - changing any file the map prints from reopens its review.
import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, posix } from 'node:path';
import { build } from '../src/build.mjs';
import { board, checkParts, readParts, validateMap } from '../src/lib/map.mjs';
import { RELEASES, SiteError, loadSite } from '../src/lib/model.mjs';
import { coverage } from '../src/lib/workflow.mjs';
import { ROOT, anchors, built, read, scratchRepo, visibleText } from './helpers.mjs';

const SLUG = 'start/how-it-fits';
const MAP = 'content/maps/how-it-fits.map.json';
const WORKFLOW = 'workflows/unit-family-meeting.workflow.json';
const RULES = 'workflows/unit-family-meeting.adapt.json';
const SPINE = 'content/pages/start-one-spine.md';
const SCRIPT = 'src/assets/map.js';
const load = (rel, root = ROOT) => JSON.parse(readFileSync(join(root, rel), 'utf8'));
const save = (root, rel, value) => writeFileSync(join(root, rel), `${JSON.stringify(value, null, 2)}\n`);
const map = load(MAP);
const workflow = load(WORKFLOW);
const spec = load(RULES);
const site = loadSite(ROOT);
const page = site.pages.find((item) => item.slug === SLUG);
const cards = site.pages.filter((item) => item.kind === 'card');
const squash = (text) => text.replace(/\s+/g, ' ').trim();
const html = () => read(built('review').dir, `${SLUG}.html`);
/** Where a link lands, as a path from the site root. A link to another site is left as it is. */
const landsFrom = (folder, href) => (/^https:/.test(href) ? href : posix.normalize(posix.join(folder, href.split('#')[0])));
const lands = (href) => landsFrom(dirname(`${SLUG}.html`), href);

test('A19 · the map file fits the workflow, and its readers refuse what they exist to catch', () => {
  assert.deepEqual(validateMap(map, workflow), []);
  const broken = (edit) => {
    const copy = load(MAP);
    edit(copy);
    return validateMap(copy, workflow).join(' | ');
  };
  assert.match(broken((m) => { m.workflow = 'another'; }), /drawn for workflow "another", not "unit-family-meeting"/);
  assert.match(broken((m) => { delete m.lead; }), /"lead" is required/);
  assert.match(broken((m) => { m.recall.prompt = ' '; }), /"recall\.prompt" is required/);
  assert.match(broken((m) => { m.meeting.step = 'admit'; }), /"meeting\.step" is "admit", which is not a step of the workflow/);
  assert.match(broken((m) => { m.schema = 2; }), /unknown schema/);

  // The table of parts is read from another page's Markdown. A table that has moved or
  // changed shape is refused, never guessed at.
  const heading = map.meeting.parts.heading;
  const table = (rows) => `## ${heading}\n\nSome words.\n\n| Part | Move card |\n|---|---|\n${rows.join('\n')}\n\nAfter.\n`;
  const good = readParts(table(['| Join each person | No card yet |', '| Hear each experience | [2 Hear](page:room/hear-what-each-person-means) · [3 See](page:room/identify-an-interaction-pattern) |']), heading);
  assert.deepEqual(good, { rows: [{ part: 'Join each person', cards: [], note: 'No card yet' }, { part: 'Hear each experience', cards: ['room/hear-what-each-person-means', 'room/identify-an-interaction-pattern'], note: null }], errors: [] });
  assert.deepEqual(readParts('## Something else\n\n| a | b |\n|---|---|\n| c | d |\n', heading).errors, [`no heading "${heading}"`]);
  assert.deepEqual(readParts(`## ${heading}\n\nNo table here.\n\n## Next\n\n| a | b |\n|---|---|\n| c | d |\n`, heading).errors, [`no table under "${heading}"`]);
  assert.match(readParts(table(['| Join | No card yet | extra |']), heading).errors.join(' | '), /row 1 under ".+": two columns are expected/);
  assert.match(readParts(table(['| **Join** | No card yet |']), heading).errors.join(' | '), /row 1 under ".+": the part is plain words/);
  assert.match(readParts(table(['| Join | See [1 Prepare](page:before/prepare-a-meeting) first |']), heading).errors.join(' | '), /either links to move cards or a note, not both/);

  const rows = page.parts;
  assert.deepEqual(checkParts(rows, cards), []);
  assert.match(checkParts([...rows, { part: 'Extra', cards: ['start/how-to-use'], note: null }], cards).join(' | '), /"Extra" points at "start\/how-to-use", which is not a move card/);
  assert.match(checkParts(rows.slice(0, -1), cards).join(' | '), /move card "room\/close-with-follow-through" has no part/);
  assert.match(checkParts([...rows, rows[0]], cards).join(' | '), /move card "before\/prepare-a-meeting" is listed under 2 parts/);
  assert.match(checkParts([{ part: 'Empty', cards: [], note: null }], []).join(' | '), /"Empty" has neither a move card nor a note/);

  // The build as a whole refuses a table the map can no longer read, and a source list that leaves the table's page out.
  const refuses = (change, pattern) => {
    const dir = scratchRepo();
    change(dir);
    assert.throws(() => loadSite(dir), (error) => error instanceof SiteError && pattern.test(error.problems.join(' | ')), String(pattern));
  };
  refuses((dir) => writeFileSync(join(dir, SPINE), readFileSync(join(dir, SPINE), 'utf8').replace(/\n\| Agree what to try \|[^\n]*/, '')), /move card "room\/make-a-plan-both-people-can-own" has no part/);
  refuses((dir) => writeFileSync(join(dir, SPINE), readFileSync(join(dir, SPINE), 'utf8').replace(`## ${heading}`, '## Five parts')), /no heading "The five parts of a meeting"/);
  refuses((dir) => { const manifest = load('content/manifest.json', dir); const entry = manifest.pages.find((item) => item.slug === SLUG); entry.sources = entry.sources.filter((file) => file !== SPINE); save(dir, 'content/manifest.json', manifest); }, /a map page's third source is the page whose table it reads/);
});

test('A19 · every mark on the board is in the procedure’s own words: a role is marked at a step exactly when that step names it', () => {
  // The names a role goes by are the adaptation rules' forms of its title, and those rules
  // are themselves checked against the owner labels (A18). "team" is the one role that is
  // not a title.
  const names = (role) => (role === 'team' ? ['team'] : [...new Set(Object.values(spec.titles[role]).map((form) => form.toLowerCase()))]).sort((a, b) => b.length - a.length);
  const longestFirst = Object.keys(workflow.roles).sort((a, b) => names(b)[0].length - names(a)[0].length);
  for (const step of workflow.steps) {
    // A name is taken out of the text once it is found, so "psychiatrist" is not also found
    // inside "psychiatrist / app / resident".
    let words = `${step.ownerLabel}. ${step.action}`.toLowerCase();
    const named = [];
    for (const role of longestFirst) {
      for (const name of names(role)) {
        if (words.includes(name)) {
          if (!named.includes(role)) named.push(role);
          words = words.split(name).join(' ');
        }
      }
    }
    const marked = [...new Set([...step.owner, ...(step.support || [])])];
    assert.deepEqual(named.sort(), marked.sort(), `step “${step.title}”: the roles its words name are not the roles marked on the board`);
    assert.equal((step.support || []).filter((role) => step.owner.includes(role)).length, 0, `step “${step.title}”: a role is marked twice`);
  }

  // What that comes to. If the procedure's words change, this picture changes with them.
  const picture = Object.fromEntries(board(workflow).map((role) => [role.label, role.cells.map((cell) => (cell === 'owns' ? '●' : cell === 'involved' ? '○' : '·')).join('')]));
  assert.deepEqual(picture, {
    'Psychiatrist / APP / resident': '●·······',
    Psychiatrist: '··○○○●●●',
    'Social work': '·●○··○·●',
    Nursing: '··○··○··',
    'Mental health technicians': '····●···',
    'Unit secretary': '··●·····',
    'Treatment team': '···●····',
  });
});

test('A19 · the board as built says what the workflow file says: when, who, what is written, what is measured, where there is more', () => {
  const table = html().match(/<table class="map-board">([\s\S]*?)<\/table>/)[1];
  const ids = workflow.steps.map((step) => step.id);
  assert.deepEqual([...table.matchAll(/<th scope="col" data-step="([a-z-]+)">/g)].map((m) => m[1]), ids);
  const titles = [...table.matchAll(/<span class="map-step__title"><span class="sr-only">Step (\d+): <\/span>([^<]*)<\/span>/g)].map((m) => [Number(m[1]), m[2]]);
  assert.deepEqual(titles, workflow.steps.map((step, index) => [index + 1, step.title]));

  const rows = [...table.matchAll(/<tr class="map-row map-row--([a-z]+)"><th scope="row">([^<]*)<\/th>([\s\S]*?)<\/tr>/g)].map(([, kind, label, cells]) => ({
    kind,
    label,
    cells: [...cells.matchAll(/<td data-step="([a-z-]+)">([\s\S]*?)<\/td>/g)].map(([, step, inner]) => ({ step, says: squash(visibleText(inner)), covered: inner === '' || inner.startsWith('<span class="map-answer">') })),
  }));
  for (const row of rows) {
    assert.deepEqual(row.cells.map((cell) => cell.step), ids, `${row.label}: one cell for each step, in order`);
    assert.ok(row.cells.every((cell) => cell.covered), `${row.label}: an answer that self-testing could not cover`);
  }
  const says = (label) => rows.find((row) => row.label === label).cells.map((cell) => cell.says);
  assert.deepEqual(rows.map((row) => row.label), ['When', ...Object.values(workflow.roles), 'Written in', 'Measured', 'See also']);
  assert.deepEqual(says('When'), workflow.steps.map((step) => step.trigger));
  for (const role of board(workflow)) {
    assert.deepEqual(says(role.label), role.cells.map((cell) => (cell === 'owns' ? 'owns this step' : cell === 'involved' ? 'also involved' : '')), role.label);
  }
  assert.deepEqual(says('Written in'), workflow.steps.map((step) => (step.record === null ? '— nothing is written' : 'written down')));
  const { watched, unwatched } = coverage(workflow);
  assert.deepEqual(says('Measured'), workflow.steps.map((step) => (watched.includes(step.id) ? 'a proposed measure checks it' : '')));
  assert.equal(unwatched.length, 4, 'the board shows four steps no measure watches');
  assert.deepEqual(says('See also'), workflow.steps.map((step) => ((step.links || []).length ? 'there is more to read or practice' : '')));
  // Every mark the board uses is explained under it.
  const legend = html().match(/<ul class="map-legend">([\s\S]*?)<\/ul>/)[1];
  for (const kind of new Set([...table.matchAll(/map-mark--([a-z]+)/g)].map((m) => m[1]))) assert.ok(legend.includes(`map-mark--${kind}`), `the mark "${kind}" is not in the legend`);
});

test('A19 · each step opens to the same words as the workflow page, plus the measure that checks it', () => {
  const mine = html();
  const theirs = read(built('review').dir, 'system/unit-workflow.html');
  const measureOf = new Map(workflow.measures.list.map((measure) => [measure.checksStep, measure.name]));
  workflow.steps.forEach((step, index) => {
    const card = mine.match(new RegExp(`<li class="wf-step rc-card map-detail" id="map-step-${step.id}" data-map-detail="${step.id}">([\\s\\S]*?)</li>`));
    const original = theirs.match(new RegExp(`<li class="wf-step rc-card" id="step-${step.id}">([\\s\\S]*?)</li>`));
    assert.ok(card && original, `step ${index + 1}: its card is missing`);
    const measured = ` Measured by ${measureOf.get(step.id) || 'No proposed measure'}`;
    const text = squash(visibleText(card[1]));
    assert.ok(text.includes(measured), `step ${index + 1}: ${measured}`);
    assert.equal(text.replace(measured, ''), squash(visibleText(original[1])), `step ${index + 1}: the map's card and the workflow page's card differ`);
    assert.deepEqual(anchors(card[1]).map((a) => lands(a.href)), anchors(original[1]).map((a) => landsFrom('system', a.href)), `step ${index + 1}: its links`);
  });
  // The button for a step points at its card.
  for (const step of workflow.steps) assert.ok(mine.includes(`data-map-step="${step.id}" aria-controls="map-step-${step.id}"`), step.id);
});

test('A19 · the meeting is printed as its sources have it: the formats, the two rules, and the parts with their move cards', () => {
  const text = squash(visibleText(html()));
  for (const format of workflow.formats.menu) for (const line of [format.name, format.focus, format.when]) assert.ok(text.includes(line), line);
  assert.ok(text.includes(`Decision rule: ${workflow.formats.decisionRule}`));
  assert.ok(text.includes(`No joint meeting today when: ${workflow.formats.noJointMeeting}`));
  assert.ok(text.includes(workflow.additions.find((note) => note.id === workflow.formats.note).text), 'the caveat on the sleep figure travels with the figure');
  const number = workflow.steps.findIndex((step) => step.id === map.meeting.step) + 1;
  assert.equal(number, 6);
  assert.ok(text.includes(map.meeting.intro.replace('{n}', '6')) && !text.includes('{n}'));

  // The parts, in the order of the table on the page that states them, each with its cards.
  const expected = readParts(readFileSync(join(ROOT, SPINE), 'utf8'), map.meeting.parts.heading);
  assert.deepEqual(expected.errors, []);
  assert.deepEqual(page.parts, expected.rows);
  const strip = html().match(/<ol class="map-parts">([\s\S]*?)<\/ol>/)[1];
  const parts = strip.split('<li class="map-part rc-card">').slice(1);
  assert.deepEqual(parts.map((chunk) => chunk.match(/^<h4>([^<]*)<\/h4>/)[1]), expected.rows.map((row) => row.part));
  const bySlug = new Map(cards.map((card) => [card.slug, card]));
  parts.forEach((chunk, index) => {
    const row = expected.rows[index];
    const links = anchors(chunk).map((a) => lands(a.href));
    const practice = row.cards.map((slug) => bySlug.get(slug).practice).filter(Boolean);
    assert.deepEqual(links, row.cards.flatMap((slug) => [`${slug}.html`, ...(bySlug.get(slug).practice ? [`${bySlug.get(slug).practice}.html`] : [])]), row.part);
    const chunkText = squash(visibleText(chunk));
    for (const slug of row.cards) assert.ok(chunkText.includes(`Move ${bySlug.get(slug).order} ${bySlug.get(slug).title}`), `${row.part}: ${slug}`);
    if (!row.cards.length) assert.ok(chunkText.endsWith(row.note), `${row.part}: its note`);
    assert.equal(practice.length, (chunk.match(/class="map-part__practice"/g) || []).length);
  });
  // Six cards, each placed once.
  assert.deepEqual(expected.rows.flatMap((row) => row.cards).sort(), cards.map((card) => card.slug).sort());
});

test('A19 · every page that ships is one press from the map, and a page that does not ship is not offered', () => {
  const { dir } = built('review');
  const reach = new Set(anchors(html().match(/<article[\s\S]*<\/article>/)[0]).filter((a) => !/^https:/.test(a.href)).map((a) => lands(a.href)));
  for (const other of site.pages) {
    if (other.slug === SLUG) continue;
    assert.ok(reach.has(`${other.slug}.html`), `“${other.title}” cannot be reached from the map`);
  }
  for (const file of reach) assert.ok(existsSync(join(dir, file)), `the map links to ${file}, which is not there`);
  // A page is listed at the foot only if nothing above already leads to it.
  const foot = html().match(/<div class="map-rest">([\s\S]*?)<\/section>/)[1];
  const above = html().slice(0, html().indexOf('<div class="map-rest">'));
  for (const a of anchors(foot)) assert.ok(!anchors(above.match(/<article[\s\S]*/)[0]).some((other) => lands(other.href) === lands(a.href)), `${a.href} is on the map twice`);

  // Only the map attested: it ships alone, offers no link to a page that is not there, and
  // does not print the title of a card or of a leftover page.
  const scratch = scratchRepo();
  const signedPage = loadSite(scratch).pages.find((item) => item.slug === SLUG);
  const ledger = load('governance/ledger.json', scratch);
  ledger[SLUG] = {
    status: 'reviewed', risk: ledger[SLUG].risk, at: '2026-11-17', by: 'Test Reviewer, MD', contentHash: signedPage.contentHash,
    release: { gate: 'unit-practice', by: 'Test Reviewer, MD', at: '2026-11-17', confirmed: Object.keys(RELEASES['unit-practice'].confirm) },
  };
  save(scratch, 'governance/ledger.json', ledger);
  const out = mkdtempSync(join(tmpdir(), 'fwu-out-'));
  const report = build({ root: scratch, outDir: out, channel: 'public' });
  assert.deepEqual(report.pages.filter((item) => item.shipped).map((item) => item.slug), [SLUG]);
  const alone = read(out, `${SLUG}.html`);
  for (const a of anchors(alone)) if (!/^https:/.test(a.href)) assert.ok(existsSync(join(out, lands(a.href))), `in the public build the map links to ${a.href}, which is not there`);
  assert.ok(!alone.includes('class="map-rest"') && !alone.includes('class="map-more"'));
  const strip = alone.match(/<ol class="map-parts">([\s\S]*?)<\/ol>/)[1];
  assert.equal(anchors(strip).length, 0);
  assert.equal((strip.match(/\(in review\)/g) || []).length, cards.length);
  for (const card of cards) assert.ok(!strip.includes(card.title), `the public map names the unreviewed card “${card.title}”`);
  assert.ok(existsSync(join(out, 'assets/map.js')) && !existsSync(join(out, 'assets/adapt.js')));
  assert.match(read(out, 'index.html'), /How it fits together/);
});

test('A19 · the page is whole without its script, and the script writes nothing', () => {
  const page = html();
  // As built: every step's card is open, nothing is covered, and the controls that need the script are off or out of sight.
  assert.equal((page.match(/data-map-detail="/g) || []).length, workflow.steps.length);
  assert.ok(!/<li class="wf-step rc-card map-detail"[^>]*\shidden/.test(page), 'a step card is hidden in the page as built');
  const buttons = [...page.matchAll(/<button type="button" class="map-step"[^>]*>/g)].map((m) => m[0]);
  assert.equal(buttons.length, workflow.steps.length);
  for (const tag of buttons) assert.ok(/ disabled>$/.test(tag) && !/aria-expanded/.test(tag), 'a step is a live control before the script runs');
  assert.match(page, /<div class="map-tools" data-map-tools hidden>/);
  assert.match(page, /<p class="map-prompt" data-map-prompt hidden>/);
  assert.ok(!/data-recall=|data-revealed|data-open/.test(page));
  assert.ok(!/<(?:form|textarea|input|select)\b/i.test(page));
  assert.deepEqual([...page.matchAll(/<script src="([^"]+)" defer><\/script>/g)].map((m) => m[1]), ['../assets/site.js', '../assets/map.js']);

  // The script shows, hides and marks. It has no way to put a word on the page, which is why
  // the page's review does not have to cover it.
  const code = readFileSync(join(ROOT, SCRIPT), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const writer of ['textContent', 'innerHTML', 'innerText', 'outerHTML', 'insertAdjacent', 'createElement', 'createTextNode', 'appendChild', 'append(', 'prepend(', 'replaceWith', 'cloneNode', 'document.write', '.value', 'setAttribute(\'aria-label\'', 'title']) {
    assert.ok(!code.includes(writer), `map.js uses ${writer}`);
  }
  const attributes = [...code.matchAll(/setAttribute\('([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(attributes)].sort(), ['aria-expanded', 'aria-pressed', 'data-map-ready', 'data-open', 'data-recall', 'data-revealed']);
});

test('A19 · the review of the map covers its own file, the workflow and the page its parts come from; its script is not among them', () => {
  assert.deepEqual([...page.sources].sort(), [MAP, SPINE, WORKFLOW].sort());
  assert.equal(page.release, 'unit-practice', 'it prints a real unit’s procedure, so it needs the release record too');
  assert.equal(page.ledger.risk.kind, 'local-policy');

  const signed = () => {
    const dir = scratchRepo();
    const current = loadSite(dir).pages.find((item) => item.slug === SLUG);
    const ledger = load('governance/ledger.json', dir);
    ledger[SLUG] = {
      status: 'reviewed', risk: ledger[SLUG].risk, at: '2026-11-17', by: 'Test Reviewer, MD', contentHash: current.contentHash,
      release: { gate: 'unit-practice', by: 'Test Reviewer, MD', at: '2026-11-17', confirmed: Object.keys(RELEASES['unit-practice'].confirm) },
    };
    save(dir, 'governance/ledger.json', ledger);
    return dir;
  };
  const stateAfter = (change) => {
    const dir = signed();
    change(dir);
    return loadSite(dir).pages.find((item) => item.slug === SLUG).state;
  };
  assert.equal(stateAfter(() => {}), 'attested');
  assert.equal(stateAfter((dir) => { const file = load(MAP, dir); file.lead += ' One more sentence.'; save(dir, MAP, file); }), 'stale', 'its own sentences');
  assert.equal(stateAfter((dir) => { const flow = load(WORKFLOW, dir); flow.steps[0].doneWhen += ' Then tell the team.'; save(dir, WORKFLOW, flow); }), 'stale', 'the workflow');
  assert.equal(stateAfter((dir) => appendFileSync(join(dir, SPINE), '\nOne more sentence, added after the review.\n')), 'stale', 'the page its parts come from');
  assert.equal(stateAfter((dir) => appendFileSync(join(dir, SCRIPT), '\n// changed after the review\n')), 'attested', 'the script writes no text, so changing it does not reopen the page');
});
