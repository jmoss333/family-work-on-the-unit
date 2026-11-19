// The voice kit (2026-11-18): written rules for what may be offered as the author's line, a
// checker that applies them, and a drafting tool that asks a model for candidates and holds
// every one to the rules before a person sees it.
//
// What has to hold:
//   - each rule catches the fault it names and leaves a clean line alone;
//   - the rules agree with the lines the site already carries and with the author's own;
//   - a brief that looks like a record is stopped before anything is sent;
//   - the request is the one the API reference describes, and nothing prints the key;
//   - the site itself calls no model. No test here uses a network: sending is exercised
//     with a transport the test supplies.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startHash, termHash } from '../src/lib/protect.mjs';
import { checkRules, lintSay, lintScope, lintScript, loadRules, refusals, sentencesOf, wordsOf } from '../src/lib/voice.mjs';
import { API_URL, API_VERSION, ApiError, DEFAULT_MODEL, buildRequest, readStructured, requestHeaders, send } from '../tools/voice/api.mjs';
import { assemble, context, prepare, report } from '../tools/voice/draft.mjs';
import { DRAFTS_DIR, MOMENT_WORDS, draftPath, loadKit, rulesText, screenBrief, systemPrompt } from '../tools/voice/kit.mjs';
import { siteLines } from '../tools/voice/lint.mjs';
import { ROOT } from './helpers.mjs';

const json = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
const rules = loadRules(ROOT);
const ids = (findings) => findings.map((item) => item.rule);
const refused = (text, where) => ids(refusals(lintSay(text, rules, where)));
const advised = (text, where) => ids(lintSay(text, rules, where).filter((item) => item.level === 'advise'));
const clone = (value) => JSON.parse(JSON.stringify(value));

test('A26 · the rules file is usable, and declares exactly the rules the checker applies', () => {
  assert.deepEqual(checkRules(rules), []);
  const broken = (change) => {
    const copy = clone(rules);
    change(copy);
    return checkRules(copy).join(' | ');
  };
  assert.match(broken((r) => r.rules.pop()), /rule yes-but is applied but not declared/);
  assert.match(broken((r) => r.rules.push({ id: 'be-nice', level: 'refuse', on: 'say', says: 'Be nice.' })), /rule be-nice: nothing applies a rule of that name/);
  assert.match(broken((r) => { r.rules[0].level = 'warn'; }), /level must be one of refuse, advise/);
  assert.match(broken((r) => { r.advice.turnWords = r.limits.turnWords + 1; }), /advice\.turnWords is above the limit it warns of/);
  assert.match(broken((r) => { r.phrases.label.push('Toxic '); }), /must be lower case, trimmed text/);
  assert.match(broken((r) => { r.phrases.jargon = []; }), /phrases\.jargon is empty/);
  assert.match(broken((r) => { delete r.script.frames; }), /script\.frames/);
  // Every rule says what it asks in a sentence a model and a person can both read.
  for (const rule of rules.rules) assert.ok(rule.says.length > 20 && /[.]$/.test(rule.says), `${rule.id}: no sentence`);
});

test('A26 · a line is read as words and sentences the way a listener would count them', () => {
  assert.deepEqual(wordsOf('“It’s Ari’s call — isn’t it?”'), ["it's", "ari's", 'call', "isn't", 'it']);
  assert.deepEqual(sentencesOf('Thank you. What would help? “Is that right?”'), ['Thank you.', 'What would help?', '“Is that right?”']);
  assert.deepEqual(sentencesOf('No closing mark'), ['No closing mark']);
});

const CLEAN = 'Devon, what did you hear Ari asking for?';
const FAULTS = {
  'turn-length': 'One thing. Two things. Three things. Is that four?',
  'sentence-length': 'Devon, when Ari said that just now, what did you hear in it that you think you had not heard before today, if anything at all?',
  'no-why': 'Devon, why did you answer for Ari?',
  'no-verdict': 'Devon, you always step in, don’t you?',
  'no-label': 'Is that the enabling we talked about?',
  'no-promise': 'Everything will be fine once you are home, okay?',
  'no-pressure': 'Ari, you have to tell him now, all right?',
  'no-jargon': 'Is this the triangulation we keep seeing?',
  'no-figures': 'Could you call 2 times a week?',
};

