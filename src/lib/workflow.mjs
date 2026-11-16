// A unit workflow: who does what, when, where it is written and when it is done.
//
// The file is data, not prose, so that the things a workflow gets wrong can be refused by
// the build instead of found on the unit: a step nobody owns, a role that is "in scope" and
// has no step, a measure that checks nothing.

const text = (value) => typeof value === 'string' && value.trim().length > 0;
const ID = /^[a-z][a-z0-9-]*$/;

/** @returns {string[]} problems; empty when the workflow is sound */
export function validateWorkflow(w) {
  const errors = [];
  if (!w || typeof w !== 'object') return ['not an object'];
  if (w.schema !== 1) errors.push('unknown schema (expected 1)');
  for (const key of ['id', 'version', 'purpose', 'scope', 'principle', 'closing']) {
    if (!text(w[key])) errors.push(`"${key}" is required`);
  }

  const roles = w.roles && typeof w.roles === 'object' ? w.roles : {};
  if (!Object.keys(roles).length) errors.push('no roles are declared');
  for (const [id, label] of Object.entries(roles)) {
    if (!ID.test(id) || !text(label)) errors.push(`role "${id}" needs an id and a label`);
  }

  const steps = Array.isArray(w.steps) ? w.steps : [];
  if (!steps.length) errors.push('no steps');
  const stepIds = new Set();
  const working = new Set();
  steps.forEach((step, index) => {
    const at = `step ${index + 1}${step?.id ? ` (${step.id})` : ''}`;
    if (!ID.test(step?.id || '')) errors.push(`${at}: needs an id`);
    if (stepIds.has(step.id)) errors.push(`${at}: duplicate id`);
    stepIds.add(step.id);
    for (const key of ['title', 'trigger', 'ownerLabel', 'action', 'doneWhen']) {
      if (!text(step[key])) errors.push(`${at}: "${key}" is required`);
    }
    if (!Array.isArray(step.owner) || !step.owner.length) errors.push(`${at}: nobody owns it`);
    for (const role of [...(Array.isArray(step.owner) ? step.owner : []), ...(step.support || [])]) {
      if (!roles[role]) errors.push(`${at}: unknown role "${role}"`);
      working.add(role);
    }
    if (!(step.record === null || text(step.record))) errors.push(`${at}: "record" is where it is written, or null when nothing is`);
    for (const link of step.links || []) {
      if (!text(link?.label) || !text(link?.to)) errors.push(`${at}: a link needs a label and a target`);
    }
  });
  for (const role of Object.keys(roles)) {
    if (!working.has(role)) errors.push(`role "${role}" is in scope but owns and supports no step`);
  }

  const formats = w.formats || {};
  if (!Array.isArray(formats.menu) || !formats.menu.length) errors.push('formats: no menu');
  for (const [index, format] of (formats.menu || []).entries()) {
    for (const key of ['name', 'focus', 'when']) if (!text(format?.[key])) errors.push(`format ${index + 1}: "${key}" is required`);
  }
  for (const key of ['decisionRule', 'noJointMeeting']) if (!text(formats[key])) errors.push(`formats: "${key}" is required`);

  if (!Array.isArray(w.guardrails) || !w.guardrails.length || !w.guardrails.every(text)) errors.push('guardrails: at least one, each a sentence');
  if (!Array.isArray(w.exceptions) || !w.exceptions.length) errors.push('exceptions: at least one');
  for (const [index, exception] of (w.exceptions || []).entries()) {
    if (!text(exception?.when) || !text(exception?.then)) errors.push(`exception ${index + 1}: needs "when" and "then"`);
  }

  const measures = w.measures || {};
  if (!text(measures.cadence) || !text(measures.baseline)) errors.push('measures: "cadence" and "baseline" are required');
  if (!Array.isArray(measures.list) || !measures.list.length) errors.push('measures: none listed');
  for (const [index, measure] of (measures.list || []).entries()) {
    if (!text(measure?.name)) errors.push(`measure ${index + 1}: no name`);
    if (!stepIds.has(measure?.checksStep)) errors.push(`measure ${index + 1}: checks step "${measure?.checksStep}", which does not exist`);
  }

  // Sentences that are not in the source procedure are listed, so a reviewer can find them.
  for (const [index, note] of (w.additions || []).entries()) {
    if (!text(note?.id) || !text(note?.text) || !text(note?.basis)) errors.push(`addition ${index + 1}: needs an id, the text and its basis`);
  }
  const additionIds = new Set((w.additions || []).map((note) => note.id));
  for (const id of [formats.note, measures.note].filter(Boolean)) {
    if (!additionIds.has(id)) errors.push(`note "${id}" is not listed under "additions"`);
  }
  return errors;
}

/** Steps a measure checks, and the steps that no measure watches. */
export function coverage(w) {
  const watched = new Set(w.measures.list.map((measure) => measure.checksStep));
  return { watched: w.steps.filter((step) => watched.has(step.id)).map((step) => step.id), unwatched: w.steps.filter((step) => !watched.has(step.id)).map((step) => step.id) };
}
