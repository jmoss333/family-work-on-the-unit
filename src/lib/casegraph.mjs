// Structural checks for a rehearsal case. Run by the build (which refuses a failing case)
// and by the tests. Every rule here is one of the brief's own acceptance tests, turned into
// something a machine can check.

const FORBIDDEN_KEYS = new Set(['score', 'scores', 'points', 'grade', 'pass', 'fail', 'correct']);

/** Every node reachable from `from`, following choices and (from joint nodes) the pause tool. */
export function reachable(caseFile, from) {
  const seen = new Set();
  const stack = [from];
  while (stack.length) {
    const id = stack.pop();
    if (seen.has(id) || !caseFile.nodes[id]) continue;
    seen.add(id);
    const node = caseFile.nodes[id];
    for (const choice of node.choices || []) stack.push(choice.next);
    if (node.joint && caseFile.pauseNode) stack.push(caseFile.pauseNode);
  }
  return seen;
}

/** @returns {string[]} a list of problems; empty means the case is structurally sound. */
export function validateCase(caseFile) {
  const errors = [];
  const nodes = caseFile.nodes || {};
  const ids = Object.keys(nodes);
  const speakers = new Set([...(caseFile.people || []).map((p) => p.name), caseFile.learnerRole]);

  if (caseFile.fictional !== true) errors.push('case must declare "fictional": true');
  if (!nodes[caseFile.start]) errors.push(`start node "${caseFile.start}" does not exist`);
  if (!nodes[caseFile.pauseNode]) errors.push(`pause node "${caseFile.pauseNode}" does not exist`);
  if (nodes[caseFile.pauseNode]?.joint) errors.push('the pause node must not itself be a joint node');

  for (const id of ids) {
    const node = nodes[id];
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(id)) errors.push(`${id}: node ids are plain identifiers`);
    if (typeof node.title !== 'string' || !node.title.trim()) errors.push(`${id}: missing title`);
    if (typeof node.joint !== 'boolean') errors.push(`${id}: "joint" must be true or false`);
    if (!Array.isArray(node.lines) || !node.lines.length) errors.push(`${id}: no lines`);
    for (const line of node.lines || []) {
      if (line.kind === 'speech') {
        if (!speakers.has(line.speaker)) errors.push(`${id}: unknown speaker "${line.speaker}"`);
      } else if (line.kind !== 'narration') {
        errors.push(`${id}: line kind must be "speech" or "narration"`);
      }
      if (typeof line.text !== 'string' || !line.text.trim()) errors.push(`${id}: empty line`);
    }
    if (!Array.isArray(node.choices) || !node.choices.length) errors.push(`${id}: a node with no choice is a dead end`);
    for (const choice of node.choices || []) {
      if (!nodes[choice.next]) errors.push(`${id}: choice "${choice.label}" points at missing node "${choice.next}"`);
      if (typeof choice.label !== 'string' || !choice.label.trim()) errors.push(`${id}: a choice has no label`);
    }
  }

  // No scoring of any kind: "No global score or false success." A position may be CALLED
  // anything (one is called "correct", for the correction it makes room for); what is
  // refused is a scoring PROPERTY on the case, a position, a line or a choice.
  const refuse = (object, where) => {
    for (const key of Object.keys(object || {})) {
      if (FORBIDDEN_KEYS.has(key)) errors.push(`${where}: "${key}" — cases carry no scoring`);
    }
  };
  refuse(caseFile, 'case');
  for (const id of ids) {
    refuse(nodes[id], id);
    (nodes[id].lines || []).forEach((line) => refuse(line, `${id} line`));
    (nodes[id].choices || []).forEach((choice) => refuse(choice, `${id} choice "${choice.label}"`));
  }

  if (errors.length) return errors; // the graph checks below assume a well-formed case

  const fromStart = reachable(caseFile, caseFile.start);
  for (const id of ids) if (!fromStart.has(id)) errors.push(`${id}: unreachable from the start`);

  // Every position has a way out to a debrief.
  const debriefs = ids.filter((id) => nodes[id].debrief === true);
  if (!debriefs.length) errors.push('no node is marked "debrief": true');
  for (const id of ids) {
    const reach = reachable(caseFile, id);
    if (!debriefs.some((d) => reach.has(d))) errors.push(`${id}: no route from here to a debrief`);
  }

  // The exits the brief requires: refusal or withdrawal, a restricted topic, fear, a meeting
  // that never happens, and a privacy miss that is repaired.
  const required = ['withdrawal', 'restrictedTopic', 'fear', 'declinedMeeting', 'privacyMiss'];
  for (const name of required) {
    const target = caseFile.exits?.[name];
    if (!target) errors.push(`exits.${name} is not declared`);
    else if (!nodes[target]) errors.push(`exits.${name} points at missing node "${target}"`);
    else if (!fromStart.has(target)) errors.push(`exits.${name} ("${target}") is unreachable`);
  }
  if (caseFile.exits?.withdrawal !== caseFile.pauseNode) errors.push('exits.withdrawal must be the pause node');

  // "Two reasonable moves can advance."
  const two = caseFile.twoMovesAdvance;
  if (!two) errors.push('twoMovesAdvance is not declared');
  else {
    const offered = new Set((nodes[two.from]?.choices || []).map((c) => c.next));
    if (!Array.isArray(two.via) || two.via.length < 2) errors.push('twoMovesAdvance.via needs at least two moves');
    for (const via of two.via || []) {
      if (!offered.has(via)) errors.push(`twoMovesAdvance: "${two.from}" does not offer "${via}"`);
      if (!(nodes[via]?.choices || []).some((c) => c.next === two.to)) {
        errors.push(`twoMovesAdvance: "${via}" does not advance to "${two.to}"`);
      }
    }
  }
  return errors;
}

/** Depth-first order from the start, for the reviewer's script. Unvisited nodes follow. */
export function reviewOrder(caseFile) {
  const order = [];
  const seen = new Set();
  const visit = (id) => {
    if (seen.has(id) || !caseFile.nodes[id]) return;
    seen.add(id);
    order.push(id);
    for (const choice of caseFile.nodes[id].choices) visit(choice.next);
  };
  visit(caseFile.start);
  visit(caseFile.pauseNode);
  for (const id of Object.keys(caseFile.nodes)) visit(id);
  return order;
}
