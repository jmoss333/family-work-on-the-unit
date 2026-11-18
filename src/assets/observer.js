// The complete comparison is already on the page. These controls show one spoken turn at a time.
(function () {
  'use strict';
  const root = document.querySelector('[data-observer]');
  if (!root) return;
  const choices = root.querySelectorAll('[data-ending]');
  const versions = root.querySelectorAll('[data-version]');
  const liveLine = root.querySelector('[data-turn-line]');

  function selectTurn(version, index) {
    const turn = version.querySelector('.observer-transcript').children[index];
    for (const button of version.querySelectorAll('[data-turn]')) {
      button.setAttribute('aria-pressed', String(Number(button.dataset.turn) === index));
    }
    liveLine.replaceChildren(...Array.from(turn.children, (child) => child.cloneNode(true)));
  }

  function selectEnding(id) {
    for (const button of choices) {
      button.setAttribute('aria-pressed', String(button.dataset.ending === id));
    }
    for (const version of versions) {
      version.hidden = version.dataset.version !== id;
      if (!version.hidden) selectTurn(version, 1);
    }
  }

  for (const version of versions) {
    for (const button of version.querySelectorAll('[data-turn]')) {
      button.addEventListener('click', () => selectTurn(version, Number(button.dataset.turn)));
    }
    version.querySelector('[data-turns]').hidden = false;
    version.querySelector('.observer-transcript').hidden = true;
    version.querySelector('.observer-static-title').classList.add('sr-only');
  }
  for (const button of choices) {
    button.addEventListener('click', () => selectEnding(button.dataset.ending));
  }
  root.querySelector('[data-instructions]').hidden = false;
  root.querySelector('[data-endings]').hidden = false;
  liveLine.hidden = false;
  selectEnding(choices[0].dataset.ending);
})();
