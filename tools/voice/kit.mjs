// The voice kit, assembled: the instructions a model is given, the screen a brief must pass
// before it is sent, and the check every drafted line gets before a person sees it.
//
// Nothing here talks to a network. tools/voice/draft.mjs does that, through api.mjs.
import { readFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { blobSha } from '../../src/lib/hash.mjs';
import { findProtected } from '../../src/lib/protect.mjs';
import { validateScenes } from '../../src/lib/scenes.mjs';
import { lintSay, lintScope, lintScript, loadRules, plain, refusals, wordsOf } from '../../src/lib/voice.mjs';

export const KIT_FILES = {
  profile: 'voice/profile.md',
  rules: 'voice/rules.json',
  exemplars: 'voice/exemplars.json',
  system: 'voice/prompts/system.md',
  scenes: 'voice/prompts/scenes.md',
  script: 'voice/prompts/script.md',
  scenesSchema: 'voice/schemas/scenes.schema.json',
  scriptSchema: 'voice/schemas/script.schema.json',
};
export const DRAFTS_DIR = 'voice/drafts';
export const MOMENT_WORDS = 80;

const fill = (template, values) =>
  template.replace(/\{\{(\w+)\}\}/g, (whole, key) => {
    if (values[key] === undefined) throw new Error(`a prompt asks for {{${key}}}, which was not given`);
    return String(values[key]);
  });

/**
 * @param {string} root  repository root
 * @param {{exemplars?: string}} [options]  a file of the author's lines to use in place of the
 *        one in the repository (he may keep a fuller one outside it)
 */
export function loadKit(root, { exemplars } = {}) {
  const read = (rel) => readFileSync(isAbsolute(rel) ? rel : join(root, rel), 'utf8');
  const files = { ...KIT_FILES, ...(exemplars ? { exemplars } : {}) };
  const text = Object.fromEntries(Object.entries(files).map(([key, rel]) => [key, read(rel)]));
  const lines = JSON.parse(text.exemplars).lines;
  if (!Array.isArray(lines) || !lines.length || !lines.every((line) => typeof line?.say === 'string' && typeof line?.does === 'string')) throw new Error(`${files.exemplars}: it needs a list of lines, each with what it does and what it says`);
  return {
    root,
    rules: loadRules(root),
    profile: text.profile,
    exemplars: lines,
    prompts: { system: text.system, scenes: text.scenes, script: text.script },
    schemas: { scenes: JSON.parse(text.scenesSchema), script: JSON.parse(text.scriptSchema) },
    // Which kit made a draft: the blob id of each file, as `git hash-object` gives it.
    fingerprint: Object.fromEntries(Object.entries(text).map(([key, value]) => [files[key], blobSha(value)])),
  };
}

const numbersOf = (rules) => ({ ...rules.limits, frames: Object.values(rules.script.frames).join(', ') });
/** The rules as a model is told them: one line each, with their numbers filled in. */
export function rulesText(rules) {
  return rules.rules
    .map((rule) => `- ${rule.level} · ${rule.id}: ${rule.says.replace(/\{(\w+)\}/g, (whole, key) => String((rule.level === 'advise' ? rules.advice : numbersOf(rules))[key] ?? numbersOf(rules)[key] ?? whole))}`)
    .join('\n');
}
export const exemplarsText = (lines) => lines.map((line) => `- [${line.fidelity || 'summarized'}] (${line.does}) “${line.say}”`).join('\n');

export function systemPrompt(kit) {
  // The profile's own first heading and status note are for a human reader of the file.
  return fill(kit.prompts.system, { profile: kit.profile.trim(), rules: rulesText(kit.rules), exemplars: exemplarsText(kit.exemplars) });
}

/** The first line a move card offers: its opening block quote. */
export const cardLine = (card) => (card.sourceText.match(/^> (.+)$/m) || [null, ''])[1].trim();

// ── The screen a brief passes before anything is sent ─────────────────────────────────
// A brief is a sentence or two about invented people. This is a seat belt, not a guarantee:
// it catches the shapes a real record has, and it cannot tell a true story told in new names.
const SHAPES = [
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, 'an email address'],
  [/\(?\b\d{3}\)?[-. ]\d{3}[-. ]\d{4}\b/, 'a phone number'],
  [/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/, 'a date'],
  [/\b(?:19|20)\d{2}\b/, 'a year'],
  [/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.? \d{1,2}\b/i, 'a date'],
  [/\b\d{5,}\b/, 'a long number'],
  [/\b\d{1,3}[- ]?(?:years?[- ]old|yrs?\b|y\/?o\b)/i, 'an age in years'],
  [/\b(?:mrn|dob|ssn|medical record|date of birth)\b/i, 'a record field'],
];