test('A26 · each rule that refuses a line catches the fault it names, and only that fault', () => {
  assert.deepEqual(lintSay(CLEAN, rules), [], 'a clean line draws no finding at all');
  assert.deepEqual(lintSay(CLEAN, rules, { reply: true, present: ['Ari', 'Devon'] }), []);
  for (const [rule, line] of Object.entries(FAULTS)) assert.deepEqual(refused(line), [rule], `“${line}”`);
  // Every rule that refuses a spoken line has a fault above.
  assert.deepEqual(Object.keys(FAULTS).sort(), rules.rules.filter((rule) => rule.level === 'refuse' && rule.on === 'say').map((rule) => rule.id).sort());
  // The line a learner compares with hands the floor back, and says whose turn it is.
  assert.deepEqual(refused('Devon, tell Ari what you heard.', { reply: true, present: ['Ari', 'Devon'] }), ['hands-back']);
  assert.deepEqual(refused('What did you hear just now?', { reply: true, present: ['Ari', 'Devon'] }), ['names-someone']);
  assert.deepEqual(refused('What did you hear just now?', { reply: true, present: ['Ari'] }), [], 'one person in the room needs no name');
  assert.deepEqual(refused('Arianna, what did you hear?', { reply: true, present: ['Ari', 'Devon'] }), ['names-someone'], 'a name inside another word is not a name');
  assert.deepEqual(refused('Devon, tell Ari what you heard.'), [], 'a line that is not a comparison may end on a statement');
});

test('A26 · a phrase is matched whole, so an innocent word is not refused for what it contains', () => {
  // The rehearsal's own repair line says "why" without asking it.
  assert.deepEqual(refused('Sal, I gave you a rule before hearing why you help. Can we start there?'), []);
  assert.deepEqual(refused('You don’t have to answer that. What would you like to say?'), [], '“you don’t have to” is the opposite of pressure');
  assert.deepEqual(refused('What is it like to be the one who is addicted to being early?'), [], '“addict” is whole-word');
  assert.deepEqual(lintScope(['The meeting had begun. Grapes on the table. A gunmetal sky.'], rules), []);
  assert.deepEqual(ids(lintScope(['He keeps a gun in the house.'], rules)), ['out-of-scope']);
  // Curly and straight apostrophes are one mark.
  assert.deepEqual(refused("Don't worry, what else is there?"), ['no-promise']);
  assert.deepEqual(refused('Don’t worry, what else is there?'), ['no-promise']);
});

test('A26 · the rules that advise say so without refusing', () => {
  const long = 'Devon, I’m wondering what you heard in that, and whether it matched what you thought Ari meant. Ari, I’d like to hear whether that fits. What would you add?';
  assert.ok(wordsOf(long).length > rules.advice.turnWords && wordsOf(long).length <= rules.limits.turnWords);
  assert.deepEqual([refused(long), advised(long)], [[], ['long-turn']]);
  assert.deepEqual([refused('I do not know yet. What do you think?'), advised('I do not know yet. What do you think?')], [[], ['written-not-spoken']]);
  assert.deepEqual(advised('I want to validate that. What happened next?'), ['clinic-words']);
  assert.deepEqual(advised('I hear you, but what about Ari?'), ['yes-but']);
  // A line refused for its length is not also advised about it.
  assert.deepEqual(advised(FAULTS['sentence-length']), []);
});

test('A26 · a short scene stays away from what would need an exit', () => {
  for (const line of ['I have been thinking about suicide.', 'She said she would overdose.', 'He threatened me last week.', 'What medication is she on?', 'Nobody told me the diagnosis.', 'I am scared of him.', 'Should we lock up the pills?']) {
    assert.deepEqual(ids(lintScope([line], rules)), ['out-of-scope'], line);
  }
  assert.deepEqual(lintScope(['I’ll drive her to every appointment and sit in.', 'Who calls first?'], rules), []);
});

