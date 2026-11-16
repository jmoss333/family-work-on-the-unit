// "No import from other apps, login, free-text capture, server, AI endpoint, microphone,
// external fonts or analytics. State lives in memory; refresh starts over." (design brief)
// Each clause is checked against the files that actually ship.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, built, htmlFiles, read, walk } from './helpers.mjs';

const assets = join(ROOT, 'src', 'assets');
const scripts = readdirSync(assets).filter((name) => name.endsWith('.js'));
const styles = readdirSync(assets).filter((name) => name.endsWith('.css'));

const FORBIDDEN = [
  'localStorage', 'sessionStorage', 'indexedDB', 'document.cookie', 'caches.',
  'fetch(', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'sendBeacon', 'importScripts', 'serviceWorker',
  'getUserMedia', 'mediaDevices', 'MediaRecorder', 'SpeechRecognition', 'AudioContext',
  'postMessage', 'window.open', 'eval(', 'new Function', 'pushState', 'replaceState', 'geolocation', 'clipboard',
];

test('A5 · shipped scripts store nothing, send nothing and listen to nothing', () => {
  assert.deepEqual(scripts.sort(), ['site.js', 'studio.js']);
  for (const name of scripts) {
    const code = readFileSync(join(assets, name), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const term of FORBIDDEN) assert.ok(!code.includes(term), `${name} uses ${term}`);
  }
});

test('A5 · stylesheets import nothing and fetch nothing', () => {
  for (const name of styles) {
    const css = readFileSync(join(assets, name), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/@import/i.test(css), `${name}: @import`);
    assert.ok(!/url\(/i.test(css), `${name}: url()`);
    assert.ok(!/@font-face/i.test(css), `${name}: @font-face`);
  }
});

test('A5 · the only thing a reader can type into is the home page’s find box, and it has no name to submit', () => {
  const { dir } = built('review');
  let inputs = 0;
  for (const file of htmlFiles(dir)) {
    const html = read(dir, file);
    assert.ok(!/<(?:textarea|select|form)\b/i.test(html), `${file}: a form control that could capture text`);
    for (const [tag] of html.matchAll(/<input\b[^>]*>/gi)) {
      inputs += 1;
      assert.equal(file, 'index.html', `${file}: unexpected input`);
      assert.match(tag, /type="search"/);
      assert.ok(!/\sname=/.test(tag), 'the find box must not be a named field');
    }
  }
  assert.equal(inputs, 1);
});

test('A5 · the build ships text files only: no fonts, images, media or archives', () => {
  for (const channel of ['review', 'public']) {
    for (const file of walk(built(channel).dir)) assert.match(file, /\.(html|css|js|txt|json)$/, `${channel}: unexpected file ${file}`);
  }
});
