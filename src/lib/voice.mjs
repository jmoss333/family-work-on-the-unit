// The voice: what a line must and must not do to be offered as the author's.
//
// voice/rules.json states the rules; this file applies them. The build uses it to refuse a
// scene whose model line breaks a rule, the tests hold the rules to their own examples, and
// the drafting tool (tools/voice) runs every line a model proposes through it before a person
// sees the draft. Nothing here writes a word on a page.
//
// A rule either refuses a line or advises on it. What no rule can say is whether a line is
// clinically right, kind, or his. That is the faculty review.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const RULES_FILE = 'voice/rules.json';

const LEVELS = ['refuse', 'advise'];
const SCOPES = ['say', 'reply', 'scene', 'script'];
// Every rule this file knows how to apply. loadRules() refuses a rules file that declares a
// rule not listed here, or leaves one out, so the file and the code cannot drift apart.
const IMPLEMENTED = [
  'turn-length', 'sentence-length', 'no-why', 'no-verdict', 'no-label', 'no-promise', 'no-pressure', 'no-jargon', 'no-figures',
  'hands-back', 'names-someone', 'out-of-scope', 'one-frame', 'asks-in-every-part',
  'long-turn', 'written-not-spoken', 'clinic-words', 'yes-but',
];
const PHRASE_LISTS = ['verdict', 'label', 'promise', 'pressure', 'jargon', 'clinicWords', 'uncontracted', 'outOfScope'];
const LIMITS = ['turnWords', 'turnSentences', 'sentenceWords', 'sceneSetupLines', 'sceneSetupWords', 'sceneReplyTurns', 'partLines'];

/** @returns {string[]} what is wrong with a rules file; empty means it can be used. */
export function checkRules(rules) {
  const errors = [];
  if (rules?.schema !== 1) errors.push('schema must be 1');
  for (const key of LIMITS) if (!Number.isInteger(rules?.limits?.[key]) || rules.limits[key] < 1) errors.push(`limits.${key} must be a whole number`);
  for (const key of ['turnWords', 'sentenceWords']) {
    if (!Number.isInteger(rules?.advice?.[key])) errors.push(`advice.${key} must be a whole number`);
    else if (rules.advice[key] > rules.limits?.[key]) errors.push(`advice.${key} is above the limit it warns of`);
  }
  const declared = (rules?.rules || []).map((rule) => rule.id);
  for (const rule of rules?.rules || []) {
    if (!LEVELS.includes(rule.level)) errors.push(`rule ${rule.id}: level must be one of ${LEVELS.join(', ')}`);
    if (!SCOPES.includes(rule.on)) errors.push(`rule ${rule.id}: "on" must be one of ${SCOPES.join(', ')}`);
    if (typeof rule.says !== 'string' || !rule.says.trim()) errors.push(`rule ${rule.id}: needs a sentence saying what it asks`);
    if (!IMPLEMENTED.includes(rule.id)) errors.push(`rule ${rule.id}: nothing applies a rule of that name`);
  }
  if (new Set(declared).size !== declared.length) errors.push('a rule is declared twice');
  for (const id of IMPLEMENTED) if (!declared.includes(id)) errors.push(`rule ${id} is applied but not declared`);
  for (const list of PHRASE_LISTS) {
    const phrases = rules?.phrases?.[list];
    if (!Array.isArray(phrases) || !phrases.length) errors.push(`phrases.${list} is empty`);
    else for (const phrase of phrases) if (typeof phrase !== 'string' || phrase !== phrase.toLowerCase().trim() || !/[a-z]/.test(phrase)) errors.push(`phrases.${list}: “${phrase}” must be lower case, trimmed text`);
  }
  const script = rules?.script || {};
  if (!Array.isArray(script.parts) || script.parts.length < 2) errors.push('script.parts lists the parts of a meeting, in order');
  if (!Array.isArray(script.kinds) || !script.kinds.includes('ask') || !script.kinds.includes('frame')) errors.push('script.kinds must include "ask" and "frame"');
  if (!script.frames || !Object.keys(script.frames).length || !Object.values(script.frames).every((n) => Number.isInteger(n) && n >= 0)) errors.push('script.frames gives a number of ideas for each length of meeting');
  return errors;
}

