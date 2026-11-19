// Who's in the room, and the turn strip (2026-11-18). Two pictures drawn from the case: the
// rehearsal's room diagram and the observer page's turn strip. Neither adds a sentence. These
// tests hold each picture to the words it stands beside.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { observerVersions, turnLength, turnPerson } from '../src/lib/observer.mjs';
import { ROOM_LABEL, roomRule, roomSeats, roomState } from '../src/lib/studio.mjs';
import { ROOT, built, read } from './helpers.mjs';

const caseFile = JSON.parse(readFileSync(join(ROOT, 'cases/rowan-sal.case.json'), 'utf8'));
const studioHtml = () => read(built('review').dir, 'studio/when-a-friend-answers-first.html');
const observerHtml = () => read(built('review').dir, 'teach/observer-card.html');
const site = readFileSync(join(ROOT, 'src/assets/site.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const script = readFileSync(join(ROOT, 'src/assets/studio.js'), 'utf8');
const unescape = (text) => text.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

test('A25 · the room lists one seat for each person in the case, the learner and the supervisor, under a label the page already carries', () => {
  const html = studioHtml();
  const list = html.match(/<ul class="room" aria-label="([^"]*)">([\s\S]*?)<\/ul>/);
  assert.ok(list, 'the rehearsal has a room');
  assert.equal(unescape(list[1]), ROOM_LABEL);
  assert.ok(html.includes(`<h3>${ROOM_LABEL}</h3>`), 'the label is the aside’s own heading, not a new sentence');
  const seats = [...list[2].matchAll(/<li class="room__seat" data-seat="([^"]+)">([^<]+)<\/li>/g)].map(([, seat, name]) => ({ seat, name: unescape(name) }));
  assert.deepEqual(seats, roomSeats(caseFile));
  assert.deepEqual(seats.map((s) => s.name), [...caseFile.people.map((p) => p.name), caseFile.learnerRole, 'Supervisor']);
});

test('A25 · the room never shows a speaker away, and keeps the person invited to the joint meeting out of private positions', () => {
  // The rule travels in the page's data block; the script reads it from there.
  const data = JSON.parse(studioHtml().match(/<script type="application\/json" id="case-data">([\s\S]*?)<\/script>/)[1]);
  assert.deepEqual(data.room, roomRule(caseFile));
  const nameOf = Object.fromEntries(roomSeats(caseFile).map(({ seat, name }) => [seat, name]));
  const states = new Set();
  for (const [id, node] of Object.entries(data.nodes)) {
    const state = roomState(node);
    states.add(state);
    const present = data.room[state].map((seat) => nameOf[seat]);
    for (const line of node.lines.filter((l) => l.kind === 'speech')) {
      assert.ok(present.includes(line.speaker), `${id} (${state}): ${line.speaker} speaks but the room shows them away`);
    }
  }
  assert.deepEqual([...states].sort(), ['debrief', 'joint', 'private']);
  assert.ok(!data.room.joint.includes('supervisor') && !data.room.private.includes('supervisor'), 'the supervisor watches the fiction from outside');
  assert.ok(data.room.debrief.includes('supervisor') && data.room.debrief.includes('learner'));
  for (const person of ['person-1', 'person-2']) assert.ok(data.room.joint.includes(person));
  // A position the case does not mark as joint is the patient alone with the resident: the
  // person invited to the joint meeting is not seated there.
  assert.deepEqual(data.room.private, ['person-1', 'learner']);
});

test('A25 · the script sets the room at every position, at the hand-back and at the end, from the page’s own rule', () => {
  assert.match(script, /room\(node\.debrief \? 'debrief' : node\.joint \? 'joint' : 'private'\)/);
  assert.equal((script.match(/room\('debrief'\);/g) || []).length, 2, 'the supervisor’s hand-back and the finish');
  assert.match(script, /data\.room\[state\]\.includes\(seat\.dataset\.seat\)/);
  assert.match(script, /setAttribute\('aria-hidden'/);
  // roomState() in the build and the expression in the script agree on every position.
  for (const node of Object.values(caseFile.nodes)) {
    assert.equal(roomState(node), node.debrief ? 'debrief' : node.joint ? 'joint' : 'private');
  }
});

test('A25 · without the script, and on paper, the room is not shown', () => {
  assert.match(site, /(?:^|\n)\.room \{ display: none; \}/, 'hidden by default, outside any media query');
  assert.match(site, /\[data-studio\]\[data-room\] \.room \{/, 'shown only once the script has set the room');
  assert.ok(!/data-room=/.test(studioHtml()), 'the page as built carries no room state');
});

test('A25 · each mark on the turn strip is its turn: the speaker and the length the transcript gives it', () => {
  const html = observerHtml();
  for (const { id, turns } of observerVersions(caseFile)) {
    const section = html.match(new RegExp(`<section data-version="${id}"[^>]*>([\\s\\S]*?)</section>`))[1];
    const marks = [...section.matchAll(/<button class="observer-turn" type="button" data-turn="(\d+)" data-person="([^"]+)" data-length="(\d+)" aria-label="([^"]+)"/g)];
    assert.deepEqual(
      marks.map(([, turn, person, length]) => [Number(turn), person, Number(length)]),
      turns.map((t, i) => [i, turnPerson(t.speaker, caseFile), turnLength(t.text)]),
      `${id}: the strip and the transcript disagree`,
    );
    for (const [, , person, length] of marks) {
      assert.ok(['1', '2', 'learner'].includes(person));
      assert.ok(Number(length) >= 1 && Number(length) <= 8);
      assert.ok(site.includes(`.observer-turn[data-length="${length}"]::after`), `no width for length ${length}`);
    }
  }
  assert.ok(site.includes('.observer-turn[data-person="2"]::after') && site.includes('.observer-turn[data-person="learner"]::after'));
});
