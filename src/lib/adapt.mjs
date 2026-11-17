// The adaptation page: a reader chooses who does each job and how often, and the workflow
// is rewritten for their unit.
//
// One implementation does the rewriting: src/assets/adapt.js, the script the browser runs.
// The build and the tests load that same file here, in an empty context with no browser
// objects, so the sheet a reader sees is drawn by the code the tests exercised.
//
// The rules are anchored in the workflow's own text. Each rule names a field, the exact
// words it replaces, and what replaces them. validateAdaptation refuses a rule whose words
// are not in the field exactly once, or whose replacement, filled with the defaults, is not
// those same words. So with nothing changed, the adapted sheet is the workflow word for word.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

/** The script, as a page source. An adaptation page's review covers it: see model.mjs. */
export const ADAPT_SCRIPT = 'src/assets/adapt.js';
const ASSET = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'adapt.js');
let cached;

/** The browser script's pure functions, loaded without a browser. */
export function adaptCore() {
  if (!cached) {
    const sandbox = {};
    vm.runInNewContext(readFileSync(ASSET, 'utf8'), sandbox, { filename: 'adapt.js' });
    cached = sandbox.FWUAdapt;
  }
  return cached;
}

/**
 * What the page hands the script: the reader's words and the rules, and nothing else.
 * Left out are the fields only the build and the review use (who owns a step in the
 * workflow's own terms, links, and the note on where an added sentence came from, which
 * the workflow page shows in the review channel only).
 */
export function payload(workflow, spec) {
  const pick = (object, keys) => Object.fromEntries(keys.filter((key) => object[key] !== undefined).map((key) => [key, object[key]]));
  return {
    workflow: {
      ...pick(workflow, ['version', 'purpose', 'scope', 'principle', 'basis', 'guardrails', 'closing']),
      steps: workflow.steps.map((step) => pick(step, ['id', 'title', 'trigger', 'ownerLabel', 'action', 'record', 'doneWhen'])),
      formats: { ...pick(workflow.formats, ['decisionRule', 'noJointMeeting', 'note']), menu: workflow.formats.menu.map((format) => pick(format, ['name', 'focus', 'when'])) },
      exceptions: workflow.exceptions.map((exception) => pick(exception, ['when', 'then'])),
      measures: { ...pick(workflow.measures, ['cadence', 'baseline', 'note']), list: workflow.measures.list.map((measure) => pick(measure, ['name', 'checksStep'])) },
      additions: (workflow.additions || []).map((note) => pick(note, ['id', 'text'])),
    },
    spec: pick(spec, ['titles', 'none', 'slots', 'timings', 'owners', 'rules', 'messages']),
  };
}

const text = (value) => typeof value === 'string' && value.trim().length > 0;
const ID = /^[a-z][a-z0-9-]*$/;
const FORMS = ['label', 'bare', 'phrase', 'person'];

