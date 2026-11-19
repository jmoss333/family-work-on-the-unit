// Fresh scenes: short fictional moments, each with one empty turn.
//
// A rehearsal is a long conversation with exits; a scene is one exchange and the turn after
// it. The learner says a line aloud, then opens one possible line to compare. A scene has no
// exits, so the build refuses one that touches what would need them (voice/rules.json,
// "out-of-scope"), and it refuses a model line that breaks a rule of the voice.
//
// The page needs no script of its own: the comparison is a <details> element, closed as
// built. Its one label is written here, so this file is a source of the page and its review
// covers it. The print button's words are the ones every printable page already carries.
import { esc, escAttr } from './render.mjs';
import { lintSay, lintScope, refusals, wordsOf } from './voice.mjs';

export const SCENES_LIB = 'src/lib/scenes.mjs';
export const COMPARE_LABEL = 'Compare one possible line';
export const PRINT_LABEL = 'Print this page';

const FORBIDDEN_KEYS = new Set(['score', 'scores', 'points', 'grade', 'pass', 'fail', 'correct']);
const text = (value) => typeof value === 'string' && value.trim().length > 0;

/** The spoken turns of a scene's model line, in order. */
export const replyTurns = (scene) => (scene.reply || []).filter((line) => line.kind === 'speech');

/** Every word of a scene a reader sees. */
export const sceneTexts = (scene) => [scene.title, ...(scene.people || []).flatMap((person) => [person.name, person.role]), ...(scene.lines || []).map((line) => line.text), ...(scene.reply || []).map((line) => line.text)].filter(text);

/**
 * @param {object} deck  the scenes file
 * @param {{rules: object, cards: {slug: string}[], taken?: string[]}} against  the voice
 *        rules, the move cards a scene may practise, and names other cases already use
 * @returns {string[]} problems; empty means the deck can be built
 */
export function validateScenes(deck, { rules, cards, taken = [] }) {
  const errors = [];
  if (deck?.schema !== 1) errors.push('schema must be 1');
  if (deck?.fictional !== true) errors.push('a deck must declare "fictional": true');
  for (const key of ['intro', 'learnerRole', 'ask', 'pause']) if (!text(deck?.[key])) errors.push(`"${key}" is missing`);
  if (!Array.isArray(deck?.scenes) || !deck.scenes.length) errors.push('a deck needs at least one scene');
  if (errors.length) return errors;

  const refuse = (object, where) => {
    for (const key of Object.keys(object || {})) if (FORBIDDEN_KEYS.has(key)) errors.push(`${where}: "${key}" — scenes carry no scoring`);
  };
  refuse(deck, 'deck');
  const moves = new Set(cards.map((card) => card.slug));
  const seen = new Set();
  const { limits } = rules;

  for (const scene of deck.scenes) {
    const at = scene?.id || '(a scene with no id)';
    const start = errors.length;
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(scene?.id || '')) errors.push(`${at}: scene ids are plain identifiers`);
    if (seen.has(scene?.id)) errors.push(`${at}: used twice`);
    seen.add(scene?.id);
    if (!text(scene?.title)) errors.push(`${at}: missing title`);
    if (!text(scene?.origin)) errors.push(`${at}: missing origin (mark what was written, and when)`);
    if (!moves.has(scene?.move)) errors.push(`${at}: practises “${scene?.move}”, which is not a move card`);
    refuse(scene, at);

    const people = Array.isArray(scene?.people) ? scene.people : [];
    if (!people.length || people.length > 3) errors.push(`${at}: a scene has one to three people`);
    for (const person of people) {
      if (!text(person?.name) || !text(person?.role)) errors.push(`${at}: each person has a name and a role`);
      if (person?.name === deck.learnerRole) errors.push(`${at}: a person cannot be called “${deck.learnerRole}”`);
      if (taken.includes(person?.name)) errors.push(`${at}: “${person.name}” is a person in another case; a fresh scene has its own people`);
    }
    const names = people.map((person) => person?.name);
    if (new Set(names).size !== names.length) errors.push(`${at}: two people share a name`);

    const lines = Array.isArray(scene?.lines) ? scene.lines : [];
    if (!lines.length || lines.length > limits.sceneSetupLines) errors.push(`${at}: a scene opens with one to ${limits.sceneSetupLines} lines`);
    for (const line of lines) {
      refuse(line, `${at} line`);
      if (!text(line?.text)) errors.push(`${at}: empty line`);
      if (line?.kind === 'speech') {
        if (!names.includes(line.speaker)) errors.push(`${at}: “${line.speaker}” speaks but is not in the room`);
      } else if (line?.kind !== 'narration') errors.push(`${at}: line kind must be "speech" or "narration"`);
    }
    const setup = lines.reduce((sum, line) => sum + wordsOf(line?.text || '').length, 0);
    if (setup > limits.sceneSetupWords) errors.push(`${at}: the opening runs to ${setup} words; a scene's is ${limits.sceneSetupWords} at most`);

    // The model line: one turn, or two with the deck's own pause between them. Nothing else.
    const reply = Array.isArray(scene?.reply) ? scene.reply : [];
    const spoken = (line) => line?.kind === 'speech' && line.speaker === deck.learnerRole && text(line.text);
    const shaped = (reply.length === 1 && spoken(reply[0])) || (reply.length === 3 && limits.sceneReplyTurns >= 2 && spoken(reply[0]) && reply[1]?.kind === 'narration' && reply[1].text === deck.pause && spoken(reply[2]));
    if (!shaped) errors.push(`${at}: the model line is one turn by the ${deck.learnerRole}, or two with “${deck.pause}” between them`);
    for (const line of reply) refuse(line, `${at} reply`);

    if (errors.length > start) continue; // the checks below assume a well-formed scene
    replyTurns(scene).forEach((line, index) => {
      // Only the first turn has to say whose turn it is; the second follows from it.
      for (const item of refusals(lintSay(line.text, rules, { reply: true, present: index === 0 ? names : [] }))) errors.push(`${at}: the model line breaks “${item.rule}”. ${item.says}${item.hit ? ` (${item.hit})` : ''}`);
    });
    for (const item of lintScope(sceneTexts(scene), rules)) errors.push(`${at}: ${item.says} (${item.hit})`);
  }
  for (const item of lintScope([deck.intro, deck.ask, deck.pause], rules)) errors.push(`deck: ${item.says} (${item.hit})`);
  return errors;
}

