// Fresh scenes (2026-11-18): short fictional moments, one for each move, each with one empty
// turn and one possible line behind a disclosure. They are the "fresh fictional scene" the
// design brief's transfer check asks for.
//
// What has to hold:
//   - the deck is sound, and the build refuses the defects the validator exists to catch,
//     among them a model line that breaks a rule of the voice;
//   - the page prints the deck and one label of its own, with every comparison closed;
//   - it needs no script of its own, and nothing can be typed or stored;
//   - its review covers the deck and its renderer, and the voice rules can stop the build
//     without being a source of the page.
import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from '../src/build.mjs';
import { SiteError, loadSite } from '../src/lib/model.mjs';
import { pageText } from '../src/lib/packet.mjs';
import { COMPARE_LABEL, PRINT_LABEL, SCENES_LIB, replyTurns, sceneTexts, validateScenes } from '../src/lib/scenes.mjs';
import { loadRules } from '../src/lib/voice.mjs';
import { ROOT, built, read, scratchRepo } from './helpers.mjs';

const SLUG = 'studio/fresh-scenes';
const DECK = 'cases/fresh-scenes.scenes.json';
const json = (dir, rel) => JSON.parse(readFileSync(join(dir, rel), 'utf8'));
const save = (dir, rel, value) => writeFileSync(join(dir, rel), `${JSON.stringify(value, null, 2)}\n`);
const clone = (value) => JSON.parse(JSON.stringify(value));
const deck = json(ROOT, DECK);
const rehearsal = json(ROOT, 'cases/rowan-sal.case.json');
const rules = loadRules(ROOT);
const site = loadSite(ROOT);
const against = { rules, cards: site.cards, taken: rehearsal.people.map((person) => person.name) };
const html = () => read(built('review').dir, `${SLUG}.html`);

test('A27 · the deck is sound, and holds one scene for each move, as its first sentence says', () => {
  assert.deepEqual(validateScenes(deck, against), []);
  assert.deepEqual(deck.scenes.map((scene) => scene.move), site.cards.map((card) => card.slug), 'one scene for each move card, in the cards’ order');
  assert.match(deck.intro, /^A new scene for each move\./);
  for (const scene of deck.scenes) assert.match(scene.origin, /^voice-kit-\d{4}-\d{2}-\d{2}$/, `${scene.id}: every scene written for this build is marked`);
});

test('A27 · every person in a scene is new: no name is used twice, and none is a person in the rehearsal', () => {
  const names = deck.scenes.flatMap((scene) => scene.people.map((person) => person.name));
  assert.equal(new Set(names).size, names.length);
  for (const name of names) assert.ok(!against.taken.includes(name) && name !== deck.learnerRole);
  // Each scene has the person receiving care first, as the rehearsal does.
  for (const scene of deck.scenes) assert.equal(scene.people[0].role, rehearsal.people[0].role);
});

test('A27 · the instruction and the pause are sentences the site already carries', () => {
  // The scene asks for the next line in the rehearsal's own words, and pauses in a move card's.
  assert.ok(rehearsal.nodes.exchange.lines.some((line) => line.kind === 'narration' && line.text === deck.ask));
  assert.ok(readFileSync(join(ROOT, 'content/cards/04-shift-one-exchange.md'), 'utf8').includes(deck.pause));
  assert.equal(deck.learnerRole, rehearsal.learnerRole);
});