/** Read and check voice/rules.json. Throws on a file it cannot use. */
export function loadRules(root) {
  const rules = JSON.parse(readFileSync(join(root, RULES_FILE), 'utf8'));
  const errors = checkRules(rules);
  if (errors.length) throw new Error(`${RULES_FILE}: ${errors.join('; ')}`);
  return rules;
}

// ── Reading a line ────────────────────────────────────────────────────────────────────
/** Lower case, straight quotes, single spaces. Words are not touched. */
export const plain = (text) => String(text).toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[‐‑–—]/g, '-').replace(/\s+/g, ' ').trim();
/** The words of a line: runs of letters and digits, with their apostrophes and hyphens. */
export const wordsOf = (text) => plain(text).match(/[a-z0-9]+(?:['-][a-z0-9]+)*/g) || [];
/** The sentences of a line, each with its closing mark. A line with no mark is one sentence. */
export const sentencesOf = (text) => (String(text).trim().match(/[^.?!…]+(?:[.?!…]+["”’')\]]*|$)/g) || []).map((s) => s.trim()).filter((s) => /[\p{L}\p{N}]/u.test(s));
const isQuestion = (sentence) => /\?["”’')\]]*$/.test(sentence.trim());

const compiled = new Map();
/** The words in the text that are this phrase, whole, or null. A trailing * stands for any ending. */
function held(text, phrase) {
  if (!compiled.has(phrase)) {
    const open = phrase.endsWith('*');
    const core = (open ? phrase.slice(0, -1) : phrase).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
    compiled.set(phrase, new RegExp(`(?<![a-z0-9'])${core}${open ? "[a-z0-9']*" : "(?![a-z0-9'])"}`));
  }
  return compiled.get(phrase).exec(text)?.[0] ?? null;
}
/** What the text says that is on the list: the words as they stand, each once. */
const found = (text, list) => [...new Set(list.map((phrase) => held(text, phrase)).filter(Boolean))];

const fill = (says, numbers) => says.replace(/\{(\w+)\}/g, (whole, key) => (numbers[key] !== undefined ? String(numbers[key]) : whole));

/** One finding: which rule, whether it refuses, the rule's own sentence, and what set it off. */
function finding(rules, id, numbers = {}, hit = '') {
  const rule = rules.rules.find((item) => item.id === id);
  return { rule: id, level: rule.level, says: fill(rule.says, numbers), ...(hit ? { hit } : {}) };
}

/**
 * Hold one spoken turn to the rules.
 * @param {string} text  the words of the turn, without its speaker
 * @param {object} rules  from loadRules()
 * @param {{reply?: boolean, present?: string[]}} [where]  reply: the turn is a model line a
 *        learner compares their own with; present: the names of the people in the room
 * @returns {{rule: string, level: 'refuse'|'advise', says: string, hit?: string}[]}
 */
export function lintSay(text, rules, { reply = false, present = [] } = {}) {
  const out = [];
  const flat = plain(text);
  const sentences = sentencesOf(text);
  const count = wordsOf(text).length;
  const longest = Math.max(0, ...sentences.map((sentence) => wordsOf(sentence).length));
  const { limits, advice, phrases } = rules;

  if (count > limits.turnWords || sentences.length > limits.turnSentences) out.push(finding(rules, 'turn-length', limits, `${count} words, ${sentences.length} sentences`));
  if (longest > limits.sentenceWords) out.push(finding(rules, 'sentence-length', limits, `${longest} words`));
  const why = sentences.find((sentence) => isQuestion(sentence) && wordsOf(sentence).includes('why'));
  if (why) out.push(finding(rules, 'no-why', {}, why));
  for (const [id, list] of [['no-verdict', 'verdict'], ['no-label', 'label'], ['no-promise', 'promise'], ['no-pressure', 'pressure'], ['no-jargon', 'jargon']]) {
    const hits = found(flat, phrases[list]);
    if (hits.length) out.push(finding(rules, id, {}, hits.join(', ')));
  }
  const figure = flat.match(/\d+|%|(?<![a-z])(?:mg|mcg|percent)(?![a-z])/);
  if (figure) out.push(finding(rules, 'no-figures', {}, figure[0]));

  if (reply) {
    if (!sentences.length || !isQuestion(sentences.at(-1))) out.push(finding(rules, 'hands-back'));
    if (present.length > 1 && !present.some((name) => new RegExp(`(?<![\\p{L}\\p{N}])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'u').test(text))) out.push(finding(rules, 'names-someone'));
  }

  const refusedForLength = out.some((item) => item.rule === 'turn-length' || item.rule === 'sentence-length');
  if (!refusedForLength && (count > advice.turnWords || longest > advice.sentenceWords)) out.push(finding(rules, 'long-turn', advice, `${count} words, longest sentence ${longest}`));
  const stiff = found(flat, phrases.uncontracted);
  if (stiff.length) out.push(finding(rules, 'written-not-spoken', {}, stiff.join(', ')));
  const clinic = found(flat, phrases.clinicWords);
  if (clinic.length) out.push(finding(rules, 'clinic-words', {}, clinic.join(', ')));
  if (/(?<![a-z])(?:i hear you|i understand|i get that|i know)(?![a-z])[^.?!]*(?<![a-z])but(?![a-z])/.test(flat)) out.push(finding(rules, 'yes-but'));
  return out;
}

/** What a short scene may not touch, looked for in every word of it. */
export function lintScope(texts, rules) {
  const hits = found(plain(texts.join(' \n ')), rules.phrases.outOfScope);
  return hits.length ? [finding(rules, 'out-of-scope', {}, hits.join(', '))] : [];
}

/**
 * Hold a meeting script to the rules: its shape, every spoken line, and how much it teaches.
 * @param {{format: number, people: {name: string}[], parts: {part: string, lines: {to: string, kind: string, say: string}[]}[]}} script
 * @returns {{at: string, rule: string, level: string, says: string, hit?: string}[]}
 */
export function lintScript(script, rules) {
  const out = [];
  const { parts, kinds, frames } = rules.script;
  const shape = (says) => out.push({ at: 'script', rule: 'shape', level: 'refuse', says });
  if (!Object.hasOwn(frames, String(script?.format))) shape(`"format" is one of ${Object.keys(frames).join(', ')} minutes`);
  const names = (script?.people || []).map((person) => person?.name).filter((name) => typeof name === 'string' && name.trim());
  if (!names.length) shape('a script names the people in the room');
  const given = (script?.parts || []).map((item) => item?.part);
  if (given.join(' ') !== parts.join(' ')) shape(`the parts are ${parts.join(', ')}, in that order`);
  if (out.length) return out;

  let taught = 0;
  for (const { part, lines } of script.parts) {
    if (!Array.isArray(lines) || !lines.length || lines.length > rules.limits.partLines) {
      out.push({ at: part, rule: 'shape', level: 'refuse', says: `a part holds one to ${rules.limits.partLines} lines` });
      continue;
    }
    lines.forEach((line, index) => {
      const at = `${part} ${index + 1}`;
      if (!kinds.includes(line?.kind)) out.push({ at, rule: 'shape', level: 'refuse', says: `"kind" is one of ${kinds.join(', ')}` });
      if (line?.to !== 'everyone' && !names.includes(line?.to)) out.push({ at, rule: 'shape', level: 'refuse', says: '"to" is one of the people in the room, or "everyone"' });
      if (typeof line?.say !== 'string' || !line.say.trim()) out.push({ at, rule: 'shape', level: 'refuse', says: 'a line has words' });
      else {
        for (const item of lintSay(line.say, rules)) out.push({ at, ...item });
        if (line.kind === 'ask' && !sentencesOf(line.say).some(isQuestion)) out.push({ at, rule: 'shape', level: 'refuse', says: 'a line of kind "ask" holds a question' });
      }
    });
    const inPart = lines.filter((line) => line?.kind === 'frame').length;
    taught += inPart;
    if (inPart > 1) out.push({ at: part, ...finding(rules, 'one-frame', { frames: frames[String(script.format)] }, `${inPart} in this part`) });
    if (!lines.some((line) => line?.kind === 'ask')) out.push({ at: part, ...finding(rules, 'asks-in-every-part') });
  }
  if (taught > frames[String(script.format)]) out.push({ at: 'script', ...finding(rules, 'one-frame', { frames: frames[String(script.format)] }, `${taught} in ${script.format} minutes`) });
  return out;
}

export const refusals = (findings) => findings.filter((item) => item.level === 'refuse');