function scriptLine(line, learnerRole) {
  return line.kind === 'speech'
    ? `<p class="speech${line.speaker === learnerRole ? ' speech--learner' : ''}"><span class="speech__who">${esc(line.speaker)}</span>“${esc(line.text)}”</p>`
    : `<p class="narration">${esc(line.text)}</p>`;
}

export function scenesContent(page, ctx, header) {
  const deck = page.scenesFile;
  const cardBySlug = new Map(ctx.site.cards.map((card) => [card.slug, card]));
  const scenes = deck.scenes
    .map((scene) => {
      const card = cardBySlug.get(scene.move);
      const label = `Move ${card.order}: ${card.title}`;
      const target = ctx.resolveLink(`page:${scene.move}`);
      const move = target.withheld ? `${esc(label)} <span class="note-in-review">(in review)</span>` : `<a href="${escAttr(target.href)}">${esc(label)}</a>`;
      const id = `scene-${scene.id}`;
      return `<section class="turn" id="${escAttr(id)}" aria-labelledby="${escAttr(id)}-title">
<h2 id="${escAttr(id)}-title">${esc(scene.title)}</h2>
<p class="turn__move">${move}</p>
<dl class="turn__people">
${scene.people.map((person) => `<dt>${esc(person.name)}</dt><dd>${esc(person.role)}</dd>`).join('\n')}
</dl>
${scene.lines.map((line) => scriptLine(line, deck.learnerRole)).join('\n')}
<p class="narration turn__ask">${esc(deck.ask)}</p>
<details class="turn__compare">
<summary>${esc(COMPARE_LABEL)}</summary>
${scene.reply.map((line) => scriptLine(line, deck.learnerRole)).join('\n')}
</details>
</section>`;
    })
    .join('\n');
  return `<article class="page">
${header}
<p class="hero__lead">${esc(deck.intro)}</p>
<div class="turns">
${scenes}
</div>
<div class="page-actions"><button type="button" class="rc-btn rc-btn--secondary" data-print>${PRINT_LABEL}</button></div>
</article>`;
}