test('A26 · the author’s own lines pass every rule that refuses, and each says how close it is to speech', () => {
  const { lines } = json('voice/exemplars.json');
  assert.ok(lines.length >= 12);
  for (const line of lines) {
    assert.deepEqual(refused(line.say), [], `the rules refuse a line of his own: “${line.say}”`);
    assert.ok(['close', 'summarized'].includes(line.fidelity), `“${line.say}”: fidelity`);
    assert.equal(typeof line.confirmed, 'boolean');
    assert.ok(!/\d/.test(line.say), 'a line of his carries a figure');
  }
  // What the notes tidied is what the checker hears as written: no line marked "close" is.
  const stiff = lines.filter((line) => advised(line.say).includes('written-not-spoken'));
  assert.ok(stiff.length > 0 && stiff.every((line) => line.fidelity === 'summarized'));
});

test('A26 · the rules agree with every clinician line the site already carries, and cannot tell a misstep from a good line', () => {
  const lines = siteLines(ROOT);
  const of = (kind) => lines.filter((line) => line.kind === kind);
  assert.equal(of('card').length, 9, 'six cards, nine quoted turns');
  assert.ok(of('rehearsal').length >= 13 && of('scene').length >= 6);
  // A card's model line and a scene's are held as a learner's comparison: each ends on a question.
  for (const line of [...of('card'), ...of('scene'), ...of('rehearsal')]) assert.deepEqual(ids(refusals(line.findings)), [], `${line.where}: “${line.text}”`);
  // The limit of the rules, recorded: the rehearsal teaches from four missteps, and a rule
  // about form passes all four. Whether a line is the right move is the review.
  const missteps = of('rehearsal').filter((line) => ['rowan-sal:rule', 'rowan-sal:early', 'rowan-sal:soloPress', 'rowan-sal:slip'].includes(line.where));
  assert.equal(missteps.length, 4);
  assert.ok(missteps.every((line) => line.findings.length === 0));
  // Why "hands-back" is a rule for a scene's model line and for nothing else: held to it,
  // the rehearsal would lose two good lines (an invitation that ends by leaving a way out,
  // and a repair that ends by restating the limit) along with three of its four missteps.
  const statement = of('rehearsal').filter((line) => refused(line.text, { reply: true }).includes('hands-back')).map((line) => line.where);
  assert.deepEqual(statement, ['rowan-sal:direct', 'rowan-sal:early', 'rowan-sal:soloPress', 'rowan-sal:slip', 'rowan-sal:slipRepair']);
});

const SCRIPT = {
  format: 30,
  people: [{ name: 'Nell' }, { name: 'Gus' }],
  parts: [
    { part: 'join', lines: [{ to: 'Gus', kind: 'thanks', say: 'Gus, thank you for coming in.' }, { to: 'Nell', kind: 'ask', say: 'Nell, what do you want to make sure we get to?' }] },
    { part: 'hear', lines: [{ to: 'Nell', kind: 'ask', say: 'Nell, what does a good first morning look like?' }] },
    { part: 'exchange', lines: [{ to: 'Gus', kind: 'ask', say: 'Gus, what did you hear Nell asking for?' }, { to: 'everyone', kind: 'frame', say: 'Wanting time alone and wanting each other can both be true.' }] },
    { part: 'agree', lines: [{ to: 'Nell', kind: 'ask', say: 'Nell, how would you want to ask for an hour?' }] },
    { part: 'close', lines: [{ to: 'everyone', kind: 'ask', say: 'Before we stop, is there anything either of you still needs to say?' }] },
  ],
};

