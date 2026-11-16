// The unit workflow: a step nobody owns, a role with no step, or a measure that checks
// nothing is refused by the build instead of being found on the unit.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { coverage, validateWorkflow } from '../src/lib/workflow.mjs';
import { ROOT, built, ids, read, visibleText } from './helpers.mjs';

const load = () => JSON.parse(readFileSync(join(ROOT, 'workflows/unit-family-meeting.workflow.json'), 'utf8'));
const workflow = load();
const SLUG = 'system/unit-workflow';

test('A15 · the workflow is structurally sound', () => {
  assert.deepEqual(validateWorkflow(workflow), []);
});

test('A15 · every step has an owner, a trigger and a completion test, and every role in scope has a step', () => {
  assert.equal(workflow.steps.length, 8);
  const working = new Set();
  for (const step of workflow.steps) {
    assert.ok(step.owner.length >= 1, `${step.id}: nobody owns it`);
    assert.ok(step.trigger && step.doneWhen && step.ownerLabel, `${step.id}: incomplete`);
    for (const role of [...step.owner, ...(step.support || [])]) working.add(role);
  }
  assert.deepEqual([...working].sort(), Object.keys(workflow.roles).sort());
});

test('A15 · every proposed measure checks a step that exists, and the steps no measure watches are known', () => {
  const { watched, unwatched } = coverage(workflow);
  assert.deepEqual(watched, ['ask', 'book', 'meet', 'bridge']);
  // Recorded, not hidden: four steps have no measure. If that changes, this line says so.
  assert.deepEqual(unwatched, ['invite', 'rounds', 'bring-up', 'note']);
});

test('A15 · the validator refuses the defects it exists to catch', () => {
  const broken = (edit) => {
    const copy = load();
    edit(copy);
    return validateWorkflow(copy).join(' | ');
  };
  assert.match(broken((w) => { w.steps[4].owner = []; }), /step 5 \(bring-up\): nobody owns it/);
  assert.match(broken((w) => { w.steps[1].owner = ['pharmacy']; }), /unknown role "pharmacy"/);
  assert.match(broken((w) => { w.roles.chaplain = 'Chaplain'; }), /role "chaplain" is in scope but owns and supports no step/);
  assert.match(broken((w) => { delete w.steps[2].doneWhen; }), /step 3 \(book\): "doneWhen" is required/);
  assert.match(broken((w) => { w.steps[0].record = ''; }), /"record" is where it is written, or null/);
  assert.match(broken((w) => { w.measures.list[0].checksStep = 'admit'; }), /checks step "admit", which does not exist/);
  assert.match(broken((w) => { w.steps[3].id = 'ask'; }), /duplicate id/);
  assert.match(broken((w) => { w.additions = []; }), /note "sleep-figure" is not listed under "additions"/);
  assert.match(broken((w) => { w.exceptions[0].then = ''; }), /exception 1: needs "when" and "then"/);
});

test('A15 · the page shows each step with its owner, its record and its completion test, and each measure links to its step', () => {
  const html = read(built('review').dir, `${SLUG}.html`);
  const text = visibleText(html);
  const have = new Set(ids(html));
  workflow.steps.forEach((step, index) => {
    assert.ok(have.has(`step-${step.id}`), `no anchor for step ${step.id}`);
    for (const field of [step.title, step.ownerLabel, step.trigger, step.action, step.doneWhen]) assert.ok(text.includes(field), `step ${index + 1}: “${field.slice(0, 40)}” is not on the page`);
    if (step.record) assert.ok(text.includes(step.record), `step ${index + 1}: its record is not on the page`);
  });
  for (const part of [workflow.purpose, workflow.scope, workflow.principle, workflow.basis, workflow.closing, workflow.formats.decisionRule, workflow.formats.noJointMeeting, workflow.measures.cadence, workflow.measures.baseline]) {
    assert.ok(text.includes(part), `“${part.slice(0, 40)}” is not on the page`);
  }
  for (const line of workflow.guardrails) assert.ok(text.includes(line), `guardrail missing: ${line.slice(0, 40)}`);
  for (const exception of workflow.exceptions) assert.ok(text.includes(exception.when) && text.includes(exception.then), `exception missing: ${exception.when}`);
  for (const measure of workflow.measures.list) assert.ok(html.includes(`<td>${measure.name.replace(/&/g, '&amp;')}</td><td><a href="#step-${measure.checksStep}">`), `measure not linked to its step: ${measure.name}`);
  assert.equal((html.match(/class="wf-step rc-card"/g) || []).length, workflow.steps.length);
});

test('A15 · sentences that are not in the source procedure are listed, and marked while the page is in review', () => {
  const review = read(built('review').dir, `${SLUG}.html`);
  assert.equal(workflow.additions.length, 2);
  for (const note of workflow.additions) assert.ok(visibleText(review).includes(note.text), `addition not shown: ${note.id}`);
  assert.equal((review.match(/Added in adaptation/g) || []).length, workflow.additions.length);
});

test('A15 · the format names and the decision rule agree between the workflow and the formats page', () => {
  const formats = readFileSync(join(ROOT, 'content/pages/formats-time-format-stance.md'), 'utf8');
  for (const format of workflow.formats.menu) assert.ok(formats.includes(`| ${format.name} |`), `the formats page does not name “${format.name}”`);
  const rule = workflow.formats.decisionRule.split('.')[0];
  assert.equal(rule, 'the lowest-burden format that matches current acuity');
  assert.ok(formats.includes(rule), 'the formats page states a different decision rule');
  const sleep = workflow.additions.find((note) => note.id === 'sleep-figure').text;
  assert.ok(formats.includes(sleep), 'the sleep-figure caveat differs between the two pages');
});

test('A15 · the five parts named in step 6 are the five parts mapped to move cards', () => {
  const action = workflow.steps.find((step) => step.id === 'meet').action;
  const parts = action.match(/five parts: (.+?)\. Stance/)[1].split(' · ');
  assert.deepEqual(parts, ['join each person', 'hear each experience', 'work on one exchange', 'agree what to try', 'close and review']);
  const spine = readFileSync(join(ROOT, 'content/pages/start-one-spine.md'), 'utf8').toLowerCase();
  const formats = readFileSync(join(ROOT, 'content/pages/formats-time-format-stance.md'), 'utf8').toLowerCase();
  for (const part of parts) {
    assert.ok(spine.includes(`| ${part} |`), `“${part}” has no row in the crosswalk`);
    assert.ok(formats.includes(part), `“${part}” is not on the formats page`);
  }
  assert.ok(ids(read(built('review').dir, 'start/one-spine.html')).includes('the-five-parts-of-a-meeting'));
});

test('A15 · with nothing attested, the public build carries no trace of the workflow', () => {
  const { dir, report } = built('public');
  assert.equal(report.pages.find((page) => page.slug === SLUG).shipped, false);
  const home = visibleText(read(dir, 'index.html'));
  assert.ok(!home.includes('Unit workflow') && !home.includes('Build the system'));
});