/** @returns {string[]} problems; empty when the adaptation rules fit the workflow */
export function validateAdaptation(spec, workflow) {
  const errors = [];
  if (!spec || typeof spec !== 'object') return ['not an object'];
  if (spec.schema !== 1) errors.push('unknown schema (expected 1)');
  if (spec.workflow !== workflow.id) errors.push(`written for workflow "${spec.workflow}", not "${workflow.id}"`);
  if (spec.workflowVersion !== workflow.version) errors.push(`written for workflow version ${spec.workflowVersion}; the workflow is at ${workflow.version}. Re-check every rule, then update "workflowVersion".`);
  if (!text(spec.intro)) errors.push('"intro" is required');
  for (const key of ['canChange', 'cannotChange']) {
    if (!Array.isArray(spec[key]) || !spec[key].length || !spec[key].every(text)) errors.push(`"${key}": at least one sentence`);
  }
  for (const key of ['same', 'changed', 'refusedOne', 'refusedMany', 'markSame', 'markChanged', 'local', 'noOwner', 'noScript']) {
    if (!text(spec.messages?.[key])) errors.push(`messages: "${key}" is required`);
  }

  const titles = spec.titles && typeof spec.titles === 'object' ? spec.titles : {};
  for (const [id, title] of [...Object.entries(titles), ['none', spec.none || {}]]) {
    if (!ID.test(id)) errors.push(`title "${id}": bad id`);
    for (const form of FORMS) if (!text(title[form])) errors.push(`title "${id}": "${form}" is required`);
  }
  if (titles.none) errors.push('"none" is reserved: it means nobody holds the job');

  const slots = Array.isArray(spec.slots) ? spec.slots : [];
  const timings = Array.isArray(spec.timings) ? spec.timings : [];
  if (!slots.length) errors.push('no slots');
  const ids = new Set();
  const codes = new Set();
  for (const item of [...slots, ...timings]) {
    if (!ID.test(item?.id || '')) errors.push(`"${item?.id}": bad id`);
    if (ids.has(item.id)) errors.push(`"${item.id}": duplicate id`);
    ids.add(item.id);
    if (!/^[A-Z]$/.test(item.code || '') || codes.has(item.code)) errors.push(`"${item.id}": its code is one capital letter, used once`);
    codes.add(item.code);
    if (!text(item.question)) errors.push(`"${item.id}": no question`);
    if (!Array.isArray(item.options) || item.options.length < 2) errors.push(`"${item.id}": at least two options`);
    else if (!item.options.includes(item.default)) errors.push(`"${item.id}": its default is not one of its options`);
    if (new Set(item.options || []).size !== (item.options || []).length) errors.push(`"${item.id}": an option is listed twice`);
  }
  for (const slot of slots) for (const option of slot.options || []) if (!titles[option]) errors.push(`slot "${slot.id}": unknown title "${option}"`);
  for (const timing of timings) {
    if (!text(timing.prefix)) errors.push(`interval "${timing.id}": no prefix`);
    if (!(timing.options || []).every(text)) errors.push(`interval "${timing.id}": options are short texts`);
  }
  const slotIds = new Set(slots.map((slot) => slot.id));
  const timingIds = new Set(timings.map((timing) => timing.id));

  // Every step has owner slots, and every slot owns a step outright, so that leaving any
  // job unfilled leaves a step with no owner.
  const stepIds = workflow.steps.map((step) => step.id);
  const owners = spec.owners && typeof spec.owners === 'object' ? spec.owners : {};
  if (JSON.stringify(Object.keys(owners)) !== JSON.stringify(stepIds)) errors.push('"owners" must list the workflow\'s steps, in order');
  for (const [step, list] of Object.entries(owners)) {
    if (!Array.isArray(list) || !list.length) errors.push(`owners: step "${step}" has no slot`);
    for (const slot of list || []) if (!slotIds.has(slot)) errors.push(`owners: step "${step}" names unknown slot "${slot}"`);
  }
  for (const slot of slotIds) {
    if (!Object.values(owners).some((list) => Array.isArray(list) && list.length === 1 && list[0] === slot)) errors.push(`slot "${slot}" is the sole owner of no step`);
  }

  if (errors.length) return errors; // the rule checks below need a well-formed spec

  const core = adaptCore();
  const base = core.defaults(spec);
  const tokens = (template) => [...template.matchAll(/\{([a-z-]+)(?:\.([A-Za-z]+))?\}/g)];
  const checkTemplate = (where, template) => {
    if (!text(template)) return errors.push(`${where}: no replacement text`);
    for (const [whole, id, form] of tokens(template)) {
      if (timingIds.has(id)) {
        if (form) errors.push(`${where}: ${whole} is an interval and takes no form`);
      } else if (!slotIds.has(id)) errors.push(`${where}: ${whole} names no slot or interval`);
      else if (form && ![...FORMS, 'Phrase'].includes(form)) errors.push(`${where}: ${whole} uses an unknown form`);
    }
    if (/[{}]/.test(template.replace(/\{[a-z-]+(?:\.[A-Za-z]+)?\}/g, ''))) errors.push(`${where}: a stray brace`);
    return undefined;
  };
  (Array.isArray(spec.rules) ? spec.rules : []).forEach((rule, index) => {
    const where = `rule ${index + 1} (${rule.at})`;
    let place;
    try {
      place = core.locate(workflow, rule.at);
    } catch {
      place = null;
    }
    const field = place?.holder?.[place.key];
    if (typeof field !== 'string') return errors.push(`${where}: no such text in the workflow`);
    if (!text(rule.find)) return errors.push(`${where}: "find" is required`);
    const count = field.split(rule.find).length - 1;
    if (count !== 1) errors.push(`${where}: "${rule.find}" occurs ${count} times in the field; it must occur once`);
    checkTemplate(where, rule.replace);
    if (!errors.length && core.fill(spec, base, rule.replace) !== rule.find) errors.push(`${where}: with nothing changed it would write "${core.fill(spec, base, rule.replace)}" over "${rule.find}"`);
    for (const [v, variant] of (rule.variants || []).entries()) {
      const at = `${where}, variant ${v + 1}`;
      const kinds = ['none', 'same', 'is'].filter((kind) => variant[kind] !== undefined);
      if (kinds.length !== 1) errors.push(`${at}: exactly one of "none", "same" or "is"`);
      for (const slot of [...(variant.none || []), ...(variant.same || []), ...Object.keys(variant.is || {})]) if (!slotIds.has(slot)) errors.push(`${at}: unknown slot "${slot}"`);
      if (variant.same && variant.same.length !== 2) errors.push(`${at}: "same" compares two slots`);
      for (const [slot, value] of Object.entries(variant.is || {})) if (!titles[value]) errors.push(`${at}: "${slot}" is compared with unknown title "${value}"`);
      checkTemplate(at, variant.replace);
    }
    return undefined;
  });
  if (!Array.isArray(spec.rules) || !spec.rules.length) errors.push('no rules');
  return errors;
}
