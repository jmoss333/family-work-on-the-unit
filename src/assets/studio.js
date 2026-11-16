/* studio.js — the rehearsal controller.
 *
 * What it does: reads the case from the page, shows one position at a time, and moves when a
 * button is pressed. That is all.
 *
 * What it never does (tests/no-capture.test.mjs fails the build if any of these appear):
 * it stores nothing, sends nothing, listens to nothing and scores nothing. State lives in
 * one variable; refreshing the page starts the rehearsal over, and the browser's Back
 * button leaves the page rather than revealing an earlier position.
 */
(function () {
  'use strict';
  var root = document.querySelector('[data-studio]');
  var source = document.getElementById('case-data');
  if (!root || !source) return;

  var data = JSON.parse(source.textContent);
  var heading = document.getElementById('studio-heading');
  var body = document.getElementById('studio-body');
  var choices = document.getElementById('studio-choices');
  var tools = document.getElementById('studio-tools');

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function button(label, target, className) {
    var b = el('button', className, label);
    b.type = 'button';
    b.addEventListener('click', function () { show(target, true); });
    return b;
  }

  function show(id, moveFocus) {
    var position = data.nodes[id];
    heading.textContent = position.title;
    body.replaceChildren();
    choices.replaceChildren();
    tools.replaceChildren();

    position.lines.forEach(function (line) {
      if (line.kind === 'speech') {
        var p = el('p', 'speech' + (line.speaker === data.learnerRole ? ' speech--learner' : ''));
        p.append(el('span', 'speech__who', line.speaker), document.createTextNode('“' + line.text + '”'));
        body.append(p);
      } else {
        body.append(el('p', 'narration', line.text));
      }
    });

    position.choices.forEach(function (choice) {
      choices.append(button(choice.label, choice.next, 'rc-btn rc-btn--ghost studio__choice'));
    });

    // Either person can stop a joint conversation at any point, so the way out is always
    // on screen there. It is never a choice the learner has to earn.
    if (position.joint) tools.append(button('Pause the joint meeting', data.pauseNode, 'rc-btn rc-btn--calm'));
    var offersRestart = position.choices.some(function (choice) { return choice.next === data.start; });
    if (id !== data.start && !offersRestart) tools.append(button('Start over', data.start, 'rc-btn rc-btn--ghost'));
    tools.hidden = !tools.childElementCount;

    root.setAttribute('data-position', id);
    if (moveFocus) heading.focus();
  }

  root.removeAttribute('data-static');
  show(data.start, false);
})();
