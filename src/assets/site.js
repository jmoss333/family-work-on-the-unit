/* site.js — two small conveniences. Neither stores or sends anything.
 *   1. A "Print" button calls the browser's own print dialog.
 *   2. The home page's "Find a page" box filters the list already on the page.
 */
(function () {
  'use strict';

  document.addEventListener('click', function (event) {
    var trigger = event.target.closest && event.target.closest('[data-print]');
    if (trigger) window.print();
  });

  var input = document.getElementById('find');
  if (!input) return;
  var items = Array.prototype.slice.call(document.querySelectorAll('[data-find]'));
  var sections = Array.prototype.slice.call(document.querySelectorAll('.lib-section'));
  var count = document.getElementById('find-count');
  var none = document.getElementById('find-none');

  input.addEventListener('input', function () {
    var words = input.value.toLowerCase().split(/\s+/).filter(Boolean);
    var shown = 0;
    items.forEach(function (item) {
      var haystack = item.getAttribute('data-find');
      var match = words.every(function (word) { return haystack.indexOf(word) !== -1; });
      item.hidden = !match;
      if (match) shown += 1;
    });
    sections.forEach(function (section) {
      section.hidden = !section.querySelector('[data-find]:not([hidden])');
    });
    none.hidden = shown !== 0;
    count.textContent = words.length ? (shown === 1 ? '1 page matches.' : shown + ' pages match.') : '';
  });
})();
