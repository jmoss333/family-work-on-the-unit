// Comparing a workflow file with the procedure it was copied from.
//
// The procedure names the unit, its institution and the products it uses, so it is not in
// this repository and the comparison cannot run in the build. What can be kept here is its
// result: for every sentence a reader sees, either a fingerprint of the sentence as it stood
// when it was found word for word in the procedure, or the reason it is not there. A test
// holds the workflow file to that record, so a sentence cannot change after the comparison
// without the change being declared.
import { createHash } from 'node:crypto';

const sha = (text) => createHash('sha256').update(text).digest('hex');

/** Text as compared: Markdown escapes dropped, every run of white space one space. */
export const normalise = (text) => String(text).replace(/\\([_#*~`[\]()>|-])/g, '$1').replace(/\s+/g, ' ').trim();

/** The fingerprint the record keeps of a sentence found in the procedure. */
export const fingerprint = (text) => sha(normalise(text)).slice(0, 12);

/**
 * Every sentence of a workflow that a reader sees, in the order the procedure has them,
 * with where each lives in the file.
 * Left out, because they are this site's own and not the procedure's text: the row labels of
 * the boards (`roles`), link labels and targets, ids, and the note on where an added
 * sentence came from. A step at which nothing is written (`record: null`) has no sentence.
 * @returns {{at: string, text: string}[]}
 */
export function readerStrings(w) {
  const out = [];
  const add = (at, text) => { if (typeof text === 'string') out.push({ at, text }); };
  for (const key of ['basis', 'purpose', 'scope', 'principle']) add(key, w[key]);
  for (const step of w.steps || []) for (const key of ['title', 'trigger', 'ownerLabel', 'action', 'record', 'doneWhen']) add(`steps.${step.id}.${key}`, step[key]);
  (w.formats?.menu || []).forEach((format, index) => { for (const key of ['name', 'focus', 'when']) add(`formats.menu.${index}.${key}`, format[key]); });
  for (const key of ['decisionRule', 'noJointMeeting']) add(`formats.${key}`, w.formats?.[key]);
  (w.guardrails || []).forEach((line, index) => add(`guardrails.${index}`, line));
  (w.exceptions || []).forEach((exception, index) => { add(`exceptions.${index}.when`, exception.when); add(`exceptions.${index}.then`, exception.then); });
  add('measures.cadence', w.measures?.cadence);
  (w.measures?.list || []).forEach((measure, index) => add(`measures.list.${index}.name`, measure.name));
  add('measures.baseline', w.measures?.baseline);
  for (const note of w.additions || []) add(`additions.${note.id}.text`, note.text);
  add('closing', w.closing);
  return out;
}

/** The longest run of characters two texts share, to show a reader where a sentence nearly is. */
function nearest(source, text) {
  const a = text.toLowerCase();
  const b = source.toLowerCase();
  let best = 0;
  let end = 0;
  let previous = new Uint16Array(a.length + 1);
  for (let j = 1; j <= b.length; j += 1) {
    const current = new Uint16Array(a.length + 1);
    for (let i = 1; i <= a.length; i += 1) {
      if (a[i - 1] === b[j - 1]) {
        current[i] = previous[i - 1] + 1;
        if (current[i] > best) { best = current[i]; end = j; }
      }
    }
    previous = current;
  }
  return source.slice(end - best, end);
}

/**
 * Compare a workflow with the text of its source.
 *
 * A sentence counts as carried over only where the procedure has it, in order: the same
 * short label often occurs at several steps, and finding step 7's owner under step 1 would
 * prove nothing. So the sentences are laid along the source in the one order-keeping way
 * that covers the most text, and each is then one of:
 *   verbatim   in its place, word for word
 *   capitals   in its place, the same words with different capitals
 *   elsewhere  the words are in the procedure, and not at this place
 *   absent     the words are not in the procedure
 * @param {object} workflow
 * @param {string} sourceText
 * @param {[string, string][]} substitutions wording changes to apply to the source first
 *        (a product's name for a generic phrase, an abbreviation spelt out)
 * @returns {{rows: {at, text, how, nearest: string|null}[], residue: string[], residueHash: string, unused: string[]}}
 *          `residue` is what the source says that the workflow does not carry in place.
 */
export function compare(workflow, sourceText, substitutions = []) {
  let source = normalise(sourceText);
  const unused = [];
  for (const [from, to] of substitutions) {
    if (!source.includes(normalise(from))) unused.push(from);
    source = source.split(normalise(from)).join(normalise(to));
  }
  const lower = source.toLowerCase();
  const strings = readerStrings(workflow).map(({ at, text }) => ({ at, text: normalise(text) }));

  // Every place each sentence occurs, capitals aside.
  const places = [];
  strings.forEach((item, index) => {
    const wanted = item.text.toLowerCase();
    for (let at = lower.indexOf(wanted); at !== -1; at = lower.indexOf(wanted, at + 1)) places.push({ index, at, end: at + wanted.length });
  });
  // The heaviest chain of places in which both the sentences and their positions run forward.
  const best = places.map((place) => place.end - place.at);
  const from = places.map(() => -1);
  places.forEach((place, k) => {
    for (let j = 0; j < k; j += 1) {
      if (places[j].index < place.index && places[j].end <= place.at && best[j] + (place.end - place.at) > best[k]) {
        best[k] = best[j] + (place.end - place.at);
        from[k] = j;
      }
    }
  });
  const placed = new Map();
  let last = best.reduce((top, weight, k) => (top === -1 || weight > best[top] ? k : top), -1);
  for (; last !== -1; last = from[last]) placed.set(places[last].index, places[last]);

  const rows = strings.map((item, index) => {
    const place = placed.get(index);
    const how = place ? (source.slice(place.at, place.end) === item.text ? 'verbatim' : 'capitals') : places.some((other) => other.index === index) ? 'elsewhere' : 'absent';
    return { at: item.at, text: item.text, how, nearest: how === 'absent' ? nearest(source, item.text) : null };
  });

  // What is left of the source once every sentence in its place is taken out was not carried.
  const spans = [...placed.values()].sort((a, b) => a.at - b.at);
  const pieces = [];
  let cursor = 0;
  for (const span of spans) {
    pieces.push(source.slice(cursor, span.at));
    cursor = span.end;
  }
  pieces.push(source.slice(cursor));
  const residue = pieces.map((piece) => piece.trim()).filter((piece) => /[\p{L}\p{N}]/u.test(piece));
  return { rows, residue, residueHash: sha(residue.join('\n')).slice(0, 12), unused };
}

/**
 * Hold a workflow file to the record of its last comparison.
 * @returns {string[]} problems; empty when every sentence a reader sees is either the
 *          sentence that was found in the procedure, or listed with the reason it differs
 */
export function checkRecord(workflow, record) {
  const errors = [];
  if (!record || record.schema !== 1) return ['unknown schema (expected 1)'];
  for (const key of ['workflow', 'source', 'compared']) if (typeof record[key] !== 'string' || !record[key].trim()) errors.push(`"${key}" is required`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(record.compared || '')) errors.push('"compared" is the date of the comparison, as YYYY-MM-DD');
  if (!/^[0-9a-f]{12}$/.test(record.notCarried || '')) errors.push('"notCarried" is the fingerprint of what the procedure says and the workflow does not carry');
  const verbatim = record.verbatim && typeof record.verbatim === 'object' ? record.verbatim : {};
  const differs = record.differs && typeof record.differs === 'object' ? record.differs : {};
  const seen = new Set();
  for (const { at, text } of readerStrings(workflow)) {
    seen.add(at);
    if (at in differs) {
      if (at in verbatim) errors.push(`${at}: listed both as found in the procedure and as differing from it`);
      if (typeof differs[at] !== 'string' || !differs[at].trim()) errors.push(`${at}: it differs from the procedure, and no reason is given`);
    } else if (!(at in verbatim)) {
      errors.push(`${at}: “${normalise(text).slice(0, 60)}” has not been compared with the procedure. Run tools/compare_workflow_source.mjs, or list it under "differs" with the reason.`);
    } else if (verbatim[at] !== fingerprint(text)) {
      errors.push(`${at}: “${normalise(text).slice(0, 60)}” has changed since it was compared with the procedure on ${record.compared}. Run the comparison again, or list it under "differs" with the reason.`);
    }
  }
  for (const at of [...Object.keys(verbatim), ...Object.keys(differs)]) if (!seen.has(at)) errors.push(`${at}: in the record, and the workflow has no such sentence`);
  return errors;
}
