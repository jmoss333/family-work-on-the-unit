/* adapt.js — rewrites the unit workflow with a reader's own owners and intervals.
 *
 * What it does: reads the workflow and the adaptation rules from the page, applies the
 * choices made in the page's menus, and redraws the sheet. A version with a step nobody
 * owns is marked and cannot be printed.
 *
 * What it never does (tests/no-capture.test.mjs fails the build if any of these appear):
 * it stores nothing, sends nothing and puts nothing in the address bar. There is no text
 * field: every choice comes from a fixed list, so no name can be typed in. Choices live in
 * the menus themselves; refreshing the page puts every menu back to the workflow as written.
 *
 * The part above the "page wiring" line touches no browser object. The build runs the same
 * code to draw the sheet as written, and the tests run it for every combination of choices.
 */
(function (global) {
  'use strict';

  var NUMBER_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'];

  function esc(value) {
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function cap(text) { return text.charAt(0).toUpperCase() + text.slice(1); }
  function countWord(n) { return NUMBER_WORDS[n] || String(n); }
  function own(object, key) { return Object.prototype.hasOwnProperty.call(object, key); }

  /** The workflow as written: every slot and interval at its default. */
  function defaults(spec) {
    var choices = {};
    spec.slots.forEach(function (slot) { choices[slot.id] = slot.default; });
    spec.timings.forEach(function (timing) { choices[timing.id] = timing.default; });
    return choices;
  }

  /** Keep only choices the page offers; anything else falls back to the default. */
  function clean(spec, chosen) {
    var choices = defaults(spec);
    spec.slots.forEach(function (slot) {
      var value = chosen ? chosen[slot.id] : undefined;
      if (value === 'none' || slot.options.indexOf(value) !== -1) choices[slot.id] = value;
    });
    spec.timings.forEach(function (timing) {
      var value = chosen ? chosen[timing.id] : undefined;
      if (timing.options.indexOf(value) !== -1) choices[timing.id] = value;
    });
    return choices;
  }

  function title(spec, id) { return id === 'none' ? spec.none : spec.titles[id]; }

  /** Fill {slot.form} and {interval} in a rule's replacement text. */
  function fill(spec, choices, template) {
    return template.replace(/\{([a-z-]+)(?:\.([A-Za-z]+))?\}/g, function (whole, id, form) {
      var isTiming = spec.timings.some(function (timing) { return timing.id === id; });
      if (isTiming) return choices[id];
      var chosen = title(spec, choices[id]);
      if (form === 'Phrase') return cap(chosen.phrase);
      return chosen[form || 'label'];
    });
  }

  /** The replacement a rule uses for these choices: the first variant that applies, else the rule's own. */
  function pick(rule, choices) {
    var variants = rule.variants || [];
    for (var i = 0; i < variants.length; i += 1) {
      var variant = variants[i];
      if (variant.none && variant.none.every(function (slot) { return choices[slot] === 'none'; })) return variant.replace;
      if (variant.same && choices[variant.same[0]] !== 'none' && choices[variant.same[0]] === choices[variant.same[1]]) return variant.replace;
      if (variant.is && Object.keys(variant.is).every(function (slot) { return choices[slot] === variant.is[slot]; })) return variant.replace;
    }
    return rule.replace;
  }

  /** Where a rule's text lives: "steps.<id>.<field>", "exceptions.<n>.<field>" or a top-level field. */
  function locate(workflow, at) {
    var parts = at.split('.');
    if (parts[0] === 'steps') {
      return { holder: workflow.steps.filter(function (step) { return step.id === parts[1]; })[0], key: parts[2] };
    }
    if (parts[0] === 'exceptions') return { holder: workflow.exceptions[Number(parts[1])], key: parts[2] };
    return { holder: workflow, key: parts[0] };
  }

  /** A compact record of the choices, for comparing one unit's version with another's. */
  function code(spec, choices, version) {
    function part(list) {
      return list.map(function (item) {
        var value = choices[item.id];
        return item.code + (value === 'none' ? 'x' : item.options.indexOf(value));
      }).join('');
    }
    return version + '/' + part(spec.slots) + '/' + part(spec.timings);
  }

  /** Read a version code back into choices, or null when it is not one of this workflow's. */
  function decode(spec, text, version) {
    var match = /^([0-9.]+)\/((?:[A-Z](?:x|[0-9]+))+)\/((?:[A-Z][0-9]+)+)$/.exec(String(text));
    if (!match || match[1] !== version) return null;
    var choices = {};
    function read(list, packed, allowNone) {
      var found = packed.match(/[A-Z](?:x|[0-9]+)/g) || [];
      if (found.length !== list.length) return false;
      return list.every(function (item, index) {
        var letter = found[index].charAt(0);
        var rest = found[index].slice(1);
        if (letter !== item.code) return false;
        if (rest === 'x') { if (!allowNone) return false; choices[item.id] = 'none'; return true; }
        var value = item.options[Number(rest)];
        if (value === undefined) return false;
        choices[item.id] = value;
        return true;
      });
    }
    return read(spec.slots, match[2], true) && read(spec.timings, match[3], false) ? choices : null;
  }

  /**
   * Apply the choices to a copy of the workflow.
   * @returns {{workflow, choices, changed, total, refused, code}} `refused` lists the steps
   *          nobody owns; a version with any is not printable.
   */
  function adapt(workflow, spec, chosen) {
    var choices = clean(spec, chosen);
    var base = defaults(spec);
    var out = JSON.parse(JSON.stringify(workflow));

    spec.rules.forEach(function (rule) {
      var place = locate(out, rule.at);
      place.holder[place.key] = place.holder[place.key].split(rule.find).join(fill(spec, choices, pick(rule, choices)));
    });

    var changed = 0;
    var total = 0;
    for (var key in base) {
      if (own(base, key)) {
        total += 1;
        if (choices[key] !== base[key]) changed += 1;
      }
    }
    // The scope sentence lists the source unit's roles. Once a role changes, the list of
    // choices printed at the top of the sheet says who is in scope instead.
    if (spec.slots.some(function (slot) { return choices[slot.id] !== slot.default; })) out.scope = null;

    var refused = [];
    out.steps.forEach(function (step, index) {
      var slots = spec.owners[step.id] || [];
      step.number = index + 1;
      step.unowned = slots.length > 0 && slots.every(function (slot) { return choices[slot] === 'none'; });
      if (step.unowned) {
        step.ownerLabel = spec.messages.noOwner;
        refused.push({ number: step.number, title: step.title });
      }
    });

    return { workflow: out, choices: choices, changed: changed, total: total, refused: refused, code: code(spec, choices, workflow.version) };
  }

  function stepList(refused) {
    if (refused.length === 1) return 'Step ' + refused[0].number + ' (' + refused[0].title + ')';
    var numbers = refused.map(function (step) { return step.number; });
    var last = numbers.pop();
    return 'Steps ' + numbers.join(', ') + ' and ' + last;
  }

  /** One sentence on where this version stands: as written, changed, or not printable. */
  function status(result, spec) {
    var messages = spec.messages;
    if (result.refused.length) {
      return (result.refused.length === 1 ? messages.refusedOne : messages.refusedMany).replace('{steps}', stepList(result.refused));
    }
    if (!result.changed) return messages.same;
    return messages.changed.replace('{count}', result.changed).replace('{total}', result.total);
  }

  /** The sheet, as HTML. Every value is escaped; the text comes only from the page's own data. */
  function sheet(result, spec) {
    var w = result.workflow;
    var messages = spec.messages;
    var numberOf = {};
    var titleOf = {};
    w.steps.forEach(function (step) { numberOf[step.id] = step.number; titleOf[step.id] = step.title; });
    var notes = {};
    (w.additions || []).forEach(function (note) { notes[note.id] = note.text; });
    function note(id) { return notes[id] ? '<p class="wf-note">' + esc(notes[id]) + '</p>' : ''; }

    var mark = result.changed
      ? messages.markChanged.replace('{version}', w.version).replace('{code}', result.code)
      : messages.markSame.replace('{version}', w.version);
    var html = '<div class="adapt-mark"><p class="adapt-mark__line">' + esc(mark) + '</p>';
    if (result.changed) {
      html += '<p class="adapt-mark__local">' + esc(messages.local) + '</p><dl class="adapt-mark__choices">';
      spec.slots.forEach(function (slot) {
        html += '<dt>' + esc(slot.question) + '</dt><dd>' + esc(title(spec, result.choices[slot.id]).label) + '</dd>';
      });
      spec.timings.forEach(function (timing) {
        html += '<dt>' + esc(timing.question) + '</dt><dd>' + esc(timing.prefix + ' ' + result.choices[timing.id]) + '</dd>';
      });
      html += '</dl>';
    }
    html += '</div>';

    html += '<p class="hero__lead">' + esc(w.purpose) + '</p><dl class="wf-frame">';
    if (w.scope) html += '<dt>Scope</dt><dd>' + esc(w.scope) + '</dd>';
    html += '<dt>Principle</dt><dd>' + esc(w.principle) + '</dd></dl>';
    html += '<p class="note-in-review">' + esc(w.basis) + '</p>';

    html += '<section class="wf-section" aria-labelledby="wf-steps"><h2 id="wf-steps">' + countWord(w.steps.length) + ' steps</h2><ol class="wf-steps">';
    w.steps.forEach(function (step) {
      html += '<li class="wf-step rc-card' + (step.unowned ? ' wf-step--gap' : '') + '" id="step-' + esc(step.id) + '">' +
        '<span class="wf-step__n" aria-hidden="true">' + step.number + '</span><div class="wf-step__body">' +
        '<h3><span class="sr-only">Step ' + step.number + ': </span>' + esc(step.title) + '</h3>' +
        '<p class="wf-step__who"><span class="rc-badge ' + (step.unowned ? 'rc-badge--warning' : 'rc-badge--neutral') + '">' + esc(step.ownerLabel) + '</span><span>' + esc(step.trigger) + '</span></p>' +
        '<p>' + esc(step.action) + '</p>' +
        '<dl class="wf-facts"><dt>Written in</dt><dd>' +
        (step.record === null ? '<span aria-hidden="true">—</span><span class="sr-only">Nothing is written at this step</span>' : esc(step.record)) +
        '</dd><dt>Done when</dt><dd>' + esc(step.doneWhen) + '</dd></dl></div></li>';
    });
    html += '</ol></section>';

    html += '<section class="wf-section" aria-labelledby="wf-formats"><h2 id="wf-formats">' + countWord(w.formats.menu.length) + ' formats</h2><ol class="wf-formats">';
    w.formats.menu.forEach(function (format) {
      html += '<li class="wf-format rc-card"><h3>' + esc(format.name) + '</h3><p>' + esc(format.focus) + '</p><p class="wf-format__when">' + esc(format.when) + '</p></li>';
    });
    html += '</ol><p><strong>Decision rule:</strong> ' + esc(w.formats.decisionRule) + '</p>' +
      '<p><strong>No joint meeting today when:</strong> ' + esc(w.formats.noJointMeeting) + '</p>' + note(w.formats.note) + '</section>';

    html += '<section class="wf-section" aria-labelledby="wf-guardrails"><h2 id="wf-guardrails">Guardrails</h2><ul class="wf-list">';
    w.guardrails.forEach(function (line) { html += '<li>' + esc(line) + '</li>'; });
    html += '</ul></section>';

    html += '<section class="wf-section" aria-labelledby="wf-exceptions"><h2 id="wf-exceptions">When it does not go to plan</h2><dl class="wf-exceptions">';
    w.exceptions.forEach(function (exception) { html += '<dt>' + esc(exception.when) + '</dt><dd>' + esc(exception.then) + '</dd>'; });
    html += '</dl></section>';

    html += '<section class="wf-section" aria-labelledby="wf-measures"><h2 id="wf-measures">Proposed measures</h2><p>' + esc(w.measures.cadence) + '</p>' +
      '<div class="rc-table-wrap" role="region" aria-label="Proposed measures" tabindex="0"><table class="rc-table">' +
      '<thead><tr><th scope="col">Measure</th><th scope="col">Checks</th></tr></thead><tbody>';
    w.measures.list.forEach(function (measure) {
      html += '<tr><td>' + esc(measure.name) + '</td><td><a href="#step-' + esc(measure.checksStep) + '">Step ' + numberOf[measure.checksStep] + ': ' + esc(titleOf[measure.checksStep]) + '</a></td></tr>';
    });
    html += '</tbody></table></div><p>' + esc(w.measures.baseline) + '</p>' + note(w.measures.note) + '</section>';

    html += '<p class="wf-closing">' + esc(w.closing) + '</p>';
    return html;
  }

  global.FWUAdapt = { defaults: defaults, clean: clean, fill: fill, pick: pick, locate: locate, adapt: adapt, status: status, sheet: sheet, code: code, decode: decode };

  // ── Page wiring ────────────────────────────────────────────────────────────────────
  if (typeof document === 'undefined') return;
  var root = document.querySelector('[data-adapt-root]');
  var source = document.getElementById('adapt-data');
  if (!root || !source) return;

  var data = JSON.parse(source.textContent);
  var target = root.querySelector('[data-adapt-sheet]');
  var message = document.getElementById('adapt-status');
  var printButton = root.querySelector('[data-adapt-print]');
  var resetButton = root.querySelector('[data-adapt-reset]');
  var menus = Array.prototype.slice.call(root.querySelectorAll('select[data-adapt]'));

  function read() {
    var choices = {};
    menus.forEach(function (menu) { choices[menu.getAttribute('data-adapt')] = menu.value; });
    return choices;
  }

  function draw() {
    var result = adapt(data.workflow, data.spec, read());
    target.innerHTML = sheet(result, data.spec);
    message.textContent = status(result, data.spec);
    root.setAttribute('data-refused', result.refused.length ? 'true' : 'false');
    root.setAttribute('data-changed', result.changed ? 'true' : 'false');
    printButton.disabled = result.refused.length > 0;
    menus.forEach(function (menu) {
      menu.parentNode.classList.toggle('adapt-field--gap', menu.value === 'none');
    });
  }

  function startOver() {
    menus.forEach(function (menu) { menu.value = menu.getAttribute('data-default'); });
    draw();
  }

  root.addEventListener('change', function (event) {
    if (event.target && event.target.matches && event.target.matches('select[data-adapt]')) draw();
  });
  resetButton.addEventListener('click', startOver);
  // A browser may put old menu values back when a page is reloaded or reached with Back.
  // Starting over each time the page is shown keeps the promise that nothing is remembered.
  window.addEventListener('pageshow', startOver);
  // The page is written with its menus and buttons switched off, so that without this
  // script it is plainly the workflow as written and not a tool that silently does nothing.
  menus.forEach(function (menu) { menu.disabled = false; });
  resetButton.disabled = false;
  startOver();
  root.setAttribute('data-adapt-ready', 'true');
})(typeof window !== 'undefined' ? window : this);
