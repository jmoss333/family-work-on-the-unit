/* map.js — on the map page, opens one step at a time and covers the answers for self-testing.
 *
 * It shows and hides what the page already contains, and marks what is open. It writes no
 * text into the page, stores nothing, sends nothing and leaves the address alone. So every
 * word a reader can see is in the page as built, and the page's review does not need to
 * cover this file. tests/no-capture.test.mjs and tests/map.test.mjs hold it to that.
 *
 * Without this script the page is complete: every step is open and nothing is covered.
 */
(function () {
  'use strict';

  var root = document.querySelector('[data-map-root]');
  if (!root) return;
  var tools = root.querySelector('[data-map-tools]');
  var cover = root.querySelector('[data-map-recall]');
  var prompt = root.querySelector('[data-map-prompt]');
  if (!tools || !cover || !prompt) return;
  var open = null;

  function each(selector, fn) {
    Array.prototype.forEach.call(root.querySelectorAll(selector), fn);
  }

  /** Open one step's card and mark its column, or close them all when `id` is null. */
  function show(id) {
    open = id;
    each('[data-map-detail]', function (card) {
      card.hidden = card.getAttribute('data-map-detail') !== id;
    });
    each('[data-map-step]', function (button) {
      button.setAttribute('aria-expanded', button.getAttribute('data-map-step') === id ? 'true' : 'false');
    });
    each('[data-step]', function (cell) {
      if (cell.getAttribute('data-step') === id) cell.setAttribute('data-open', 'true');
      else cell.removeAttribute('data-open');
    });
  }

  /** Uncover one column of the board while the answers are covered. */
  function reveal(id) {
    each('[data-step]', function (cell) {
      if (cell.getAttribute('data-step') === id) cell.setAttribute('data-revealed', 'true');
    });
  }

  /** Cover every answer on the board, or uncover them all. Either way, start from nothing open. */
  function setCovered(on) {
    root.setAttribute('data-recall', on ? 'true' : 'false');
    cover.setAttribute('aria-pressed', on ? 'true' : 'false');
    prompt.hidden = !on;
    each('[data-revealed]', function (cell) {
      cell.removeAttribute('data-revealed');
    });
    show(null);
  }

  root.addEventListener('click', function (event) {
    var button = event.target && event.target.closest ? event.target.closest('[data-map-step]') : null;
    if (!button || button.disabled) return;
    var id = button.getAttribute('data-map-step');
    if (root.getAttribute('data-recall') === 'true') reveal(id);
    show(open === id ? null : id);
    var card = open ? document.getElementById(button.getAttribute('aria-controls')) : null;
    if (card && card.scrollIntoView) card.scrollIntoView({ block: 'nearest' });
  });
  cover.addEventListener('click', function () {
    setCovered(root.getAttribute('data-recall') !== 'true');
  });

  function startOver() {
    setCovered(false);
  }
  // A browser may bring the page back as it was left. Starting over each time it is shown
  // keeps the promise that nothing is remembered.
  window.addEventListener('pageshow', startOver);

  each('[data-map-step]', function (button) {
    button.disabled = false;
  });
  tools.hidden = false;
  startOver();
  root.setAttribute('data-map-ready', 'true');
})();