test('A26 · a script is held to its five parts, a question in each, and one idea in thirty minutes', () => {
  assert.deepEqual(lintScript(SCRIPT, rules), []);
  const after = (change) => {
    const copy = clone(SCRIPT);
    change(copy);
    return lintScript(copy, rules).filter((item) => item.level === 'refuse').map((item) => `${item.at}: ${item.rule}`);
  };
  const frame = { to: 'everyone', kind: 'frame', say: 'A pause is not an ending.' };
  assert.deepEqual(after((s) => s.parts[1].lines.push(frame)), ['script: one-frame'], 'two ideas in thirty minutes');
  assert.deepEqual(after((s) => { s.format = 90; s.parts[2].lines.push(frame); }), ['exchange: one-frame'], 'two ideas in one part, whatever the length');
  assert.deepEqual(after((s) => { s.format = 60; s.parts[1].lines.push(frame); }), [], 'two ideas in sixty minutes, in different parts');
  assert.deepEqual(after((s) => { s.parts[3].lines[0].kind = 'plan'; }), ['agree: asks-in-every-part']);
  assert.deepEqual(after((s) => s.parts.reverse()), ['script: shape']);
  assert.deepEqual(after((s) => { s.format = 45; }), ['script: shape']);
  assert.deepEqual(after((s) => { s.parts[0].lines[0].to = 'Rowan'; }), ['join 1: shape']);
  assert.deepEqual(after((s) => { s.parts[0].lines[1].say = 'Nell, tell me what matters.'; }), ['join 2: shape'], 'a line of kind "ask" holds a question');
  assert.deepEqual(after((s) => { s.parts[1].lines[0].say = 'Nell, why did you say that?'; }), ['hear 1: no-why']);
  assert.deepEqual(after((s) => { s.parts[4].lines = Array.from({ length: rules.limits.partLines + 1 }, () => s.parts[4].lines[0]); }), ['close: shape']);
});

// ── The brief ─────────────────────────────────────────────────────────────────────────
const ctx = context(ROOT);
const scenesBrief = json('voice/briefs/scenes.example.json');
const scriptBrief = json('voice/briefs/script.example.json');
// An invented term, used only to prove the screen looks at the protected list.
const planted = { ...ctx.protectedTerms, hashes: [...ctx.protectedTerms.hashes, termHash('Qzx Test Infirmary')], starts: [...ctx.protectedTerms.starts, startHash('Qzx Test Infirmary')] };
const screen = (brief, terms = ctx.protectedTerms) => screenBrief(brief, ctx.kit, { ...ctx, protectedTerms: terms }).join(' | ');
const withMoment = (moment) => {
  const copy = clone(scenesBrief);
  copy.scenes[0].moment = moment;
  return copy;
};

test('A26 · a brief is screened before anything is sent: invented people, no shape a record has, nothing a short scene cannot hold', () => {
  assert.equal(screen(scenesBrief), '');
  assert.equal(screen(scriptBrief), '');
  assert.match(screen({ ...scenesBrief, fictional: false }), /"fictional": true/);
  assert.match(screen(withMoment('Gus wrote to nell@example.org about it.')), /an email address/);
  assert.match(screen(withMoment('Gus left a message on 207-555-0143.')), /a phone number/);
  assert.match(screen(withMoment('It happened on 3/14 at home.')), /a date/);
  assert.match(screen(withMoment('It happened on March 14 at home.')), /a date/);
  assert.match(screen(withMoment('Since 2026 he has decided everything.')), /a year/);
  assert.match(screen(withMoment('Nell is a 34-year-old who has not been asked.')), /an age in years/);
  assert.match(screen(withMoment('Her record number is 4471902.')), /a long number/);
  assert.match(screen(withMoment('DOB on the form was wrong.')), /a record field/);
  assert.match(screen(withMoment('Gus says the gun is locked away.')), /has no exits/);
  assert.match(screen(withMoment(Array.from({ length: MOMENT_WORDS + 1 }, () => 'word').join(' '))), /case history/);
  // A protected name stops the brief, and the message does not print it.
  const named = screen(withMoment('They met at the Qzx Test Infirmary.'), planted);
  assert.match(named, /a name on the protected list \(not printed here\)/);
  assert.ok(!/qzx|infirmary/i.test(named));
  // A new scene has its own people and a move that exists.
  const rowan = clone(scenesBrief);
  rowan.scenes[0].people[0].name = 'Rowan';
  assert.match(screen(rowan), /“Rowan” is already a person on the site/);
  const lost = clone(scenesBrief);
  lost.scenes[0].move = 'room/win-the-argument';
  assert.match(screen(lost), /"move" is the address of a move card/);
  // A meeting is drafted only after the patient was asked privately, inside what they agreed to.
  assert.match(screen({ ...scriptBrief, askedPrivately: false }), /asked privately/);
  assert.match(screen({ ...scriptBrief, scope: '' }), /asked privately/);
  assert.match(screen({ ...scriptBrief, format: 45 }), /"format" is the length of the meeting in minutes: 30, 60, 90/);
  assert.match(screen({ ...scriptBrief, scope: 'Nell agreed to talk about her medication.' }), /has no exits/);
});

