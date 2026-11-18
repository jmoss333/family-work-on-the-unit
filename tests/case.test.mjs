// The rehearsal, checked against the design brief's own acceptance test:
//   "Trace every branch. Refusal, withdrawal, restricted topics, fear and a solo conversation
//    have valid exits. Two reasonable moves can advance. A privacy miss prompts repair or
//    consultation. No global score or false success."
// A machine can check that the routes EXIST. Whether the words on them are right is the
// faculty and lived-experience review, and no test here stands in for it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { reachable, reviewOrder, validateCase } from '../src/lib/casegraph.mjs';
import { ROOT, built, read } from './helpers.mjs';

const load = () => JSON.parse(readFileSync(join(ROOT, 'cases/rowan-sal.case.json'), 'utf8'));

test('A6 · the case is structurally sound', () => {
  assert.deepEqual(validateCase(load()), []);
});

test('A6 · every position is reachable, and every position has a way to a debrief', () => {
  const c = load();
  const all = Object.keys(c.nodes);
  assert.deepEqual([...reachable(c, c.start)].sort(), [...all].sort());
  assert.deepEqual(reviewOrder(c).sort(), [...all].sort());
  const debriefs = all.filter((id) => c.nodes[id].debrief);
  for (const id of all) assert.ok(debriefs.some((d) => reachable(c, id).has(d)), `${id} cannot reach a debrief`);
});

test('A6 · the five required exits exist: withdrawal, restricted topic, fear, declined meeting, privacy miss', () => {
  const c = load();
  assert.deepEqual(Object.keys(c.exits).sort(), ['declinedMeeting', 'fear', 'privacyMiss', 'restrictedTopic', 'withdrawal']);
  for (const [name, id] of Object.entries(c.exits)) assert.ok(reachable(c, c.start).has(id), `${name} → ${id} is unreachable`);
});

test('A6 · withdrawal is always one press away in a joint conversation, and never offered in a private one', () => {
  const c = load();
  const joint = Object.keys(c.nodes).filter((id) => c.nodes[id].joint);
  assert.ok(joint.length >= 10);
  for (const id of joint) assert.ok(reachable(c, id).has(c.pauseNode));
  // The private routes are private from the first position to the last: a learner who
  // protects a disclosure is never routed back into the room with the other person.
  for (const id of ['risk', 'rethink', 'private', 'debriefPrivate', 'solo', 'soloPress', 'soloAccept', 'debriefSolo']) {
    assert.equal(c.nodes[id].joint, false, `${id} must be a private position`);
  }
});

test('A6 · the fear route never returns to a joint conversation without passing the start', () => {
  const c = load();
  const seen = new Set();
  const stack = ['risk'];
  while (stack.length) {
    const id = stack.pop();
    if (seen.has(id) || id === c.start) continue;
    seen.add(id);
    assert.equal(c.nodes[id].joint, false, `the private safety route reaches the joint position "${id}"`);
    for (const choice of c.nodes[id].choices) stack.push(choice.next);
  }
});

test('A6 · two different moves advance from the comparison, and neither is marked as the answer', () => {
  const c = load();
  const { from, via, to } = c.twoMovesAdvance;
  for (const id of via) {
    assert.ok(c.nodes[from].choices.some((choice) => choice.next === id));
    assert.ok(c.nodes[id].choices.some((choice) => choice.next === to));
  }
  assert.ok(!JSON.stringify(c).match(/"(score|scores|points|grade|pass|fail)"\s*:/));
});

test('A6 · a retry returns to the same position with the same facts', () => {
  const c = load();
  for (const [id, node] of Object.entries(c.nodes)) {
    for (const choice of node.choices) {
      if (/^Retry/.test(choice.label)) assert.ok(c.nodes[choice.next], `${id}: retry target missing`);
    }
  }
  // Positions are static text: there is nothing a second visit could show differently.
  const { dir } = built('review');
  const page = read(dir, 'studio/when-a-friend-answers-first.html');
  const shipped = JSON.parse(page.match(/<script type="application\/json" id="case-data">([\s\S]*?)<\/script>/)[1]);
  for (const [id, node] of Object.entries(c.nodes)) {
    assert.deepEqual(shipped.nodes[id].lines, node.lines, `${id}: shipped lines differ from the case file`);
    assert.deepEqual(shipped.nodes[id].choices, node.choices.map(({ label, next }) => ({ label, next })));
  }
});

test('A6 · the validator refuses the defects it exists to catch', () => {
  const broken = (mutate) => {
    const c = load();
    mutate(c);
    return validateCase(c).join(' | ');
  };
  assert.match(broken((c) => delete c.exits.declinedMeeting), /declinedMeeting is not declared/);
  assert.match(broken((c) => { c.nodes.plan.choices[0].score = 2; }), /carry no scoring/);
  assert.match(broken((c) => { c.nodes.orphan = { title: 'x', joint: false, lines: [{ kind: 'narration', text: 'x' }], choices: [{ label: 'x', next: 'start' }] }; }), /orphan: unreachable/);
  assert.match(broken((c) => { c.nodes.heard.lines[0].speaker = 'Dr. Real Person'; }), /unknown speaker/);
  assert.match(broken((c) => { c.nodes.heard.choices = []; }), /dead end/);
  assert.match(broken((c) => { c.nodes.heard.choices[0].next = 'nowhere'; }), /missing node "nowhere"/);
  assert.match(broken((c) => { c.fictional = false; }), /fictional/);
  assert.match(broken((c) => { c.nodes.private.choices = [{ label: 'loop', next: 'private' }]; }), /no route from here to a debrief/);
});

test('A6 · every position written for the review build is marked, so a reviewer can find them all', () => {
  const c = load();
  const added = Object.keys(c.nodes).filter((id) => c.nodes[id].origin === 'review-build-addition').sort();
  assert.deepEqual(added, ['debriefSolo', 'slip', 'slipRepair', 'solo', 'soloAccept', 'soloPress']);
  const page = read(built('review').dir, 'studio/when-a-friend-answers-first.html');
  assert.equal((page.match(/Added in review build/g) || []).length, added.length);
});

test('paired debriefs retry the spoken moment, and honoring a pause can end the joint practice', () => {
  const { nodes } = load();
  for (const result of ['bounded', 'slipRepair']) {
    const debrief = nodes[result].choices.find(choice => choice.next === 'debriefBoundary');
    assert.ok(debrief, result);
    assert.equal(nodes[debrief.next].choices.find(choice => choice.label.startsWith('Retry')).next, 'boundary');
  }
  assert.equal(nodes.debrief.choices.find(choice => choice.label.startsWith('Retry')).next, 'heard');
  assert.equal(nodes.pause.choices[0].next, 'debriefPause');
  assert.equal(nodes.debriefPause.debrief, true);
  assert.deepEqual(nodes.debriefPause.choices.map(choice => choice.next), ['start']);
  for (const [stop, retry] of [['private','risk'], ['soloAccept','solo']]) {
    const debrief = nodes[nodes[stop].choices[0].next];
    assert.ok(debrief.debrief);
    assert.equal(debrief.choices.find(choice => choice.label.startsWith('Retry')).next, retry);
  }
});
