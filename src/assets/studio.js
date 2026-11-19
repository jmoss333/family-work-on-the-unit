/* The resident and supervisor pass the same device. Only the current practice moment
 * lives in memory. A shortcut identifies a fictional scene, never a person's progress. */
(function () {
  'use strict';
  const root = document.querySelector('[data-studio]');
  const source = document.getElementById('case-data');
  if (!root || !source) return;

  const data = JSON.parse(source.textContent);
  const session = data.supervision;
  const seat = document.getElementById('studio-seat');
  const heading = document.getElementById('studio-heading');
  const body = document.getElementById('studio-body');
  const choices = document.getElementById('studio-choices');
  const tools = document.getElementById('studio-tools');
  const seats = root.querySelectorAll('[data-seat]');
  let moment = null;

  // Who is in the room: an absent seat is hidden from assistive technology and drawn empty,
  // so the picture and what a screen reader announces are the same list.
  function room(state) {
    root.dataset.room = state;
    for (const seat of seats) seat.setAttribute('aria-hidden', String(!data.room[state].includes(seat.dataset.seat)));
  }

  function el(tag, className, text) {
    const element = document.createElement(tag);
    element.className = className;
    element.textContent = text;
    return element;
  }

  function button(parent, label, action, style) {
    const control = el('button', 'rc-btn ' + style, label);
    control.type = 'button';
    control.addEventListener('click', action);
    parent.append(control);
  }

  function reset(id, role, title) {
    root.dataset.position = id;
    seat.textContent = role;
    heading.textContent = title;
    body.replaceChildren();
    choices.replaceChildren();
    tools.replaceChildren();
    tools.hidden = true;
  }

  function tool(label, action) {
    tools.hidden = false;
    button(tools, label, action, 'rc-btn--ghost');
  }

  function finish() {
    const next = moment === 'risk' || moment === 'solo' ? 'boundary' : 'risk';
    reset('finished', 'Debrief together', 'Practice complete');
    room('debrief');
    body.append(el('p', 'narration', 'Choose a moment to revisit at your next supervision.'));
    const link = el('a', 'rc-btn rc-btn--calm', 'Next supervision · ' + data.nodes[next].title);
    link.href = '#practice-' + next;
    link.dataset.practice = next;
    choices.append(link);
    tool('Start a new rehearsal', () => show(data.start));
    heading.focus();
  }

  function endOfParticipation(id) {
    return id === data.pauseNode || id === data.exits.fear || id === data.exits.declinedMeeting;
  }

  function supervise(id) {
    const stopped = endOfParticipation(id);
    const retry = session.promptHere.includes(id) ? id : moment;
    reset('supervisor', 'Supervisor seat', stopped ? 'How was the stop honored?' : 'Give one observation.');
    room('debrief');
    if (stopped) {
      body.append(el('p', 'narration', data.nodes.debriefPause.lines[0].text));
    } else {
      body.append(el('p', 'narration', 'Moment to retry · ' + data.nodes[retry].title));
      body.append(el('p', 'narration', session.moments[moment]));
      button(choices, 'Hand back · Retry this moment', () => show(retry), 'rc-btn--calm');
    }
    body.append(el('p', 'narration', stopped ? data.nodes.debriefPause.lines[1].text : session.handoff));
    if (data.nodes[id].joint) tool('Pause the joint meeting', () => show(data.pauseNode));
    tool('Finish this practice', finish);
    heading.focus();
  }

  function show(id, focus = true, requested = null) {
    const node = data.nodes[id];
    if (id === data.start) moment = null;
    if (session && Object.hasOwn(session.moments, id)) moment = id;
    reset(id, node.debrief ? 'Debrief together' : 'Resident seat', node.title);
    room(node.debrief ? 'debrief' : node.joint ? 'joint' : 'private');
    for (const line of node.lines) {
      if (line.kind === 'speech') {
        const p = el('p', line.speaker === data.learnerRole ? 'speech speech--learner' : 'speech', '');
        p.append(el('span', 'speech__who', line.speaker), document.createTextNode('“' + line.text + '”'));
        body.append(p);
      } else {
        body.append(el('p', 'narration', line.text));
      }
    }
    if (requested === 'heard') {
      const prior = data.nodes.direct.lines.find(line => line.speaker === 'Rowan');
      body.append(el('p', 'narration', 'In this version Rowan has just told Sal, “' + prior.text + '”'));
    }
    const stoppedDebrief = session && node.debrief && [data.pauseNode, data.exits.fear, data.exits.declinedMeeting].some(stop =>
      data.nodes[stop].choices.some(choice => choice.next === id));
    if (stoppedDebrief) button(choices, 'Finish this practice', finish, 'rc-btn--calm');
    if (requested) {
      button(choices, 'Practice this moment · ' + data.nodes[requested].title, () => show(requested), 'rc-btn--calm studio__choice');
    } else {
      for (const choice of node.choices) {
        button(choices, choice.label, () => show(choice.next), 'rc-btn--ghost studio__choice');
      }
    }
    if (node.joint) tool('Pause the joint meeting', () => show(data.pauseNode));
    if (moment && !node.debrief) tool('Pass to supervisor', () => supervise(id));
    if (session && node.debrief && !stoppedDebrief) tool('Finish this practice', finish);
    if (id !== data.start && !node.choices.some(choice => choice.next === data.start)) {
      tool('Start over', () => show(data.start));
    }
    if (focus) heading.focus();
  }

  function openMoment(id, focus) {
    // The joint variations retain the private briefing and the limits Rowan chose.
    // The alternate private disclosure starts with Sal absent.
    if (id === 'risk') show(id, focus);
    else show(data.start, focus, id);
  }

  root.addEventListener('click', function (event) {
    const link = event.target.closest('a[data-practice]');
    if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    openMoment(link.dataset.practice, true);
  });
  function openAddress(focus) {
    const shortcut = session?.shortcuts.find(id => location.hash === '#practice-' + id);
    if (shortcut) openMoment(shortcut, focus);
    return Boolean(shortcut);
  }
  window.addEventListener('hashchange', () => {
    if (!openAddress(true) && !location.hash) show(data.start);
  });
  // Printed/static links target the full transcript. With JS they land at the active scene.
  for (const anchor of document.querySelectorAll('[data-practice-anchor]')) {
    seat.before(anchor);
  }
  root.removeAttribute('data-static');
  if (!openAddress(true)) show(data.start, false);
})();