// ── The request ───────────────────────────────────────────────────────────────────────
const KEY = 'sk-test-not-a-real-key-0000';
const UNSUPPORTED = ['minLength', 'maxLength', 'minimum', 'maximum', 'multipleOf', 'oneOf', 'not', 'maxItems', 'pattern'];
function walkSchema(schema, visit, at = '$') {
  visit(schema, at);
  for (const [key, child] of Object.entries(schema.properties || {})) walkSchema(child, visit, `${at}.${key}`);
  if (schema.items) walkSchema(schema.items, visit, `${at}[]`);
}

test('A26 · the request is the one the API reference describes: a schema it accepts, no sampling setting, no key', () => {
  for (const brief of [scenesBrief, scriptBrief]) {
    const { problems, request } = prepare(brief, ctx);
    assert.deepEqual(problems, []);
    assert.deepEqual(Object.keys(request), ['model', 'max_tokens', 'system', 'messages', 'output_config']);
    assert.equal(request.model, DEFAULT_MODEL);
    for (const gone of ['temperature', 'top_p', 'top_k', 'stream', 'thinking']) assert.ok(!(gone in request), `the request sets ${gone}`);
    assert.deepEqual(request.messages.map((message) => message.role), ['user'], 'one user turn, and no prefilled answer');
    assert.equal(request.output_config.format.type, 'json_schema');
    walkSchema(request.output_config.format.schema, (node, at) => {
      for (const key of UNSUPPORTED) assert.ok(!(key in node), `${at}: the API does not accept "${key}" in a schema`);
      if (node.type === 'object') {
        assert.equal(node.additionalProperties, false, `${at}: an object must refuse other properties`);
        assert.deepEqual(node.required, Object.keys(node.properties), `${at}: every property is required, so none is left to chance`);
      }
      if (node.minItems !== undefined) assert.ok(node.minItems <= 1, `${at}: minItems may be 0 or 1`);
    });
    // The model is told the profile, every rule and every line of his.
    assert.ok(request.system.includes('## 1. The stance') && request.system.includes('never advice about a real patient'));
    for (const rule of rules.rules) assert.ok(request.system.includes(`· ${rule.id}: `), `the instructions leave out ${rule.id}`);
    for (const line of ctx.kit.exemplars) assert.ok(request.system.includes(`“${line.say}”`));
    assert.ok(!/\{\{|\}\}|undefined/.test(request.system + request.messages[0].content), 'a placeholder was left unfilled');
  }
  // The scenes request quotes each move's own card, so the model sees the site's standard.
  const { request } = prepare(scenesBrief, ctx);
  assert.ok(request.messages[0].content.includes('Move 5: Make a plan both people can own') && request.messages[0].content.includes('How would either of you call it off?'));
  assert.ok(!request.messages[0].content.includes(scenesBrief.note), 'the brief’s note to its author is not sent');
  // The numbers in the instructions are the rules file's.
  assert.ok(rulesText(rules).includes(`at most ${rules.limits.turnWords} words and ${rules.limits.turnSentences} sentences`));
  assert.ok(rulesText(rules).includes(`(${rules.advice.turnWords} words, or a sentence over ${rules.advice.sentenceWords})`));
  assert.equal(systemPrompt(loadKit(ROOT)), systemPrompt(ctx.kit), 'the same kit gives the same instructions');

  assert.equal(API_URL, ['https://api', 'anthropic', 'com/v1/messages'].join('.'));
  assert.deepEqual(requestHeaders({ ANTHROPIC_API_KEY: KEY }), { 'content-type': 'application/json', 'anthropic-version': API_VERSION, 'x-api-key': KEY });
  assert.equal(requestHeaders({ ANTHROPIC_API_KEY: KEY, ANTHROPIC_WORKSPACE_ID: 'wrkspc_1' })['anthropic-workspace-id'], 'wrkspc_1');
  assert.throws(() => requestHeaders({}), (error) => error instanceof ApiError && error.type === 'no-key');
  assert.throws(() => buildRequest({ model: 'gpt-x', system: 's', user: 'u', schema: {} }), /is not a model id/);
  assert.ok(!JSON.stringify(request).includes(KEY));
});