test('A27 · the validator refuses the defects it exists to catch', () => {
  const after = (change) => {
    const copy = clone(deck);
    change(copy, copy.scenes.find((scene) => scene.id === 'told'));
    return validateScenes(copy, against).join(' | ');
  };
  const say = (words) => (d, scene) => { scene.reply[0].text = words; };
  assert.match(after((d) => { d.fictional = false; }), /must declare "fictional": true/);
  assert.match(after((d) => { d.scenes = []; }), /at least one scene/);
  assert.match(after((d) => { delete d.ask; }), /"ask" is missing/);
  assert.match(after((d, scene) => { delete scene.origin; }), /told: missing origin/);
  assert.match(after((d, scene) => { scene.move = 'room/win-the-argument'; }), /told: practises “room\/win-the-argument”, which is not a move card/);
  assert.match(after((d, scene) => { scene.id = 'help'; }), /help: used twice/);
  assert.match(after((d, scene) => { scene.people[1].name = 'Rowan'; scene.lines[1].speaker = 'Rowan'; }), /“Rowan” is a person in another case/);
  assert.match(after((d, scene) => { scene.people[1].name = 'Resident'; }), /a person cannot be called “Resident”/);
  assert.match(after((d, scene) => { scene.lines[1].speaker = 'Sal'; }), /“Sal” speaks but is not in the room/);
  assert.match(after((d, scene) => { scene.lines[1].speaker = 'Resident'; }), /“Resident” speaks but is not in the room/, 'the opening is the family’s');
  assert.match(after((d, scene) => { scene.lines.push(scene.lines[0], scene.lines[0]); }), /opens with one to 3 lines/);
  assert.match(after((d, scene) => { scene.lines = [{ kind: 'narration', text: Array.from({ length: rules.limits.sceneSetupWords + 1 }, () => 'word').join(' ') }]; }), /the opening runs to 61 words; a scene's is 60 at most/);
  assert.match(after((d, scene) => { scene.score = 1; }), /told: "score" — scenes carry no scoring/);
  // The model line: one turn, or two with the deck's own pause between them, by the learner.
  assert.match(after((d, scene) => { scene.reply[0].speaker = 'Devon'; }), /the model line is one turn by the Resident/);
  assert.match(after((d, scene) => { scene.reply[1].text = 'Wait for an answer.'; }), /the model line is one turn by the Resident/);
  assert.match(after((d, scene) => { scene.reply.pop(); }), /the model line is one turn by the Resident/);
  // A rule of the voice refuses a line, and the build says which and why.
  assert.match(after(say('Devon, why did you answer for Ari?')), /told: the model line breaks “no-why”\. No question asks a person why\./);
  assert.match(after(say('Devon, tell Ari what you heard.')), /breaks “hands-back”/);
  assert.match(after(say('What did you hear just now?')), /breaks “names-someone”/);
  assert.match(after(say('Devon, you always answer first, don’t you?')), /breaks “no-verdict”/);
  assert.match(after(say('Devon, is this the triangulation we talked about?')), /breaks “no-jargon”/);
  // Only the first turn has to say whose turn it is.
  assert.equal(after((d, scene) => { scene.reply[2].text = 'Did that land, or is there something to change?'; }), '');
  // A scene has no exits, so it stays away from what needs them.
  assert.match(after((d, scene) => { scene.lines[1].text = 'They’re already asking about her medication.'; }), /told: A short scene has no exits.*\(medication\)/);
  assert.match(after((d, scene) => { scene.title = 'What the police were told'; }), /\(police\)/);
});

test('A27 · the build refuses a deck the validator refuses, and a scenes page whose review would not cover its renderer', () => {
  let dir = scratchRepo();
  const broken = json(dir, DECK);
  broken.scenes[0].reply[0].text = 'Why would she need to know that?';
  save(dir, DECK, broken);
  assert.throws(() => loadSite(dir), (error) => error instanceof SiteError && /fresh-scenes\.scenes\.json: invite: the model line breaks “no-why”/.test(error.message));

  dir = scratchRepo();
  const manifest = json(dir, 'content/manifest.json');
  manifest.pages.find((page) => page.slug === SLUG).sources = [DECK];
  save(dir, 'content/manifest.json', manifest);
  assert.throws(() => loadSite(dir), (error) => error instanceof SiteError && error.message.includes(`a scenes page's sources are its deck and ${SCENES_LIB}`));
});

test('A27 · the page prints the deck, the move each scene practises and one label of its own', () => {
  const page = site.pages.find((item) => item.slug === SLUG);
  const text = pageText(html());
  const body = text.slice(text.indexOf(deck.intro)).split('\n').filter(Boolean);
  const line = (item) => (item.kind === 'speech' ? `${item.speaker}“${item.text}”` : item.text);
  const expected = [
    deck.intro,
    ...deck.scenes.flatMap((scene) => {
      const card = site.cards.find((item) => item.slug === scene.move);
      return [`#### ${scene.title}`, `Move ${card.order}: ${card.title}`, ...scene.people.map((person) => `${person.name}: ${person.role}`), ...scene.lines.map(line), deck.ask, COMPARE_LABEL, ...scene.reply.map(line)];
    }),
    `[button: ${PRINT_LABEL}]`,
  ];
  assert.deepEqual(body, expected);
  assert.ok(text.includes(`${deck.scenes.length} scenes · about ${page.minutes} minutes · Deck version ${deck.version}`));
  // The print button says what every printable page's button says.
  assert.ok(readFileSync(join(ROOT, 'src/lib/templates.mjs'), 'utf8').includes(`data-print>${PRINT_LABEL}</button>`));
  // Every word of every scene is in the review packet's text of the page, so an outside reader sees it all.
  for (const scene of deck.scenes) for (const words of sceneTexts(scene)) assert.ok(text.includes(words), `${scene.id}: “${words}”`);
});

test('A27 · each comparison is closed as built and holds exactly the model line; the page needs no script of its own and takes no typing', () => {
  const page = html();
  const sections = [...page.matchAll(/<section class="turn" id="scene-([A-Za-z0-9]+)" aria-labelledby="scene-\1-title">([\s\S]*?)<\/section>/g)];
  assert.deepEqual(sections.map(([, id]) => id), deck.scenes.map((scene) => scene.id));
  for (const [, id, inner] of sections) {
    const scene = deck.scenes.find((item) => item.id === id);
    const details = [...inner.matchAll(/<details class="turn__compare">([\s\S]*?)<\/details>/g)];
    assert.equal(details.length, 1, `${id}: one comparison`);
    assert.ok(!/<details[^>]*\sopen/.test(inner), `${id}: the comparison is open as built`);
    const [before] = inner.split('<details');
    for (const turn of replyTurns(scene)) {
      const words = turn.text.replace(/&/g, '&amp;');
      assert.ok(details[0][1].includes(words), `${id}: the model line is not in its comparison`);
      assert.ok(!before.includes(words), `${id}: the model line shows before the comparison is opened`);
    }
    assert.equal((details[0][1].match(/class="speech speech--learner"/g) || []).length, replyTurns(scene).length);
    // The turn is the learner's: nobody speaks for the resident before the comparison.
    assert.ok(!before.includes('speech--learner'));
    assert.match(before, /<p class="narration turn__ask">[^<]+<\/p>\s*$/, `${id}: the scene ends on the instruction, where the empty turn is drawn`);
  }
  assert.deepEqual([...page.matchAll(/<script\b[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]), ['../assets/site.js'], 'the site script only: it prints');
  assert.ok(!/<script type="application\/json"/.test(page), 'no data block: there is no script to read one');
  assert.ok(!/<(?:input|select|textarea|form)\b/i.test(page));
  assert.deepEqual([...page.matchAll(/<button\b[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]), [PRINT_LABEL]);
});

test('A27 · a move that does not ship is named as plain words marked “(in review)”, and the page never names another page', () => {
  // The day this page alone is attested: its six links become plain words with the mark.
  const dir = scratchRepo();
  const page = loadSite(dir).pages.find((item) => item.slug === SLUG);
  const ledger = json(dir, 'governance/ledger.json');
  ledger[SLUG] = { status: 'reviewed', risk: ledger[SLUG].risk, at: '2026-11-18', by: 'Test Reviewer, MD', contentHash: page.contentHash };
  save(dir, 'governance/ledger.json', ledger);
  const target = mkdtempSync(join(tmpdir(), 'fwu-out-'));
  const report = build({ root: dir, outDir: target, channel: 'public' });
  assert.deepEqual(report.pages.filter((item) => item.shipped).map((item) => item.slug), [SLUG]);
  const shipped = read(target, `${SLUG}.html`);
  for (const card of site.cards) {
    assert.ok(shipped.includes(`<p class="turn__move">Move ${card.order}: ${card.title.replace(/&/g, '&amp;')} <span class="note-in-review">(in review)</span></p>`), `Move ${card.order} is not marked`);
    assert.ok(!existsSync(join(target, `${card.slug}.html`)));
  }
  assert.ok(!/<a\s[^>]*href="[^"]*(?:room|before)\//.test(shipped), 'a link to a card that did not ship');
  assert.match(shipped, /<strong>Attested\.<\/strong> Reviewed by Test Reviewer, MD on November 18, 2026\./);
});

test('A27 · the review covers the deck and its renderer; the voice rules are not a source, and can still stop the build', () => {
  const page = site.pages.find((item) => item.slug === SLUG);
  assert.deepEqual(page.sources, [DECK, SCENES_LIB]);
  const sign = (dir) => {
    const current = loadSite(dir).pages.find((item) => item.slug === SLUG);
    const ledger = json(dir, 'governance/ledger.json');
    ledger[SLUG] = { status: 'reviewed', risk: ledger[SLUG].risk, at: '2026-11-18', by: 'Test Reviewer, MD', contentHash: current.contentHash };
    save(dir, 'governance/ledger.json', ledger);
  };
  const state = (dir) => loadSite(dir).pages.find((item) => item.slug === SLUG).state;

  let dir = scratchRepo();
  sign(dir);
  assert.equal(state(dir), 'attested');
  const edited = json(dir, DECK);
  edited.scenes[3].reply[2].text = 'Ari, did Devon get that, or is there something you’d change?';
  save(dir, DECK, edited);
  assert.equal(state(dir), 'stale', 'one word of a model line reopens the page');

  dir = scratchRepo();
  sign(dir);
  appendFileSync(join(dir, SCENES_LIB), '\n// a change to the renderer\n');
  assert.equal(state(dir), 'stale', 'the renderer writes a label, so a change to it reopens the page');

  dir = scratchRepo();
  sign(dir);
  const looser = json(dir, 'voice/rules.json');
  looser.advice.turnWords = 30;
  save(dir, 'voice/rules.json', looser);
  assert.equal(state(dir), 'attested', 'a rule writes no word on the page, so changing one reopens nothing');
  const stricter = json(dir, 'voice/rules.json');
  stricter.limits.turnWords = 10;
  stricter.advice.turnWords = 8;
  save(dir, 'voice/rules.json', stricter);
  assert.throws(() => loadSite(dir), (error) => error instanceof SiteError && /the model line breaks “turn-length”/.test(error.message), 'a rule the deck no longer meets stops the build');
});

test('A27 · on a screen the turn is the rehearsal’s empty turn; on paper it is a ruled line, and a closed comparison is not printed', () => {
  const css = readFileSync(join(ROOT, 'src/assets/site.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const rule = css.indexOf('.turn__ask::before');
  assert.ok(rule > 0);
  assert.equal(css.indexOf('.turn__ask::before', rule + 1), -1, 'the rule is drawn in one place');
  const opened = css.lastIndexOf('@media', rule);
  assert.match(css.slice(opened, rule), /^@media screen \{/, 'the empty turn is drawn on screens only');
  assert.match(css.slice(rule, rule + 260), /content: "";[\s\S]*background: var\(--rc-primary-dark\);/, 'the same terracotta rule as the rehearsal’s, and no word');
  const print = [...css.matchAll(/@media print \{([\s\S]*?)\n\}/g)].map((m) => m[1]).join('\n');
  assert.match(print, /\.turn__ask \{ padding-bottom: [\d.]+rem; border-bottom: 1px solid var\(--rc-border-strong\); \}/);
  assert.match(print, /\.turn__compare > summary \{ display: none; \}/);
  assert.match(print, /\.turn \{ break-inside: avoid; \}/);
});