/**
 * @param {object} brief
 * @param {{rules: object}} kit
 * @param {{cards: {slug: string}[], protectedTerms: object, taken?: string[]}} site  the move
 *        cards, the protected list, and names the site's cases already use
 * @returns {string[]} why the brief may not be sent; empty means it may
 */
export function screenBrief(brief, kit, { cards, protectedTerms, taken = [] }) {
  const problems = [];
  const text = (value) => typeof value === 'string' && value.trim().length > 0;
  if (!brief || typeof brief !== 'object') return ['a brief is a JSON object'];
  if (brief.fictional !== true) problems.push('a brief declares "fictional": true. Every person in it is invented; a real conversation is never a brief');
  if (!['scenes', 'script'].includes(brief.task)) problems.push('"task" is "scenes" or "script"');
  const { note, ...sent } = brief;
  const whole = JSON.stringify(sent);
  for (const [shape, what] of SHAPES) if (shape.test(whole.replace(/"format":\s*\d+/, ''))) problems.push(`it carries ${what}. A brief has no dates, ages, numbers or contact details`);
  if (findProtected(whole, protectedTerms).length) problems.push('it carries a name on the protected list (not printed here)');
  const people = (list) => {
    if (!Array.isArray(list) || !list.length || list.length > 3 || !list.every((person) => text(person?.name) && text(person?.role))) problems.push('"people" lists one to three invented people, each with a name and a role');
    else for (const person of list) if (taken.includes(person.name)) problems.push(`“${person.name}” is already a person on the site; give a new scene its own people`);
  };
  const spoken = [];
  if (brief.task === 'scenes') {
    const moves = new Set(cards.map((card) => card.slug));
    if (!Array.isArray(brief.scenes) || !brief.scenes.length) problems.push('"scenes" lists at least one scene to draft');
    const ids = new Set();
    for (const scene of brief.scenes || []) {
      const at = scene?.id || '(a scene with no id)';
      if (!/^[A-Za-z][A-Za-z0-9]*$/.test(scene?.id || '') || ids.has(scene.id)) problems.push(`${at}: each scene has its own plain id`);
      ids.add(scene?.id);
      if (!moves.has(scene?.move)) problems.push(`${at}: "move" is the address of a move card (for example ${[...moves][0]})`);
      people(scene?.people);
      if (!text(scene?.moment)) problems.push(`${at}: "moment" says what has just happened, in a sentence or two`);
      else if (wordsOf(scene.moment).length > MOMENT_WORDS) problems.push(`${at}: the moment runs past ${MOMENT_WORDS} words. A longer brief is usually a case history, and a case history does not belong here`);
      spoken.push(scene?.moment || '', ...((scene?.people || []).map((person) => person?.role || '')));
    }
  }
  if (brief.task === 'script') {
    if (!Object.hasOwn(kit.rules.script.frames, String(brief.format))) problems.push(`"format" is the length of the meeting in minutes: ${Object.keys(kit.rules.script.frames).join(', ')}`);
    people(brief.people);
    if (brief.askedPrivately !== true || !text(brief.scope)) problems.push('a script needs "askedPrivately": true and a "scope": on this site a meeting is planned only after the patient was asked privately, and inside what they agreed to');
    if (!text(brief.purpose)) problems.push('"purpose" says in a sentence what the meeting is for');
    spoken.push(brief.scope || '', brief.purpose || '', ...((brief.people || []).map((person) => person?.role || '')));
  }
  for (const item of lintScope(spoken, kit.rules)) problems.push(`${item.says} (${item.hit})`);
  return problems;
}

// ── What a model is asked ─────────────────────────────────────────────────────────────
export function scenesPrompt(kit, brief, cards) {
  const bySlug = new Map(cards.map((card) => [card.slug, card]));
  const moves = [...new Set(brief.scenes.map((scene) => scene.move))]
    .map((slug) => bySlug.get(slug))
    .map((card) => `- ${card.slug} · Move ${card.order}: ${card.title}. ${card.summary} The card’s own line: ${cardLine(card)}`)
    .join('\n');
  const briefs = JSON.stringify(brief.scenes.map(({ id, move, people, moment }) => ({ id, move, people, moment })), null, 2);
  return fill(kit.prompts.scenes, { ...kit.rules.limits, moves, briefs });
}