const answer = (body, { status = 200, headers = {} } = {}) => ({ ok: status >= 200 && status < 300, status, headers: { get: (name) => headers[name] ?? null }, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });
const message = (value, stop = 'end_turn') => ({ type: 'message', role: 'assistant', stop_reason: stop, content: [{ type: 'thinking', thinking: 'Weighing the brief.' }, { type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }], usage: { input_tokens: 10, output_tokens: 5 } });
function transport(replies) {
  const calls = [];
  const waits = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const next = replies.shift();
    if (next instanceof Error) throw next;
    return next;
  };
  return { calls, waits, options: { env: { ANTHROPIC_API_KEY: KEY }, fetchImpl, sleep: async (ms) => { waits.push(ms); } } };
}

test('A26 · sending: an answer is read past its thinking, a rate limit that says when is retried, a spending cap is not, and no error prints the key', async () => {
  const { request } = prepare(scenesBrief, ctx);
  let t = transport([answer(message({ scenes: [], concerns: [] }), { headers: { 'request-id': 'req_1' } })]);
  const sent = await send(request, t.options);
  assert.equal(sent.requestId, 'req_1');
  assert.deepEqual(readStructured(sent.message), { scenes: [], concerns: [] });
  assert.equal(t.calls.length, 1);
  assert.equal(t.calls[0].url, API_URL);
  assert.equal(t.calls[0].init.method, 'POST');
  assert.equal(t.calls[0].init.headers['x-api-key'], KEY);
  assert.deepEqual(JSON.parse(t.calls[0].init.body), request);

  t = transport([answer({ type: 'error', error: { type: 'rate_limit_error', message: 'Slow down.' } }, { status: 429, headers: { 'retry-after': '2' } }), answer(message({ scenes: [], concerns: [] }))]);
  await send(request, t.options);
  assert.deepEqual([t.calls.length, t.waits], [2, [2000]], 'waits as long as it was told');

  t = transport([answer({ type: 'error', error: { type: 'rate_limit_error', message: 'Monthly cap reached.' }, request_id: 'req_cap' }, { status: 429 })]);
  await assert.rejects(send(request, t.options), (error) => error instanceof ApiError && error.status === 429 && error.requestId === 'req_cap');
  assert.equal(t.calls.length, 1, 'a 429 with no retry-after keeps failing, so it is not tried again');

  t = transport([answer('upstream', { status: 500 }), answer('upstream', { status: 529 }), answer({ type: 'error', error: { type: 'api_error', message: 'Still down.' } }, { status: 500 })]);
  await assert.rejects(send(request, t.options), (error) => error.status === 500 && error.type === 'api_error' && error.message === 'Still down.');
  assert.deepEqual([t.calls.length, t.waits], [3, [1000, 2000]]);

  t = transport([answer({ type: 'error', error: { type: 'invalid_request_error', message: `bad header ${KEY}` } }, { status: 400 })]);
  await assert.rejects(send(request, t.options), (error) => error.status === 400 && !error.message.includes(KEY) && error.message.includes('[key]'));
  assert.equal(t.calls.length, 1, 'a request the API calls malformed is not sent again');

  t = transport([new Error(`socket closed for ${KEY}`), new Error('again'), new Error(`socket closed for ${KEY}`)]);
  await assert.rejects(send(request, t.options), (error) => error.type === 'network' && !error.message.includes(KEY));

  assert.throws(() => readStructured(message({}, 'refusal')), (error) => error.type === 'refusal');
  assert.throws(() => readStructured(message({}, 'max_tokens')), (error) => error.type === 'cut-off');
  assert.throws(() => readStructured(message('Here is your JSON: {')), (error) => error.type === 'not-json');
  assert.throws(() => readStructured({ stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '…' }] }), (error) => error.type === 'no-text');
});

