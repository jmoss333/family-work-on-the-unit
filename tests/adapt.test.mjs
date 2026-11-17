// The adaptation page. A reader chooses who does each job on their unit, how often, and
// whether a tool drafts the note, and the workflow is rewritten for them. What has to hold:
//   - with nothing changed, the sheet is the workflow, word for word;
//   - every combination of choices reads as prose, with no leftover placeholder;
//   - a version with a step nobody owns is refused, and says which step;
//   - a reader chooses from fixed lists: nothing can be typed, stored or sent;
//   - the review of the page covers the rules, the workflow and the script that applies them;
//   - the board says who owns each step in the reader's version, and as written it is the map's board;
//   - a card for one role holds that role's steps as the sheet prints them, and nothing of its own.
// The functions under test are the browser's own (src/assets/adapt.js), loaded without a browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from '../src/build.mjs';
import { ADAPT_SCRIPT, adaptCore, payload, revision, validateAdaptation } from '../src/lib/adapt.mjs';
import { board as mapBoard } from '../src/lib/map.mjs';
import { RELEASES, SiteError, loadSite } from '../src/lib/model.mjs';
import { ROOT, built, headings, ids, read, scratchRepo, visibleText } from './helpers.mjs';

const WORKFLOW = 'workflows/unit-family-meeting.workflow.json';
const RULES = 'workflows/unit-family-meeting.adapt.json';
const SLUG = 'system/adapt-it';
const load = (rel, root = ROOT) => JSON.parse(readFileSync(join(root, rel), 'utf8'));
const workflow = load(WORKFLOW);
const spec = load(RULES);
const core = adaptCore();
const given = payload(workflow, spec);
const base = { ...core.defaults(spec) };
const REV = given.spec.rev;
// The script runs in its own context, so what it returns is copied into plain objects before
// it is compared. (The loop over every combination compares piece by piece instead.)
const local = (value) => JSON.parse(JSON.stringify(value));
const adapt = (choices) => local(core.adapt(given.workflow, given.spec, { ...base, ...choices }));
const decode = (text) => {
  const found = core.decode(given.spec, text, workflow.version);
  return found && { ...found };
};
const step = (result, id) => result.workflow.steps.find((item) => item.id === id);
const squash = (text) => text.replace(/\s+/g, ' ').trim();

/** The sentences the rules can change: who, when and what for each step, and the exceptions. */
const prose = (result) => [...result.workflow.steps.flatMap((item) => [item.ownerLabel, item.trigger, item.action]), ...result.workflow.exceptions.flatMap((item) => [item.when, item.then])].join('\n');

/** Every way to fill the jobs: each of a job's options, or nobody. */
function* everyOwnerChoice() {
  const lists = spec.slots.map((slot) => [...slot.options, 'none']);
  const at = lists.map(() => 0);
  for (;;) {
    yield Object.fromEntries(spec.slots.map((slot, index) => [slot.id, lists[index][at[index]]]));
    let index = at.length - 1;
    while (index >= 0 && at[index] === lists[index].length - 1) {
      at[index] = 0;
      index -= 1;
    }
    if (index < 0) return;
    at[index] += 1;
  }
}

test('A18 · the adaptation rules fit the workflow they rewrite', () => {
  assert.deepEqual(validateAdaptation(spec, workflow), []);
  // Six jobs, two intervals and one question. If a choice is added or dropped, this line says so.
  assert.deepEqual(spec.slots.map((slot) => slot.id), ['ask', 'partner', 'scheduler', 'rounds', 'escort', 'lead']);
  assert.deepEqual(spec.timings.map((timing) => timing.id), ['contact', 'update']);
  assert.deepEqual(spec.switches.map((item) => [item.id, item.options.map((option) => option.id), item.default]), [['drafting', ['yes', 'no'], 'yes']]);
  assert.deepEqual(spec.notes, { 'resident-supervision': { slot: 'lead', among: ['psy-app-res', 'resident'] } });
});