export function scriptPrompt(kit, brief) {
  const { format, people, scope, purpose } = brief;
  return fill(kit.prompts.script, { ...kit.rules.limits, format, frames: kit.rules.script.frames[String(format)], brief: JSON.stringify({ format, people, scope, purpose }, null, 2) });
}

// ── What comes back, held to the rules ────────────────────────────────────────────────
/** A drafted scene in the shape the site's deck uses, built from the brief and the answer. */
export function sceneFromModel(drafted, briefScene, deck, origin) {
  const turns = (Array.isArray(drafted?.reply) ? drafted.reply : []).filter((turn) => typeof turn === 'string' && turn.trim());
  const speech = (words) => ({ kind: 'speech', speaker: deck.learnerRole, text: words.trim() });
  const reply = turns.flatMap((turn, index) => (index === 0 ? [speech(turn)] : [{ kind: 'narration', text: deck.pause }, speech(turn)]));
  return {
    id: briefScene.id,
    title: String(drafted?.title || '').trim(),
    move: briefScene.move,
    origin,
    people: briefScene.people.map(({ name, role }) => ({ name, role })),
    lines: (Array.isArray(drafted?.lines) ? drafted.lines : []).map((line) => (String(line?.kind).toLowerCase() === 'speech' ? { kind: 'speech', speaker: line.speaker, text: String(line.text || '').trim() } : { kind: 'narration', text: String(line?.text || '').trim() })),
    reply,
  };
}

/**
 * Check drafted scenes exactly as the build would check them in the deck.
 * @returns {{id: string, scene: object, note: string, refused: string[], advice: {where: string, rule: string, says: string, hit?: string}[]}[]}
 */
export function checkScenes(output, brief, { kit, cards, deck, taken = [], origin }) {
  const drafted = new Map((Array.isArray(output?.scenes) ? output.scenes : []).map((item) => [item?.id, item]));
  return brief.scenes.map((briefScene) => {
    const answer = drafted.get(briefScene.id);
    if (!answer) return { id: briefScene.id, scene: null, note: '', refused: ['the answer has no scene with this id'], advice: [] };
    const scene = sceneFromModel(answer, briefScene, deck, origin);
    const one = { schema: 1, fictional: true, intro: deck.intro, learnerRole: deck.learnerRole, ask: deck.ask, pause: deck.pause, scenes: [scene] };
    const refused = validateScenes(one, { rules: kit.rules, cards, taken }).map((problem) => problem.replace(`${scene.id}: `, ''));
    const advice = scene.reply.filter((line) => line.kind === 'speech').flatMap((line, index) => lintSay(line.text, kit.rules, { reply: true, present: index === 0 ? scene.people.map((person) => person.name) : [] }).filter((item) => item.level === 'advise').map((item) => ({ where: `turn ${index + 1}`, ...item })));
    return { id: scene.id, scene, note: String(answer.note || '').trim(), refused, advice };
  });
}

/** Check a drafted script: its shape, each line, and how much it teaches. */
export function checkScript(output, brief, kit) {
  const script = { format: brief.format, people: brief.people, title: String(output?.title || '').trim(), parts: (Array.isArray(output?.parts) ? output.parts : []).map((part) => ({ part: String(part?.part).toLowerCase(), lines: (Array.isArray(part?.lines) ? part.lines : []).map((line) => ({ to: line?.to, kind: String(line?.kind).toLowerCase(), say: String(line?.say || '').trim() })) })) };
  const findings = lintScript(script, kit.rules);
  return { script, refused: refusals(findings), advice: findings.filter((item) => item.level === 'advise') };
}

/**
 * Where a draft may be written: under voice/drafts/ (which git ignores), or outside the
 * repository. Never into the files the site is built from. A person copies what they keep.
 */
export function draftPath(root, out, name) {
  const target = out ? resolve(out) : join(root, DRAFTS_DIR, name);
  const inside = relative(root, target);
  if (!inside.startsWith('..') && !isAbsolute(inside) && !inside.split(/[\\/]/).join('/').startsWith(`${DRAFTS_DIR}/`)) {
    throw new Error(`a draft is written under ${DRAFTS_DIR}/ or outside the repository, never to ${inside}. Copy what you keep into a deck by hand, after you have edited it`);
  }
  return target;
}

export { plain };