// ── What comes back ───────────────────────────────────────────────────────────────────
const OUTPUT = {
  scenes: [
    { id: 'month', title: 'A month, already arranged', lines: [{ kind: 'speech', speaker: 'Gus', text: 'I’ve sorted it. I’m taking the whole month off.' }, { kind: 'narration', speaker: '', text: 'Nell looks at her hands.' }], reply: ['Gus, that’s a lot to offer. Nell, what part of that would you want, if any?', 'Gus, is that something you can do?'], note: 'Hands the plan back to Nell.' },
    { id: 'quiet', title: 'Quiet as praise', lines: [{ kind: 'Speech', speaker: 'Bram', text: 'Hollis has been quiet as anything.' }], reply: ['Hollis, why does that word bother you?'], note: 'Checks one word.' },
  ],
  concerns: ['The second scene may need Bram’s side first.'],
};

test('A26 · what a model returns is held to the same rules as the deck before a person sees it, and is marked as a draft', () => {
  const draft = assemble(scenesBrief, OUTPUT, ctx, { model: DEFAULT_MODEL, requestId: 'req_1', at: '2026-11-18T12:00:00.000Z' });
  assert.equal(draft.draft, true);
  assert.match(draft.status, /Not reviewed, not a page/);
  assert.deepEqual(Object.keys(draft.kit).sort(), ['voice/exemplars.json', 'voice/profile.md', 'voice/prompts/scenes.md', 'voice/prompts/script.md', 'voice/prompts/system.md', 'voice/rules.json', 'voice/schemas/scenes.schema.json', 'voice/schemas/script.schema.json']);
  for (const id of Object.values(draft.kit)) assert.match(id, /^[a-f0-9]{40}$/);
  const [month, quiet] = draft.scenes;
  assert.deepEqual(month.refused, []);
  assert.deepEqual(month.scene.reply.map((line) => line.kind), ['speech', 'narration', 'speech'], 'two turns are joined by the deck’s own pause');
  assert.equal(month.scene.reply[1].text, ctx.deck.pause);
  assert.equal(month.scene.origin, 'voice-kit-2026-11-18');
  assert.deepEqual(month.scene.people, scenesBrief.scenes[0].people, 'the people are the brief’s, not the model’s');
  assert.equal(quiet.refused.length, 1);
  assert.match(quiet.refused[0], /the model line breaks “no-why”/);
  assert.equal(draft.refused, 1);
  assert.deepEqual(draft.concerns, OUTPUT.concerns);
  const printed = report(draft);
  assert.match(printed, /^ok {7}month {2}“A month, already arranged”$/m);
  assert.match(printed, /^REFUSED {2}quiet/m);
  assert.match(printed, /the model flagged: The second scene/);
  // A scene the answer leaves out is reported, not invented.
  const partial = assemble(scenesBrief, { scenes: [OUTPUT.scenes[0]], concerns: [] }, ctx, { model: DEFAULT_MODEL, at: '2026-11-18T12:00:00.000Z' });
  assert.deepEqual(partial.scenes[1].refused, ['the answer has no scene with this id']);

  // A script: what follows the meeting is the unit workflow's own sentence, copied, not drafted.
  const script = assemble(scriptBrief, { title: 'Nell and Gus', parts: SCRIPT.parts, concerns: [] }, ctx, { model: DEFAULT_MODEL, at: '2026-11-18T12:00:00.000Z' });
  assert.equal(script.refused, 0);
  const note = json('workflows/unit-family-meeting.workflow.json').steps.find((step) => step.id === 'note').action;
  assert.ok(script.after.length > 20 && note.startsWith(script.after), 'the line on what follows is the workflow’s own');
  const taught = clone(SCRIPT.parts);
  taught[1].lines.push({ to: 'everyone', kind: 'frame', say: 'A pause is not an ending.' });
  assert.equal(assemble(scriptBrief, { title: 'Nell and Gus', parts: taught, concerns: [] }, ctx, { model: DEFAULT_MODEL, at: '2026-11-18T12:00:00.000Z' }).refused, 1);
});