test('A18 · the validator refuses the defects it exists to catch', () => {
  const broken = (edit) => {
    const copy = load(RULES);
    edit(copy);
    return validateAdaptation(copy, workflow).join(' | ');
  };
  const rule = (copy, at) => copy.rules.find((item) => item.at === at);
  assert.match(broken((s) => { s.workflowVersion = '1.9'; }), /written for workflow version 1\.9; the workflow is at 2\.0/);
  assert.match(broken((s) => { s.workflow = 'another-workflow'; }), /written for workflow "another-workflow"/);
  assert.match(broken((s) => { rule(s, 'steps.book.ownerLabel').find = 'Ward clerk'; }), /"Ward clerk" occurs 0 times in the field; it must occur once/);
  assert.match(broken((s) => { s.rules.find((item) => item.find === 'every 72 h').find = 'e'; }), /"e" occurs \d+ times in the field; it must occur once/);
  assert.match(broken((s) => { rule(s, 'steps.book.ownerLabel').at = 'steps.nowhere.ownerLabel'; }), /no such text in the workflow/);
  assert.match(broken((s) => { rule(s, 'steps.book.ownerLabel').replace = '{scheduler.bare}'; }), /with nothing changed it would write "unit secretary" over "Unit secretary"/);
  assert.match(broken((s) => { rule(s, 'steps.book.ownerLabel').replace = '{clerk.label}'; }), /\{clerk\.label\} names no slot or interval/);
  assert.match(broken((s) => { rule(s, 'steps.book.ownerLabel').replace = '{scheduler.plural}'; }), /\{scheduler\.plural\} uses an unknown form/);
  assert.match(broken((s) => { rule(s, 'steps.book.ownerLabel').replace = '{scheduler.label} {'; }), /a stray brace/);
  assert.match(broken((s) => { rule(s, 'steps.invite.trigger').replace = '{contact.label}'; }), /is an interval and takes no form/);
  assert.match(broken((s) => { rule(s, 'steps.bridge.ownerLabel').variants[0].same = ['lead', 'partner']; }), /exactly one of "none", "same" or "is"/);
  assert.match(broken((s) => { s.slots[0].options.push('chaplain'); }), /slot "ask": unknown title "chaplain"/);
  assert.match(broken((s) => { s.slots[0].default = 'psychologist'; }), /"ask": its default is not one of its options/);
  assert.match(broken((s) => { s.slots[1].code = s.slots[0].code; }), /its code is one capital letter, used once/);
  assert.match(broken((s) => { s.timings[0].options.push(s.timings[0].options[0]); }), /"contact": an option is listed twice/);
  assert.match(broken((s) => { delete s.owners.book; }), /"owners" must list the workflow's steps, in order/);
  assert.match(broken((s) => { s.owners.rounds = ['lead']; }), /slot "rounds" is the sole owner of no step/);
  assert.match(broken((s) => { s.titles.none = s.titles.nursing; }), /"none" is reserved/);
  assert.match(broken((s) => { delete s.messages.local; }), /messages: "local" is required/);

  // The workflow's own list of who owns each step must agree with the rules.
  const drift = (edit) => {
    const flow = load(WORKFLOW);
    edit(flow);
    return validateAdaptation(load(RULES), flow).join(' | ');
  };
  assert.match(drift((w) => { w.steps.find((item) => item.id === 'note').owner = ['social-work']; }), /step "note": the workflow says it is owned by social-work; these rules, with nothing changed, say psy-app-res/);
  assert.match(drift((w) => { w.steps.find((item) => item.id === 'bridge').owner = ['psychiatrist']; }), /step "bridge": the workflow says it is owned by psychiatrist; these rules, with nothing changed, say psy-app-res and social-work/);
  assert.match(drift((w) => { w.roles = { nursing: w.roles.nursing, ...w.roles }; }), /the workflow lists its roles in a different order from the titles here/);
  // With nothing changed, the replacement that applies is held to the workflow's words, whether
  // it is the rule's own or a variant that fits the workflow as written.
  assert.match(broken((s) => { rule(s, 'steps.bring-up.action').replace = '; tell the meeting lead.'; }), /with nothing changed it would write "; tell the meeting lead\." over "; let the meeting lead know they have arrived\."/);
  assert.match(broken((s) => { rule(s, 'steps.note.ownerLabel').variants = [{ is: { lead: 'psy-app-res' }, replace: 'Whoever leads' }]; }), /with nothing changed it would write "Whoever leads" over "Psychiatrist \/ APP \/ resident"/);
  // A question: its default answer is the workflow's own sentence, and any other answer says where it came from.
  assert.match(broken((s) => { s.switches[0].options[0].text = 'A tool drafts the note.'; }), /with nothing changed it would write "A tool drafts the note\." over "An ambient documentation tool drafts during the meeting → review, edit, sign\."/);
  assert.match(broken((s) => { delete s.switches[0].options[1].basis; }), /question "drafting", answer "no": a sentence that is not the workflow's needs its basis/);
  assert.match(broken((s) => { s.switches[0].default = 'maybe'; }), /"drafting": its default is not one of its options/);
  assert.match(broken((s) => { s.switches[0].code = 'T'; }), /"drafting": its code is one capital letter, used once/);
  assert.match(broken((s) => { s.rules.find((item) => item.replace === '{drafting}').replace = '{drafting.label}'; }), /\{drafting\.label\} is a question and takes no form/);
  // A sentence that prints for some leads only must print on the workflow as written.
  assert.match(broken((s) => { s.notes['resident-supervision'].among = ['resident']; }), /notes: "resident-supervision" would not print on the workflow as written/);
  assert.match(broken((s) => { s.notes['resident-supervision'].among = ['psy-app-res', 'nursing']; }), /notes: "resident-supervision" lists a title that slot "lead" does not offer/);
  assert.match(broken((s) => { s.notes['resident-supervision'].slot = 'chair'; }), /notes: "resident-supervision" depends on unknown slot "chair"/);
  assert.match(broken((s) => { s.notes.elsewhere = { slot: 'lead', among: ['psy-app-res'] }; }), /notes: "elsewhere" is not one of the workflow's added sentences/);
  assert.match(broken((s) => { delete s.board.count; }), /board: "count" is required/);
  assert.match(broken((s) => { delete s.board.card; }), /board: "card" is required/);
  assert.match(broken((s) => { delete s.board.handoffs; }), /board: "handoffs" is required/);
  assert.match(broken((s) => { s.board.handoffs = 'Handoffs: {count}.'; }), /board: "handoffs" has no \{steps\}/);
  assert.match(broken((s) => { s.board.count = '{n} steps'; }), /board: "count" has no \{total\}/);
  assert.match(drift((w) => { w.steps.find((item) => item.id === 'rounds').support = []; }), /step "rounds": a step the team owns names who leads it as also involved \(psychiatrist\)/);
  assert.match(drift((w) => { w.roles.psychiatrist = 'Attending'; }), /role "psychiatrist": the workflow calls it "Attending"; these rules call it "Psychiatrist"/);
  assert.match(drift((w) => { w.roles.pharmacist = 'Pharmacist'; w.steps[0].support = ['pharmacist']; }), /role "pharmacist": the workflow uses it, and it is not one of the titles these rules know/);
});

test('A18 · with nothing changed, the sheet is the workflow word for word', () => {
  const result = adapt({});
  assert.equal(result.changed, 0);
  assert.equal(result.total, spec.slots.length + spec.timings.length + spec.switches.length);
  assert.equal(result.total, 9);
  assert.deepEqual(result.refused, []);
  assert.equal(core.status(result, given.spec), spec.messages.same);
  // The rewritten workflow is the workflow: every field, not only the ones a rule touches.
  const plain = JSON.parse(JSON.stringify(result.workflow));
  for (const item of plain.steps) {
    delete item.number;
    delete item.unowned;
  }
  assert.deepEqual(plain, given.workflow);

  // And the page prints all of it. Every sentence a reader of the workflow page sees is on the sheet.
  const sheet = squash(visibleText(core.sheet(result, given.spec)));
  const sentences = [
    workflow.purpose, workflow.scope, workflow.principle, workflow.basis, workflow.closing,
    ...workflow.steps.flatMap((item) => [item.title, item.trigger, item.ownerLabel, item.action, item.doneWhen, ...(item.record === null ? [] : [item.record])]),
    ...workflow.formats.menu.flatMap((item) => [item.name, item.focus, item.when]),
    workflow.formats.decisionRule, workflow.formats.noJointMeeting,
    ...workflow.guardrails,
    ...workflow.exceptions.flatMap((item) => [item.when, item.then]),
    workflow.measures.cadence, workflow.measures.baseline, ...workflow.measures.list.map((item) => item.name),
    ...workflow.additions.map((item) => item.text),
  ];
  assert.ok(sentences.length > 60, 'the workflow has more sentences than that');
  for (const sentence of sentences) assert.ok(sheet.includes(squash(sentence)), `missing from the sheet as written: “${sentence}”`);
  assert.ok(sheet.includes(spec.messages.markSame.replace('{version}', workflow.version)));
  assert.ok(!sheet.includes('Version code'), 'the workflow as written carries no version code');
});

test('A18 · every combination of owners reads as prose, and a step is refused exactly when nobody owns it', () => {
  const expected = spec.slots.reduce((count, slot) => count * (slot.options.length + 1), 1);
  assert.equal(expected, 70560, 'the number of ways to fill the jobs changed; update the documents that quote it');
  const forms = [...new Set(Object.values(spec.titles).flatMap((title) => [title.label, title.bare, title.phrase, title.person]).map((form) => form.toLowerCase()))];
  const escaped = forms.sort((a, b) => b.length - a.length).map((form) => form.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'));
  const twice = new RegExp(`(?:^|[^a-z])(${escaped.join('|')}) (?:or|and|\\+|with) \\1(?:$|[^a-z])`, 'i');
  const leftovers = /[{}]|undefined|null|NaN| {2}| [.,;:)]|\(\s|\(\)|\+\s*\)|^\s|\s$/m;
  assert.ok(!leftovers.test(prose(adapt({}))) && !twice.test(prose(adapt({}))), 'the workflow as written trips the checks below');

  const codes = new Set();
  const sentences = new Set();
  const handoffCounts = {};
  let count = 0;
  for (const choices of everyOwnerChoice()) {
    count += 1;
    const result = core.adapt(given.workflow, given.spec, { ...base, ...choices });
    const text = prose(result);
    const label = result.code;
    for (const item of result.workflow.steps) sentences.add(`${item.ownerLabel}. ${item.action}`.toLowerCase());
    if (count % 13 === 0) {
      // A20, on every thirteenth version: the board gives each step to the roles the choices
      // give it to, to nobody when nobody holds the job, and has a row for every role chosen.
      const picture = core.rows(result, given.spec);
      const drawn = [...picture.rows];
      given.workflow.steps.forEach((item, index) => {
        const slots = spec.owners[item.id];
        const owners = slots.every((slot) => choices[slot] === 'none') ? [] : item.owner.includes('team') ? ['team'] : [...new Set(slots.map((slot) => choices[slot]).filter((id) => id !== 'none'))].sort();
        assert.deepEqual(drawn.filter((row) => row.cells[index] === 'owns').map((row) => row.id).sort(), owners, `${label}: who the board says owns step ${index + 1}`);
        assert.equal(picture.steps[index].unowned, owners.length === 0, `${label}: step ${index + 1} flagged`);
      });
      for (const slot of spec.slots) if (choices[slot.id] !== 'none') assert.ok(drawn.some((row) => row.id === choices[slot.id]), `${label}: no row for ${choices[slot.id]}`);
      for (const row of drawn) assert.ok([...row.cells].some(Boolean) && row.owned === [...row.cells].filter((cell) => cell === 'owns').length, `${label}: row ${row.id}`);
      // "The meeting lead" names whoever owns the meeting: where a step's words say it, that role is marked.
      const meeting = given.workflow.steps.findIndex((item) => item.id === workflow.terms['the meeting lead']);
      const leads = drawn.filter((row) => row.cells[meeting] === 'owns');
      result.workflow.steps.forEach((item, index) => {
        if (item.action.includes('the meeting lead')) for (const row of leads) assert.ok(row.cells[index], `${label}: step ${index + 1} names the meeting lead, and ${row.id} is not marked there`);
      });
      // A22: a card for each row, holding as many steps as the row has marks; none when a step has no owner.
      const made = core.cards(result, given.spec);
      if (picture.steps.some((item) => item.unowned)) assert.equal(made, '', `${label}: cards for a version that does not print`);
      else {
        const each = made.split('<section class="adapt-card" ').slice(1);
        assert.deepEqual(each.map((card) => card.match(/^data-adapt-card="([^"]+)"/)[1]), drawn.map((row) => row.id), `${label}: one card for each row`);
        each.forEach((card, n) => assert.equal(card.split('<li class="wf-step rc-card').length - 1, [...drawn[n].cells].filter(Boolean).length, `${label}: steps on the card for ${drawn[n].id}`));
      }
    }
    assert.ok(!leftovers.test(text), `${label}: a leftover placeholder or a stray space`);
    assert.ok(!twice.test(text), `${label}: the same role named twice in one phrase`);
    const empty = spec.slots.filter((slot) => choices[slot.id] === 'none').map((slot) => slot.id);
    assert.equal(text.includes(spec.none.phrase), text.includes('[') || text.includes(']'), `${label}: brackets`);
    if (!empty.length) assert.ok(!text.includes(spec.none.phrase) && !text.includes(spec.messages.noOwner), `${label}: says nobody owns a job that is filled`);

    // Worked out here from the rules, not taken from the code under test.
    const unowned = given.workflow.steps.filter((item) => spec.owners[item.id].every((slot) => choices[slot] === 'none')).map((item) => item.title);
    assert.deepEqual([...result.refused].map((item) => item.title), unowned, `${label}: refused steps`);
    assert.equal(result.refused.length > 0, empty.length > 0, `${label}: an unfilled job must leave a step with no owner`);
    for (const item of result.workflow.steps) assert.equal(item.ownerLabel === spec.messages.noOwner, unowned.includes(item.title), `${label}: step ${item.number} owner label`);
    assert.equal(/does not print/.test(core.status(result, given.spec)), empty.length > 0, `${label}: status`);

    // A20: where the work changes hands, worked out here from the choices and not taken from
    // the code under test. It changes hands after a step when nobody who owns it owns the next.
    const who = given.workflow.steps.map((item) => {
      const slots = spec.owners[item.id];
      if (slots.every((slot) => choices[slot] === 'none')) return [];
      return item.owner.includes('team') ? ['team'] : slots.map((slot) => choices[slot]).filter((id) => id !== 'none');
    });
    const after = [];
    for (let i = 0; i + 1 < who.length; i += 1) if (who[i].length && who[i + 1].length && !who[i].some((id) => who[i + 1].includes(id))) after.push(i + 1);
    assert.deepEqual([...core.handoffs(result, given.spec)], after, `${label}: where the work changes hands`);
    const line = core.handoffLine(result, given.spec);
    if (empty.length) assert.equal(line, '', `${label}: a version that does not print says nothing about handoffs`);
    else {
      assert.ok(line.startsWith(`Handoffs in this version: ${after.length}, after steps ${after.slice(0, -1).join(', ')} and ${after.at(-1)}. `), `${label}: “${line}”`);
      handoffCounts[after.length] = (handoffCounts[after.length] || 0) + 1;
    }

    assert.equal(result.changed, spec.slots.filter((slot) => choices[slot.id] !== slot.default).length, `${label}: changes counted`);
    assert.equal(result.workflow.scope === null, result.changed > 0, `${label}: the source unit's list of roles is dropped once a role changes`);
    codes.add(result.code);
    assert.deepEqual(decode(result.code), { ...base, ...choices }, `${label}: the version code does not read back`);
  }
  assert.equal(count, expected);
  assert.equal(codes.size, expected, 'two different versions share a version code');
  // Of the versions that print, how many times the work changes hands. Never fewer than
  // twice: the team owns rounds, and nobody else does. Never more than five: one lead owns
  // the meeting, the note and the bridge.
  assert.deepEqual(handoffCounts, { 2: 10, 3: 555, 4: 6390, 5: 18245 });

  // A20: "also involved" is read off the words. For every sentence any version can print, the
  // roles the board finds in it are the roles a second, separately written reading finds.
  const names = [['team', 'team'], ...Object.entries(spec.titles).flatMap(([id, title]) => [...new Set(Object.values(title).map((form) => form.toLowerCase()))].map((name) => [id, name]))].sort((a, b) => b[1].length - a[1].length);
  const reads = (sentence) => {
    let left = sentence;
    const found = new Set();
    for (const [id, name] of names) {
      const whole = new RegExp(`(?<![a-z])${name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}(?![a-z])`, 'g');
      if (whole.test(left)) {
        found.add(id);
        left = left.replace(whole, (match) => ' '.repeat(match.length));
      }
    }
    return [...found].sort();
  };
  assert.ok(sentences.size > 100, `only ${sentences.size} different sentences were seen`);
  for (const sentence of sentences) assert.deepEqual([...core.named(given.spec, sentence)].sort(), reads(sentence), `the roles named in: “${sentence.slice(0, 120)}”`);
  assert.deepEqual(reads('enter the meeting like any other appointment. the apprentice applies.'), [], '"app" is not in "appointment"');
  assert.deepEqual(reads('nursing assistants. let the app know'), ['app', 'nursing-assistants'], '"nursing" is not in "nursing assistants"');
});

test('A20 · as written, the board on the adaptation page is the map’s board', () => {
  const picture = local(core.rows(adapt({}), given.spec));
  assert.deepEqual(picture.rows.map((row) => [row.label, row.cells]), mapBoard(workflow).map((row) => [row.label, row.cells]));
  assert.deepEqual(picture.steps.map((item) => [item.number, item.title, item.unowned]), workflow.steps.map((item, index) => [index + 1, item.title, false]));
  assert.deepEqual(Object.fromEntries(picture.rows.map((row) => [row.label, row.owned])), {
    'Psychiatrist / APP / resident': 4, Psychiatrist: 0, 'Social work': 2, Nursing: 0, 'Mental health technicians': 1, 'Unit secretary': 1, 'Treatment team': 1,
  });
});

test('A20 · the board follows the choices: who owns, who is also involved, how much each role carries, and which step nobody owns', () => {
  const draw = (choices) => {
    const picture = local(core.rows(adapt(choices), given.spec));
    return Object.fromEntries(picture.rows.map((row) => [row.label, `${row.cells.map((cell) => (cell === 'owns' ? '●' : cell === 'involved' ? '○' : '·')).join('')} ${row.owned}`]));
  };
  // One role leads. Steps 3 and 5 say "the meeting lead", so that role is marked at both.
  assert.deepEqual(draw({ lead: 'app' }), {
    'Psychiatrist / APP / resident': '●······· 1', Psychiatrist: '···○···· 0', APP: '··○·○●●● 3', 'Social work': '·●○··○·● 2', Nursing: '··○··○·· 0',
    'Mental health technicians': '····●··· 1', 'Unit secretary': '··●····· 1', 'Treatment team': '···●···· 1',
  });
  // One role carrying most of it shows as one long row.
  assert.deepEqual(draw({ lead: 'social-work', scheduler: 'social-work', escort: 'social-work' }), {
    'Psychiatrist / APP / resident': '●······· 1', Psychiatrist: '···○···· 0', 'Social work': '·●●·●●●● 6', Nursing: '··○··○·· 0', 'Treatment team': '···●···· 1',
  });
  // Nursing as the collateral contact, nursing assistants as escorts: two different rows.
  assert.deepEqual(draw({ partner: 'nursing', escort: 'nursing-assistants' }), {
    'Psychiatrist / APP / resident': '●·○·○●●● 4', Psychiatrist: '···○···· 0', Nursing: '·●○··○·● 2', 'Nursing assistants': '····●··· 1', 'Unit secretary': '··●····· 1', 'Treatment team': '···●···· 1',
  });
  // With nobody to lead the meeting, "the meeting lead" names nobody.
  assert.equal(draw({ lead: 'none' })['Psychiatrist / APP / resident'], '●······· 1');
  // The team owns rounds whoever leads them; with nobody to lead, nobody owns the step.
  assert.equal(draw({ rounds: 'nursing' }).Nursing, '··○○·○·· 0');
  assert.equal(draw({ rounds: 'nursing' })['Treatment team'], '···●···· 1');
  assert.ok(!('Treatment team' in draw({ rounds: 'none' })));

  // As drawn: a step nobody owns is marked down its whole column and says so in words.
  const result = adapt({ scheduler: 'none' });
  const html = core.board(result, given.spec);
  const picture = local(core.rows(result, given.spec));
  assert.deepEqual(picture.steps.filter((item) => item.unowned).map((item) => item.number), [3]);
  assert.equal(html.match(/class="adapt-board__gap"/g).length, 1 + picture.rows.length);
  assert.equal(html.match(/<span class="rc-badge rc-badge--warning">No owner yet<\/span>/g).length, 1);
  assert.ok(!html.includes('●') && html.includes('<caption class="sr-only">'));
  assert.match(html, /<th scope="row">Social work<\/th>.*?<td class="adapt-board__count">2 of 8<\/td><\/tr>/);
  assert.equal(html.match(/<td class="adapt-board__count">/g).length, picture.rows.length);
  assert.ok(html.includes('<th scope="col" class="adapt-board__count">Steps owned</th>'));
  assert.equal(core.board(adapt({}), given.spec).includes('adapt-board__gap'), false);
});

test('A20 · the board says how often the work changes hands, and after which steps', () => {
  const line = (choices) => core.handoffLine(adapt(choices), given.spec);
  const rule = ' A handoff is where no one who owns a step also owns the next.';
  // As written: five. The lead keeps the meeting, the note and the bridge, so nothing changes hands after step 5.
  assert.equal(line({}), `Handoffs in this version: 5, after steps 1, 2, 3, 4 and 5.${rule}`);
  assert.deepEqual([...core.handoffs(adapt({}), given.spec)], [1, 2, 3, 4, 5]);
  // The role that asks also makes the call: one fewer.
  assert.equal(line({ ask: 'social-work', lead: 'social-work' }), `Handoffs in this version: 4, after steps 2, 3, 4 and 5.${rule}`);
  // One role does everything but rounds: the team takes the work for rounds and gives it back.
  assert.equal(line({ ask: 'social-work', scheduler: 'social-work', escort: 'social-work', lead: 'social-work' }), `Handoffs in this version: 2, after steps 3 and 4.${rule}`);
  // A step two roles share does not hand off to either of them, or from either.
  assert.deepEqual([...core.handoffs(adapt({ partner: 'nursing' }), given.spec)], [1, 2, 3, 4, 5], 'the bridge is shared by the lead, who owned the step before');
  assert.deepEqual([...core.handoffs(adapt({ lead: 'social-work', ask: 'nursing' }), given.spec)], [1, 2, 3, 4, 5]);
  // A version with a step nobody owns says nothing; the gap is already marked.
  assert.equal(line({ escort: 'none' }), '');
  assert.deepEqual([...core.handoffs(adapt({ escort: 'none' }), given.spec)], [1, 2, 3], 'a step nobody owns neither takes the work nor gives it');
  // The count in the sentence is the number of steps it lists, and each change of choice can move it.
  for (const choices of [{}, { lead: 'app' }, { scheduler: 'social-work' }, { escort: 'unit-secretary', scheduler: 'unit-secretary' }]) {
    const said = line(choices).match(/^Handoffs in this version: (\d), after steps ([\d, and]+)\./);
    assert.equal(Number(said[1]), said[2].split(/, | and /).length, JSON.stringify(choices));
  }
  // One handoff is written in the singular, should a workflow ever have just one.
  const flat = JSON.parse(JSON.stringify(given));
  flat.workflow.steps.forEach((item) => { item.owner = ['psy-app-res']; });
  Object.keys(flat.spec.owners).forEach((id, index) => { flat.spec.owners[id] = [index < 3 ? 'ask' : 'lead']; });
  const one = core.adapt(flat.workflow, flat.spec, { ...base, ask: 'nursing' });
  assert.equal(core.handoffLine(one, flat.spec), `Handoffs in this version: 1, after step 3.${rule}`);
  assert.equal(core.handoffLine(core.adapt(flat.workflow, flat.spec, { ...base }), flat.spec), '', 'nothing changes hands, so nothing is said');
});

test('A22 · a card for one role holds its steps as the sheet prints them, the guardrails and the exceptions, and nothing of its own', () => {
  const cardsOf = (html) => [...html.matchAll(/<section class="adapt-card" data-adapt-card="([^"]+)">([\s\S]*?)<\/section>/g)].map(([, id, inner]) => ({ id, inner }));
  const STEP = /<li class="wf-step rc-card[^"]*"(?: id="step-[a-z-]+")?>([\s\S]*?)<\/li>/g;
  const versions = [{}, { lead: 'app', drafting: 'no' }, { lead: 'social-work', scheduler: 'social-work', escort: 'social-work', contact: '48 h' }, { partner: 'nursing', escort: 'nursing-assistants', rounds: 'resident', lead: 'resident' }];
  for (const choices of versions) {
    const result = adapt(choices);
    const label = result.code;
    const picture = local(core.rows(result, given.spec));
    const onSheet = [...core.sheet(result, given.spec).matchAll(STEP)].map(([, inner]) => inner);
    assert.equal(onSheet.length, workflow.steps.length);
    const made = cardsOf(core.cards(result, given.spec));
    assert.deepEqual(made.map((card) => card.id), picture.rows.map((row) => row.id), `${label}: one card for each row of the board, in its order`);
    const mark = result.changed ? `${spec.messages.markChanged.replace('{version}', workflow.version).replace('{code}', result.code)} ${spec.messages.local}` : spec.messages.markSame.replace('{version}', workflow.version);
    for (const [n, card] of made.entries()) {
      const row = picture.rows[n];
      const marked = row.cells.map((cell, index) => (cell ? index : -1)).filter((index) => index >= 0);
      const steps = [...card.inner.matchAll(STEP)].map(([, inner]) => inner);
      assert.equal(steps.length, marked.length, `${label}, ${row.label}: it holds the steps the board marks for it, and no others`);
      marked.forEach((index, k) => {
        const says = row.cells[index] === 'owns' ? spec.board.owns : spec.board.involved;
        const part = `<p class="adapt-card__part"><span class="map-mark map-mark--${row.cells[index] === 'owns' ? 'owns' : 'involved'}" aria-hidden="true"></span>${says}</p>`;
        assert.ok(steps[k].includes(`<div class="wf-step__body">${part}<h3>`), `${label}, ${row.label}, step ${index + 1}: says whether the role owns it`);
        // Take that one line out, and the step on the card is the step on the sheet, tag for tag.
        assert.equal(steps[k].replace(part, ''), onSheet[index], `${label}, ${row.label}: step ${index + 1} differs from the sheet`);
      });
      // Around its steps a card has the version line, the role, where the workflow comes from,
      // the guardrails, the exceptions and the closing line. Each is the sheet's; nothing else is there.
      const around = squash(visibleText(card.inner.replace(STEP, '')));
      const want = [mark, row.label, result.workflow.basis, 'Guardrails', ...result.workflow.guardrails, 'When it does not go to plan', ...result.workflow.exceptions.flatMap((item) => [item.when, item.then]), result.workflow.closing];
      assert.equal(around, squash(want.join(' ')), `${label}, ${row.label}: the card says something of its own`);
      assert.ok(!/ id="/.test(card.inner), 'a card repeats an id the sheet uses');
    }
  }
  // Read off the cards: who gets what, as written and when one title leads.
  const held = (choices) => Object.fromEntries(cardsOf(core.cards(adapt(choices), given.spec)).map((card) => [card.id, [...card.inner.matchAll(/<span class="sr-only">Step (\d): <\/span>/g)].map(([, number]) => Number(number))]));
  assert.deepEqual(held({}), { 'psy-app-res': [1, 3, 5, 6, 7, 8], psychiatrist: [4], 'social-work': [2, 3, 6, 8], nursing: [3, 6], techs: [5], 'unit-secretary': [3], team: [4] });
  assert.deepEqual(held({ lead: 'app' }).app, [3, 5, 6, 7, 8]);
  // The line on a resident's supervision is on a card only where the sheet has it.
  const supervision = workflow.additions.find((note) => note.id === 'resident-supervision').text;
  assert.ok(cardsOf(core.cards(adapt({}), given.spec)).find((card) => card.id === 'psy-app-res').inner.includes(supervision));
  assert.ok(!core.cards(adapt({ lead: 'app' }), given.spec).includes(supervision));
  assert.ok(!cardsOf(core.cards(adapt({}), given.spec)).find((card) => card.id === 'social-work').inner.includes(supervision), 'step 7 is not social work’s');

  const nursingCard = cardsOf(core.cards(adapt({ partner: 'nursing' }), given.spec)).find((card) => card.id === 'nursing');
  assert.match(nursingCard.inner, /Suspected partner violence stops the joint invitation/);
  assert.match(nursingCard.inner, /Suspected partner violence[^<]*<\/dt><dd>No conjoint meeting/);

  // A version with a step nobody owns has no cards, and its buttons are off.
  const refused = adapt({ scheduler: 'none' });
  assert.equal(core.cards(refused, given.spec), '');
  const buttons = (result, off) => [...core.cardButtons(result, given.spec, off).matchAll(/<button type="button" class="rc-btn rc-btn--ghost" data-adapt-card-print="([^"]+)"( disabled)?>([^<]+)<\/button>/g)].map(([, id, disabled, name]) => [id, name, Boolean(disabled)]);
  assert.ok(buttons(refused, false).length > 0 && buttons(refused, false).every(([, , disabled]) => disabled));
  const written = local(core.rows(adapt({}), given.spec));
  assert.deepEqual(buttons(adapt({}), false), written.rows.map((row) => [row.id, row.label, false]), 'a button for each row, named for its role');
  assert.deepEqual(buttons(adapt({}), true), written.rows.map((row) => [row.id, row.label, true]), 'as the page is built, every button is off');
  assert.equal(core.cardButtons(adapt({}), given.spec, false).replace(/<button[^>]*>[^<]*<\/button>/g, ''), '', 'something besides buttons');

  // Nothing in the data reaches a card or a button as markup.
  const hostile = JSON.parse(JSON.stringify(given));
  hostile.workflow.steps[0].title = '<img src=x onerror=boom()>';
  hostile.workflow.guardrails[0] = '</li><script>boom()</script>';
  hostile.workflow.basis = '<u>basis</u>';
  hostile.spec.titles['social-work'].label = '<i>SW</i>';
  hostile.spec.board.owns = '<b>owns</b>';
  hostile.workflow.roles.team = '"><strong>Team</strong>';
  const outcome = core.adapt(hostile.workflow, hostile.spec, { ...base });
  for (const html of [core.cards(outcome, hostile.spec), core.cardButtons(outcome, hostile.spec, false)]) assert.ok(!/<(?:img|script|u|i|b|strong)[\s>]/.test(html), 'markup from the data reached a card');
  for (const shown of ['&lt;img src=x onerror=boom()&gt;', '&lt;/li&gt;&lt;script&gt;boom()&lt;/script&gt;', '&lt;u&gt;basis&lt;/u&gt;', '<h2>&lt;i&gt;SW&lt;/i&gt;</h2>', '&lt;b&gt;owns&lt;/b&gt;']) assert.ok(core.cards(outcome, hostile.spec).includes(shown), `not shown as text on a card: ${shown}`);
  assert.ok(core.cardButtons(outcome, hostile.spec, false).includes('>&quot;&gt;&lt;strong&gt;Team&lt;/strong&gt;</button>'));

  // In print a card stands in for the sheet only while it is being printed; on screen the cards are not shown.
  const css = readFileSync(join(ROOT, 'src/assets/site.css'), 'utf8');
  const print = css.slice(css.indexOf('@media print'));
  assert.ok(css.slice(0, css.indexOf('@media print')).includes('.adapt-cards { display: none; }'));
  for (const rule of ['.adapt[data-print-card] .adapt-sheet { display: none; }', '.adapt[data-print-card] .adapt-cards { display: block; }', '.adapt-card { display: none; }', '.adapt-card[data-printing] { display: block; }']) assert.ok(print.includes(rule), `print rule missing: ${rule}`);
});

test('A18 · every combination of intervals and answers is written into the step, the note and the exception that depend on it', () => {
  const samples = [{}, { lead: 'social-work', partner: 'case-management', scheduler: 'unit-clerk' }, { partner: 'none' }];
  const [asked] = spec.switches;
  const codes = new Set();
  let count = 0;
  for (const contact of spec.timings[0].options) {
    for (const update of spec.timings[1].options) {
      for (const answer of asked.options) {
        for (const owners of samples) {
          count += 1;
          const result = adapt({ ...owners, contact, update, drafting: answer.id });
          assert.equal(step(result, 'invite').trigger, `Within ${contact} of admission`);
          assert.equal(result.workflow.exceptions[0].when, `Support person not reached in ${contact}.`);
          const note = step(result, 'note').action;
          assert.ok(note.includes(`every ${update}`), `every ${update}`);
          for (const option of asked.options) assert.equal(note.includes(option.text), option.id === answer.id, `the note says “${option.text}” when the answer is ${answer.id}`);
          assert.ok(!/[{}]/.test(prose(result)));
          assert.deepEqual(decode(result.code), { ...base, ...owners, contact, update, drafting: answer.id });
          assert.equal(result.changed, Object.keys(owners).length + (contact !== base.contact) + (update !== base.update) + (answer.id !== base.drafting));
          codes.add(result.code);
        }
      }
    }
  }
  assert.equal(count, 54);
  assert.equal(codes.size, 54, 'two different versions share a version code');
  // Without the tool the step still reads as one paragraph, and only that sentence differs.
  const plain = adapt({ drafting: 'no' });
  assert.equal(step(plain, 'note').action, workflow.steps.find((item) => item.id === 'note').action.replace(asked.options[0].text, asked.options[1].text));
  assert.ok(step(plain, 'note').action.includes('(how it landed; new safety concerns). Write the note after the meeting; sign. Record purpose and permission'));
  assert.equal(core.status(plain, given.spec), 'Changed from the workflow as written: 1 of 9 choices.');
  assert.ok(squash(visibleText(core.sheet(plain, given.spec))).includes(`${asked.question} No`), 'a changed version lists the answer with the other choices');
  assert.deepEqual(plain.workflow.guardrails, workflow.guardrails, 'the guardrail on AI drafts stays, tool or no tool');
  // The intervals the rules leave alone are the clinical ones: they read the same in every version.
  const far = adapt({ contact: '72 h', update: 'week' });
  assert.deepEqual(far.workflow.guardrails, workflow.guardrails);
  assert.deepEqual(far.workflow.exceptions.slice(1), workflow.exceptions.slice(1).map(({ when, then }) => ({ when, then })));
  assert.deepEqual(far.workflow.measures, given.workflow.measures);
  assert.deepEqual(far.workflow.formats, given.workflow.formats);
});

test('A18 · one person holding two jobs is written once, and a job nobody holds is not papered over', () => {
  // The meeting lead is also the collateral contact.
  let result = adapt({ lead: 'social-work' });
  assert.equal(step(result, 'meet').ownerLabel, 'Social work (+ nursing when available)');
  assert.equal(step(result, 'bridge').ownerLabel, 'Social work');
  assert.equal(step(result, 'rounds').ownerLabel, 'Team — psychiatrist leads', 'who leads the meeting does not decide who leads rounds');
  // The collateral contact is nursing: no "nursing or nursing", and the charge nurse is not told twice.
  result = adapt({ partner: 'nursing' });
  assert.equal(step(result, 'meet').ownerLabel, 'Psychiatrist / APP / resident (+ nursing when available)');
  assert.ok(step(result, 'book').action.endsWith('Notify the charge nurse.'));
  assert.equal(result.workflow.exceptions[0].then.split(' ')[0], 'Nursing');
  // The person who books is the person who would be notified.
  result = adapt({ scheduler: 'social-work' });
  assert.ok(step(result, 'book').action.includes('(the meeting lead’s calendar shared with social work)'));
  assert.ok(step(result, 'book').action.endsWith('Notify the charge nurse.'));
  // The lead books their own meetings, and walks the family up.
  result = adapt({ scheduler: 'social-work', lead: 'social-work', escort: 'social-work' });
  assert.ok(step(result, 'book').action.includes('(the meeting lead’s calendar)'));
  assert.ok(step(result, 'bring-up').action.endsWith('set up the room.'));
  // The calendar and the word that the family has arrived go to whoever leads the meeting
  // (the author's decision, 2026-11-17). The two sentences say so by role, in every version.
  for (const lead of ['psy-app-res', 'app', 'psychologist']) {
    result = adapt({ lead });
    assert.ok(step(result, 'book').action.includes('(the meeting lead’s calendar shared with the unit secretary)'), lead);
    assert.ok(step(result, 'bring-up').action.endsWith('; let the meeting lead know they have arrived.'), lead);
  }
  assert.equal(step(adapt({ lead: 'app' }), 'meet').ownerLabel, 'APP (+ social work or nursing when available)');
  assert.ok(!prose(adapt({})).includes('psychiatrist’s calendar') && !prose(adapt({})).includes('let the psychiatrist know'));
  // The line on a resident's supervision prints while a resident can lead, and not otherwise.
  const supervision = workflow.additions.find((note) => note.id === 'resident-supervision').text;
  assert.equal(workflow.steps.find((item) => item.id === 'note').note, 'resident-supervision');
  for (const [lead, printed] of [['psy-app-res', true], ['resident', true], ['psychiatrist', false], ['app', false], ['psychologist', false], ['social-work', false], ['none', false]]) {
    result = adapt({ lead });
    assert.equal(squash(visibleText(core.sheet(result, given.spec))).includes(supervision), printed, `lead ${lead}: the supervision line`);
    assert.equal(result.workflow.additions.some((note) => note.id === 'resident-supervision'), printed, `lead ${lead}`);
    assert.equal(result.workflow.additions.length, workflow.additions.length - (printed ? 0 : 1), `lead ${lead}: the other added sentences stay`);
  }
  assert.match(core.sheet(adapt({}), given.spec), new RegExp(`id="step-note">.*?</p><p class="wf-note">${supervision}</p><dl class="wf-facts">`), 'the line sits under step 7');
  // The lead's title already names the resident, so a resident as collateral contact is not named again.
  result = adapt({ partner: 'resident' });
  assert.equal(step(result, 'meet').ownerLabel, 'Psychiatrist / APP / resident (+ nursing when available)');
  assert.equal(step(result, 'bridge').ownerLabel, 'Psychiatrist / APP / resident');
  // Rounds has its own owner.
  assert.equal(step(adapt({ rounds: 'nursing' }), 'rounds').ownerLabel, 'Team — nurse leads');
  // A step two jobs share is owned while either is filled.
  result = adapt({ lead: 'none' });
  assert.equal(step(result, 'bridge').ownerLabel, 'Social work');
  assert.deepEqual(result.refused.map((item) => item.number), [6, 7]);
  assert.ok(step(result, 'bring-up').action.includes('let the meeting lead know'), 'the sentence names the role, filled or not');
  assert.ok(step(adapt({ partner: 'none' }), 'exceptions') === undefined && adapt({ partner: 'none' }).workflow.exceptions[0].then.startsWith('[no one yet] documents'), 'a gap shows in the sentence that depends on it');
});

test('A18 · a version with a step nobody owns is refused, says which step, and marks it on the sheet', () => {
  let result = adapt({ scheduler: 'none' });
  assert.deepEqual(result.refused, [{ number: 3, title: step(result, 'book').title }]);
  assert.equal(core.status(result, given.spec), `Step 3 (${step(result, 'book').title}) has no owner. A version with a step nobody owns does not print.`);
  let sheet = core.sheet(result, given.spec);
  assert.equal(sheet.match(/wf-step--gap/g).length, 1);
  assert.equal(sheet.match(/<span class="rc-badge rc-badge--warning">No owner yet<\/span>/g).length, 1);

  result = adapt({ lead: 'none', partner: 'none' });
  assert.deepEqual(result.refused.map((item) => item.number), [2, 6, 7, 8]);
  assert.equal(core.status(result, given.spec), 'Steps 2, 6, 7 and 8 have no owner. A version with a step nobody owns does not print.');
  sheet = core.sheet(result, given.spec);
  assert.equal(sheet.match(/wf-step--gap/g).length, 4);

  // A changed version that can print says it is local, and carries its code and its choices.
  result = adapt({ lead: 'app', contact: '48 h' });
  assert.equal(core.status(result, given.spec), 'Changed from the workflow as written: 2 of 9 choices.');
  sheet = squash(visibleText(core.sheet(result, given.spec)));
  assert.ok(sheet.includes(`Adapted from Family Work on the Unit, unit workflow version 2.0. Version code ${result.code}.`));
  assert.ok(sheet.includes(spec.messages.local));
  for (const slot of spec.slots) assert.ok(sheet.includes(`${slot.question} ${spec.titles[result.choices[slot.id]].label}`), slot.id);
  assert.ok(sheet.includes(`${spec.timings[0].question} Within 48 h`));
  assert.ok(sheet.includes(`${spec.switches[0].question} Yes`));
  assert.ok(!sheet.includes(squash(workflow.scope)), 'the source unit’s list of roles would contradict the choices above it');
});

test('A18 · only the choices on offer are accepted, and the sheet escapes everything it prints', () => {
  // Anything that is not one of a job's options falls back to the workflow as written.
  const odd = local(core.adapt(given.workflow, given.spec, { lead: '<script>', partner: 'psychologist', contact: '1 h', update: 72, nobody: 'x', scheduler: null }));
  assert.deepEqual(odd.choices, base);
  assert.equal(odd.changed, 0);
  // A code carries the revision of the lists it was made from, and is read against no others.
  assert.equal(REV, revision(workflow, spec));
  assert.match(REV, /^[0-9a-f]{3}$/);
  assert.deepEqual(decode(`2.0-${REV}/A0C0S0R0E0L0/T0U1/D0`), base);
  assert.equal(adapt({}).code, `2.0-${REV}/A0C0S0R0E0L0/T0U1/D0`);
  assert.deepEqual(decode(`2.0-${REV}/A0C0S0R0E0L0/T0U1/D1`), { ...base, drafting: 'no' });
  const longer = load(RULES);
  longer.slots[0].options.push('psychologist');
  assert.notEqual(revision(workflow, longer), REV, 'a list changed and the revision did not');
  const other = REV === '000' ? '001' : '000';
  for (const text of ['', '2.0', `2.0-${REV}`, `2.0-${REV}/A0/T0U1/D0`, `2.0-${REV}/A9C0S0R0E0L0/T0U1/D0`, `2.0-${REV}/A0C0S0R0E0L0/TxU1/D0`, `1.0-${REV}/A0C0S0R0E0L0/T0U1/D0`, `2.0-${REV}/L0E0R0S0C0A0/T0U1/D0`, '2.0/A0C0S0R0E0L0/T0U1/D0', `2.0-${other}/A0C0S0R0E0L0/T0U1/D0`,
    `2.0-${REV}/A0C0S0R0E0L0/T0U1`, `2.0-${REV}/A0C0S0R0E0L0/T0U1/D2`, `2.0-${REV}/A0C0S0R0E0L0/T0U1/Dx`, `2.0-${REV}/A0C0S0R0E0L0/T0U1/N0`, `2.0-${REV}/A0C0S0R0E0L0/T0U1/D0D0`, 'x'.repeat(2000)]) {
    assert.equal(decode(text), null, `“${text.slice(0, 40)}” is not a version code`);
  }
  // Rules that ask no question make, and read, codes with no third part.
  const unasked = JSON.parse(JSON.stringify(given.spec));
  unasked.switches = [];
  unasked.rules = unasked.rules.filter((item) => item.replace !== '{drafting}');
  const short = core.adapt(given.workflow, unasked, core.defaults(unasked)).code;
  assert.equal(short, `2.0-${REV}/A0C0S0R0E0L0/T0U1`);
  assert.deepEqual({ ...core.decode(unasked, short, workflow.version) }, { ...core.defaults(unasked) });
  assert.equal(core.decode(unasked, `${short}/D0`, workflow.version), null);

  // The script writes the sheet into the page, so nothing in the data may reach it as markup.
  const hostile = JSON.parse(JSON.stringify(given));
  hostile.workflow.steps[0].title = '<img src=x onerror=boom()>';
  hostile.workflow.guardrails[0] = '</li><script>boom()</script>';
  hostile.workflow.measures.list[0].checksStep = '"><b>';
  hostile.spec.titles.app.label = '<i>APP</i>';
  hostile.spec.messages.local = '"><u>local</u>';
  hostile.spec.slots[0].question = '<s>who</s>';
  hostile.spec.board.count = '<em>{n}</em>';
  hostile.spec.switches[0].options[0].text = '<img src=y onerror=boom()>';
  hostile.spec.switches[0].options[0].label = '<b>Yes</b>';
  hostile.workflow.additions.find((note) => note.id === 'resident-supervision').text = '<script>boom()</script>';
  hostile.workflow.roles.team = '<strong>Team</strong>';
  const result = core.adapt(hostile.workflow, hostile.spec, { ...base, ask: 'app' });
  const html = core.sheet(result, hostile.spec);
  assert.ok(!/<(?:img|script|b|i|u|s)[\s>]/.test(html), 'markup from the data reached the sheet');
  const drawn = core.board(result, hostile.spec);
  assert.ok(!/<(?:img|script|b|i|u|s|em|strong)[\s>]/.test(drawn), 'markup from the data reached the board');
  for (const shown of ['&lt;img src=x onerror=boom()&gt;', '&lt;i&gt;APP&lt;/i&gt;', '&lt;em&gt;1&lt;/em&gt;', '&lt;strong&gt;Team&lt;/strong&gt;']) assert.ok(drawn.includes(shown), `not shown as text on the board: ${shown}`);
  for (const shown of ['&lt;img src=x onerror=boom()&gt;', '&lt;/li&gt;&lt;script&gt;boom()&lt;/script&gt;', '&lt;i&gt;APP&lt;/i&gt;', '&quot;&gt;&lt;u&gt;local&lt;/u&gt;', '&lt;s&gt;who&lt;/s&gt;', 'href="#step-&quot;&gt;&lt;b&gt;"', '&lt;img src=y onerror=boom()&gt;', '&lt;b&gt;Yes&lt;/b&gt;', '<p class="wf-note">&lt;script&gt;boom()&lt;/script&gt;</p>']) {
    assert.ok(html.includes(shown), `not shown as text: ${shown}`);
  }
});

test('A18 · the page as built: fixed menus that are off until the script runs, nothing to type, and the sheet as written', () => {
  const html = read(built('review').dir, `${SLUG}.html`);
  assert.ok(!/<(?:form|textarea|input)\b/i.test(html), 'a field a reader could type into');
  assert.ok(!/contenteditable/i.test(html));
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)" defer><\/script>/g)].map((m) => m[1]), ['../assets/site.js', '../assets/adapt.js']);

  const menus = [...html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/g)].map(([, attributes, inner]) => ({
    attributes,
    id: attributes.match(/ data-adapt="([^"]*)"/)?.[1],
    options: [...inner.matchAll(/<option value="([^"]*)"( selected)?>([^<]*)<\/option>/g)].map(([, value, selected, label]) => ({ value, selected: Boolean(selected), label })),
  }));
  const offered = [
    ...spec.slots.map((slot) => ({ id: slot.id, question: slot.question, fallback: slot.default, options: [...slot.options.map((id) => [id, spec.titles[id].label]), ['none', spec.none.label]] })),
    ...spec.timings.map((timing) => ({ id: timing.id, question: timing.question, fallback: timing.default, options: timing.options.map((value) => [value, `${timing.prefix} ${value}`]) })),
    ...spec.switches.map((item) => ({ id: item.id, question: item.question, fallback: item.default, options: item.options.map((option) => [option.id, option.label]) })),
  ];
  assert.equal(offered.length, 9);
  assert.deepEqual(menus.map((menu) => menu.id), offered.map((item) => item.id));
  for (const [index, menu] of menus.entries()) {
    const want = offered[index];
    assert.ok(!/\sname=/.test(menu.attributes), `${want.id}: a named field could be submitted`);
    assert.ok(/ disabled$/.test(menu.attributes), `${want.id}: must be off until the script switches it on`);
    assert.ok(menu.attributes.includes(' autocomplete="off"'), `${want.id}: the browser must not put an old choice back`);
    assert.ok(menu.attributes.includes(` data-default="${want.fallback}"`));
    assert.ok(html.includes(`<label for="adapt-${want.id}">${want.question}</label>`), `${want.id}: no label`);
    assert.ok(html.includes(`id="adapt-${want.id}-hint">Step`), `${want.id}: no hint naming its steps`);
    assert.deepEqual(menu.options.map((option) => [option.value, option.label]), want.options, `${want.id}: its options are the declared ones, in order`);
    assert.deepEqual(menu.options.filter((option) => option.selected).map((option) => option.value), [want.fallback]);
  }
  const rowsAsWritten = local(core.rows(adapt({}), given.spec)).rows;
  assert.equal(html.match(/<button\b[^>]*>/g).filter((tag) => / disabled>$/.test(tag)).length, 2 + rowsAsWritten.length, 'every button is off until the script runs');
  assert.equal(html.match(/<button\b[^>]*>/g).length, 2 + rowsAsWritten.length, 'a button that is on without the script');
  // A22: the cards and their buttons, as written, are in the page as the script would draw them.
  assert.ok(html.includes(`<ul class="map-legend">`) && html.includes(`</ul>\n<p class="adapt-handoffs" data-adapt-handoffs>${core.handoffLine(adapt({}), given.spec)}</p>\n<h3 class="adapt-cards__title"`), 'the handoff line as built is not the line as written');
  assert.ok(html.includes(`<h3 class="adapt-cards__title" id="adapt-cards-title">${spec.board.card}</h3>\n<div class="adapt-cards__buttons" role="group" aria-labelledby="adapt-cards-title" data-adapt-card-buttons>${core.cardButtons(adapt({}), given.spec, true)}</div>`));
  assert.ok(html.includes(`<div class="adapt-cards" data-adapt-cards>${core.cards(adapt({}), given.spec)}</div>`));
  assert.equal(html.match(/<section class="adapt-card" /g).length, rowsAsWritten.length);
  assert.equal(new Set(ids(html)).size, ids(html).length, 'an id is used twice on the page');
  assert.ok(html.includes(`<noscript><p class="rc-alert rc-alert--warning">${spec.messages.noScript}</p></noscript>`));

  // What the page is built with is what the browser is given, and the sheet in the file is the workflow as written.
  const data = JSON.parse(html.match(/<script type="application\/json" id="adapt-data">([\s\S]*?)<\/script>/)[1]);
  assert.deepEqual(data, given);
  assert.ok(data.workflow.additions.every((note) => !('basis' in note)) && data.workflow.steps.every((item) => !('links' in item) && !('support' in item)), 'the page carries fields the script does not read');
  assert.ok(data.spec.switches.every((item) => item.options.every((option) => !('basis' in option))), 'where an answer came from is for the reviewer, not the page');
  assert.ok(html.includes('id="adapt-drafting-hint">Step 7</p>'));
  assert.equal(data.spec.rev, REV);
  assert.ok(html.includes(`<div data-adapt-sheet>\n${core.sheet(adapt({}), given.spec)}\n</div>`));
  assert.ok(html.includes(`<p class="adapt-status" id="adapt-status" role="status">${spec.messages.same}</p>`));
  assert.ok(html.includes(`<div class="rc-table-wrap map-board-wrap" role="region" aria-labelledby="adapt-board-title" tabindex="0" data-adapt-board>${core.board(adapt({}), given.spec)}</div>`), 'the board in the page as built is not the board as written');
  assert.ok(html.includes(`<h2 id="adapt-board-title">${spec.board.title}</h2>`) && html.includes('<section class="adapt-board-section no-print"'));
  const levels = headings(html);
  for (let i = 1; i < levels.length; i += 1) assert.ok(levels[i] - levels[i - 1] <= 1, 'a heading level is skipped');

  // The workflow page offers the adaptation page; the pages that lead to it link to it.
  const dir = built('review').dir;
  assert.ok(read(dir, 'system/unit-workflow.html').includes('href="adapt-it.html">Adapt it for your unit</a>'));
  assert.ok(read(dir, 'system/set-it-up.html').includes('href="adapt-it.html"'));
});

test('A18 · the review of the page covers the rules, the workflow and the script; changing any of them reopens it', () => {
  const save = (dir, rel, value) => writeFileSync(join(dir, rel), `${JSON.stringify(value, null, 2)}\n`);
  const signed = () => {
    const dir = scratchRepo();
    const page = loadSite(dir).pages.find((p) => p.slug === SLUG);
    const ledger = load('governance/ledger.json', dir);
    ledger[SLUG] = {
      status: 'reviewed', risk: ledger[SLUG].risk, at: '2026-11-17', by: 'Test Reviewer, MD', contentHash: page.contentHash,
      release: { gate: 'unit-practice', by: 'Test Reviewer, MD', at: '2026-11-17', confirmed: Object.keys(RELEASES['unit-practice'].confirm) },
    };
    save(dir, 'governance/ledger.json', ledger);
    return dir;
  };
  const publicBuild = (dir) => {
    const target = mkdtempSync(join(tmpdir(), 'fwu-out-'));
    const report = build({ root: dir, outDir: target, channel: 'public' });
    return { target, state: report.pages.find((p) => p.slug === SLUG).state, shipped: report.pages.filter((p) => p.shipped).map((p) => p.slug) };
  };

  const page = loadSite(ROOT).pages.find((p) => p.slug === SLUG);
  assert.deepEqual([...page.sources].sort(), [ADAPT_SCRIPT, RULES, WORKFLOW].sort());
  assert.equal(page.release, 'unit-practice', 'it prints a real unit’s procedure, so it needs the release record too');

  // Attested, it ships, and its script ships with it. Unattested, neither is in the public build.
  let dir = signed();
  let result = publicBuild(dir);
  assert.equal(result.state, 'attested');
  assert.deepEqual(result.shipped, [SLUG]);
  assert.ok(existsSync(join(result.target, 'assets/adapt.js')));
  dir = scratchRepo();
  result = publicBuild(dir);
  assert.deepEqual(result.shipped, []);
  assert.ok(!existsSync(join(result.target, 'assets/adapt.js')), 'the script reached a public build that has no adaptation page');
  assert.ok(!existsSync(join(result.target, `${SLUG}.html`)));

  for (const [what, change] of [
    ['the rules', (root) => { const rules = load(RULES, root); rules.slots[0].options.pop(); save(root, RULES, rules); }],
    ['the workflow', (root) => { const flow = load(WORKFLOW, root); flow.guardrails.push('One more guardrail, added after the review.'); save(root, WORKFLOW, flow); }],
    ['the script', (root) => appendFileSync(join(root, ADAPT_SCRIPT), '\n// changed after the review\n')],
  ]) {
    dir = signed();
    change(dir);
    result = publicBuild(dir);
    assert.equal(result.state, 'stale', `changing ${what} must reopen the page`);
    assert.deepEqual(result.shipped, [], `changing ${what} must take the page out of the public build`);
    assert.ok(!existsSync(join(result.target, `${SLUG}.html`)));
  }

  // The attestation is of the workflow as written: in print it does not travel on a changed version.
  const css = readFileSync(join(ROOT, 'src/assets/site.css'), 'utf8');
  assert.ok(css.slice(css.indexOf('@media print')).includes('.adapt[data-changed="true"][data-state="attested"] .status-banner { display: none; }'));
  dir = signed();
  const attested = read(publicBuild(dir).target, `${SLUG}.html`);
  assert.match(attested, /<article class="page page--wide adapt" data-adapt-root data-refused="false" data-changed="false" data-state="attested">/);
  assert.match(attested, /<strong>Attested\.<\/strong> Reviewed by Test Reviewer, MD on November 17, 2026\./);

  // A manifest that leaves the script out of the page's sources is refused.
  dir = scratchRepo();
  const manifest = load('content/manifest.json', dir);
  const entry = manifest.pages.find((p) => p.slug === SLUG);
  entry.sources = entry.sources.filter((file) => file !== ADAPT_SCRIPT);
  save(dir, 'content/manifest.json', manifest);
  assert.throws(() => loadSite(dir), (error) => error instanceof SiteError && /an adaptation page's sources are its rules, the workflow they rewrite, and src\/assets\/adapt\.js/.test(error.problems.join(' | ')));
});
