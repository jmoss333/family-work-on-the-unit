#!/usr/bin/env node
/**
 * One-time intake: convert the Astra single-file prototype (Rowan_Sal_Rehearsal.html) into
 * the versioned case file the studio engine reads, WITHOUT retyping its dialogue.
 *
 *   node tools/intake_case_from_prototype.mjs path/to/Rowan_Sal_Rehearsal.html cases/rowan-sal.case.json
 *
 * Not part of the site build. The prototype's `scene` object is a plain data literal (it
 * was read in full before this script was written); it is evaluated in an empty VM context
 * with a timeout, and nothing else from the prototype is executed.
 *
 * Node ids are the prototype's own keys and are STABLE: never rename one once a case has
 * been reviewed, because the ids are what a branch-by-branch review refers to.
 *
 * ADDITIONS below are the only text not written by the prototype's author. They exist
 * because the brief's own acceptance test ("Refusal, withdrawal, restricted topics, fear and
 * a solo conversation have valid exits ... A privacy miss prompts repair or consultation")
 * was not met by the prototype: it had no route where the meeting is declined before it
 * starts, and no route where a privacy slip actually happens. Each added node is marked
 * `"origin": "review-build-addition"` so a reviewer can find all of them in one search.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';

const [, , htmlPath, outPath] = process.argv;
if (!htmlPath || !outPath) {
  console.error('usage: intake_case_from_prototype.mjs <prototype.html> <out.case.json>');
  process.exit(2);
}
const html = readFileSync(htmlPath, 'utf8');

const sceneMatch = html.match(/const scene = (\{[\s\S]*?\n\});/);
const jointMatch = html.match(/const joint = new Set\((\[[^\]]*\])\)/);
if (!sceneMatch || !jointMatch) throw new Error('prototype shape changed: scene/joint not found');
const scene = vm.runInNewContext(`(${sceneMatch[1]})`, Object.create(null), { timeout: 1000 });
const joint = new Set(vm.runInNewContext(`(${jointMatch[1]})`, Object.create(null), { timeout: 1000 }));

const text = (re) => {
  const m = html.match(re);
  if (!m) throw new Error(`prototype shape changed: ${re}`);
  return m[1].replace(/<[^>]+>/g, '').trim();
};
const observer = {
  listenFor: text(/<h3>What to listen for<\/h3><p>(.*?)<\/p>/),
  prompts: [...html.match(/<summary>Supervisor prompts<\/summary><ul>(.*?)<\/ul>/)[1].matchAll(/<li>(.*?)<\/li>/g)].map((m) => m[1]),
  room: text(/<summary>Who’s in the room\?<\/summary><p>(.*?)<\/p>/),
};
const intro = text(/<p class="intro">(.*?)<\/p>/);
const title = text(/<h1>(.*?)<\/h1>/);

const DEBRIEFS = new Set(['debrief', 'debriefPrivate']);
const nodes = {};
for (const [id, [nodeTitle, lines, options]] of Object.entries(scene)) {
  nodes[id] = {
    title: nodeTitle,
    joint: joint.has(id),
    ...(DEBRIEFS.has(id) ? { debrief: true } : {}),
    origin: 'astra-prototype',
    lines: lines.map((line) =>
      Array.isArray(line) ? { kind: 'speech', speaker: line[0], text: line[1] } : { kind: 'narration', text: line },
    ),
    choices: options.map(([label, next]) => ({ label, next })),
  };
}

// ── ADDITIONS (review-build-addition) ───────────────────────────────────────────────
const added = (node) => ({ ...node, origin: 'review-build-addition' });

// 1. The meeting is declined before it starts.
nodes.start.choices.push({ label: 'Rowan has second thoughts before the meeting', next: 'solo', origin: 'review-build-addition' });
nodes.solo = added({
  title: 'Rowan changes course before the meeting',
  joint: false,
  lines: [
    { kind: 'speech', speaker: 'Rowan', text: 'I thought I wanted Sal here. I don’t. Not this week.' },
    { kind: 'narration', text: 'Sal has already agreed to come. Say your next line aloud before choosing a direction.' },
  ],
  choices: [
    { label: 'Accept the decision and ask what Rowan wants Sal told', next: 'soloAccept' },
    { label: 'Explain how much Sal’s involvement would help', next: 'soloPress' },
  ],
});
nodes.soloPress = added({
  title: 'The invitation became pressure',
  joint: false,
  lines: [
    { kind: 'speech', speaker: 'Resident', text: 'It would really help your discharge plan if Sal were part of this.' },
    { kind: 'speech', speaker: 'Rowan', text: 'So I don’t actually get to say no.' },
    { kind: 'narration', text: 'Involvement is negotiable. Repair the moment with one sentence that hands the decision back to Rowan.' },
  ],
  choices: [{ label: 'Retry the private check-in', next: 'solo' }],
});
nodes.soloAccept = added({
  title: 'A declined meeting is a completed conversation',
  joint: false,
  lines: [
    { kind: 'speech', speaker: 'Resident', text: 'That’s your call, and it can change. What would you like me to tell Sal, and what should I leave out?' },
    { kind: 'speech', speaker: 'Rowan', text: 'Just that today doesn’t work. Nothing else.' },
    { kind: 'narration', text: 'No joint meeting happens. The resident tells Sal only that, gives no reason, lets the supervising clinician know and leaves the invitation open. Honoring the decision completes this route.' },
  ],
  choices: [{ label: 'Debrief the declined meeting', next: 'debriefSolo' }],
});
nodes.debriefSolo = added({
  title: 'Review the declined meeting',
  joint: false,
  debrief: true,
  lines: [
    { kind: 'narration', text: 'What did the resident say that left the decision with Rowan? Did Rowan choose what Sal would be told? The supervisor quotes one line and offers one specific change.' },
  ],
  choices: [
    { label: 'Retry the private check-in', next: 'solo' },
    { label: 'Restart the rehearsal', next: 'start' },
  ],
});

// 2. A privacy slip actually happens, and is repaired.
nodes.boundary.choices = [
  { label: 'My answer stayed on the agreed topic', next: 'bounded', origin: 'review-build-addition' },
  { label: 'My answer said something about medication', next: 'slip', origin: 'review-build-addition' },
];
nodes.slip = added({
  title: 'A detail got out',
  joint: true,
  lines: [
    { kind: 'speech', speaker: 'Resident', text: 'It’s nothing new. The same medication as before.' },
    { kind: 'narration', text: 'Rowan looks at the floor. The answer confirmed part of Rowan’s treatment, which Rowan had kept out of this conversation. Stop adding detail. Say what you would do next, in the room and after it.' },
  ],
  choices: [{ label: 'Compare a possible repair', next: 'slipRepair' }],
});
nodes.slipRepair = added({
  title: 'Stop, own it, repair in private',
  joint: true,
  lines: [
    { kind: 'speech', speaker: 'Resident', text: 'That was mine to keep out, and I didn’t. I’m going to stop there. We agreed to talk about visits today.' },
    { kind: 'narration', text: 'The resident owns the slip without asking Rowan to explain the boundary in front of Sal. Afterward the resident acknowledges privately to Rowan what was disclosed and involves the supervising clinician and the privacy process. Rowan decides whether the joint conversation continues.' },
  ],
  choices: [
    { label: 'Debrief together', next: 'debrief' },
    { label: 'Retry Sal’s question', next: 'boundary' },
  ],
});

const caseFile = {
  schema: 1,
  id: 'rowan-sal',
  version: '0.2.0',
  title,
  fictional: true,
  intro,
  learnerRole: 'Resident',
  people: [
    { name: 'Rowan', role: 'An adult receiving inpatient care' },
    { name: 'Sal', role: 'A longtime friend Rowan chose' },
  ],
  start: 'start',
  pauseNode: 'pause',
  observer,
  // The exits the brief's own acceptance test requires. The build refuses a case in which
  // any of these is missing or unreachable.
  exits: {
    withdrawal: 'pause',
    restrictedTopic: 'bounded',
    fear: 'private',
    declinedMeeting: 'soloAccept',
    privacyMiss: 'slipRepair',
  },
  // "Two reasonable moves can advance": both of these lead on, and neither is the right answer.
  twoMovesAdvance: { from: 'choices', via: ['direct', 'relay'], to: 'heard' },
  nodes,
};
writeFileSync(outPath, JSON.stringify(caseFile, null, 2) + '\n');
console.log(`wrote ${outPath}: ${Object.keys(nodes).length} nodes (${Object.values(nodes).filter((n) => n.origin !== 'astra-prototype').length} added)`);