test('A26 · a draft is written under voice/drafts or outside the repository, never into what the site is built from', () => {
  assert.equal(draftPath(ROOT, undefined, 'scenes-x.json'), join(ROOT, DRAFTS_DIR, 'scenes-x.json'));
  assert.equal(draftPath(ROOT, join(tmpdir(), 'elsewhere.json'), 'x.json'), join(tmpdir(), 'elsewhere.json'));
  for (const inside of ['cases/fresh-scenes.scenes.json', 'content/cards/new.md', 'voice/rules.json', 'src/lib/scenes.mjs']) {
    assert.throws(() => draftPath(ROOT, join(ROOT, inside), 'x.json'), /never to /, inside);
  }
  assert.match(readFileSync(join(ROOT, '.gitignore'), 'utf8'), /^voice\/drafts\/$/m);
});

test('A26 · the command refuses to run on a build server; a dry run needs no key and sends nothing; a brief that fails the screen is not sent', () => {
  const tool = join(ROOT, 'tools/voice/draft.mjs');
  const brief = join(ROOT, 'voice/briefs/scenes.example.json');
  const { ANTHROPIC_API_KEY, CI, NETLIFY, ...env } = process.env;
  let run = spawnSync(process.execPath, [tool, 'scenes', '--brief', brief, '--dry-run'], { encoding: 'utf8', env: { ...env, CI: 'true' } });
  assert.equal(run.status, 2);
  assert.match(run.stderr, /never runs on a build server/);
  run = spawnSync(process.execPath, [tool, 'scenes', '--brief', brief, '--dry-run'], { encoding: 'utf8', env });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(JSON.parse(run.stdout).model, DEFAULT_MODEL);
  // With no key, and no --dry-run, it stops before any request.
  run = spawnSync(process.execPath, [tool, 'scenes', '--brief', brief, '--out', join(tmpdir(), 'fwu-never-written.json')], { encoding: 'utf8', env });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /ANTHROPIC_API_KEY is not set/);
  run = spawnSync(process.execPath, [tool, 'script', '--brief', brief, '--dry-run'], { encoding: 'utf8', env });
  assert.equal(run.status, 2);
  assert.match(run.stderr, /The brief is for "scenes"/);
});

test('A26 · the site itself calls no model: only the drafting tool names the API, and nothing the build or a page loads reaches it', () => {
  const host = ['api', 'anthropic', 'com'].join('.');
  const code = [];
  const walk = (dir) => {
    for (const name of readdirSync(join(ROOT, dir))) {
      if (['node_modules', '.git', 'dist', 'dist-public', 'vendor'].includes(name)) continue;
      const rel = dir === '.' ? name : `${dir}/${name}`;
      if (statSync(join(ROOT, rel)).isDirectory()) walk(rel);
      else if (/\.(?:mjs|js|json|toml)$/.test(name)) code.push(rel);
    }
  };
  walk('.');
  assert.deepEqual(code.filter((rel) => readFileSync(join(ROOT, rel), 'utf8').includes(host)), ['tools/voice/api.mjs']);
  // Nothing under src/ (the build and what ships) imports the tool, opens a connection or reads a key.
  for (const rel of code.filter((file) => file.startsWith('src/'))) {
    const text = readFileSync(join(ROOT, rel), 'utf8');
    for (const needle of ['ANTHROPIC', 'fetch(', 'node:http', 'node:https', 'node:net', 'node:tls', 'node:dgram', 'node:child_process']) assert.ok(!text.includes(needle), `${rel} uses ${needle}`);
    assert.ok(!/(?:from|import)\s*\(?\s*['"][^'"]*tools\//.test(text), `${rel} imports from tools/`);
  }
  assert.match(readFileSync(join(ROOT, 'netlify.toml'), 'utf8'), /command = "node --test && node src\/build\.mjs"/);
  const pkg = json('package.json');
  assert.ok(!pkg.dependencies && !pkg.devDependencies, 'the kit installs nothing');
  assert.ok(!Object.values(pkg.scripts).some((script) => script.includes('voice')), 'no npm script drafts with a model');
});
