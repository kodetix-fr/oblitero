// The promise "no data leaves the computer", checked in the browser: a local server logs everything it receives, and
// each channel is tried from an ordinary page (it must get through, or the counter proves nothing), then from the app
// and the service worker (none may).
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { setTimeout as sleep } from 'node:timers/promises';
import { launchExtension, writePdf } from './support/browser.mjs';

// Without a name: the names of the channels. A worker has no document: what it lacks throws and counts as not started.
function tryChannel([url, name]) {
  const link = (rel, href) => { const l = document.createElement('link'); l.rel = rel; l.href = href; document.head.append(l); };
  const attempts = {
    fetch: () => fetch(url, { mode: 'no-cors' }),
    xhr: () => { const x = new XMLHttpRequest(); x.open('GET', url); x.send(); },
    websocket: () => new WebSocket(url.replace('http', 'ws')),
    eventsource: () => new EventSource(url),
    beacon: () => navigator.sendBeacon(url, 'x'),
    image: () => { const i = new Image(); i.src = `${url}/i.png`; },
    stylesheet: () => link('stylesheet', `${url}/s.css`),
    prefetch: () => link('prefetch', `${url}/p`),
    preconnect: () => link('preconnect', url),
    font: () => new FontFace('probe', `url(${url}/f.woff2)`).load(),
    media: () => { const a = new Audio(); a.src = `${url}/a.mp3`; a.load(); },
    object: () => { const o = document.createElement('object'); o.data = `${url}/o`; document.body.append(o); },
    worker: () => new Worker(`${url}/w.js`),
    frame: () => { const f = document.createElement('iframe'); f.src = `${url}/f`; document.body.append(f); },
    form: () => {
      const sink = document.createElement('iframe'); sink.name = 'sink'; document.body.append(sink);
      const f = document.createElement('form'); f.action = `${url}/post`; f.method = 'post'; f.target = 'sink'; document.body.append(f); f.submit();
    },
    importScripts: () => self.importScripts(`${url}/w.js`),
  };
  if (name === undefined) return Object.keys(attempts);
  try {
    Promise.resolve(attempts[name]()).catch(() => {});
  } catch { /* blocked, or not available here */ }
  return null;
}

let app, server, url, names;
const log = [];

before(async () => {
  server = createServer((req, res) => {
    log.push(`request ${req.method} ${req.url}`);
    res.writeHead(200, { 'content-type': 'text/html', 'access-control-allow-origin': '*' }).end('<!doctype html><title>test site</title>');
  });
  server.on('upgrade', (req, socket) => { log.push(`upgrade ${req.url}`); socket.destroy(); });
  server.on('connection', () => log.push('connection'));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  url = `http://127.0.0.1:${server.address().port}`;
  app = await launchExtension();
  names = await app.worker.evaluate(tryChannel, [url]);
});

after(async () => {
  await app?.close();
  await new Promise((done) => { server?.closeAllConnections(); server?.close(done); });
});

const leaks = async (run) => {
  const found = [];
  for (const name of names) {
    const from = log.length;
    await run(name);
    await sleep(400);
    if (log.length > from) found.push(`${name}: ${log.slice(from).join(', ')}`);
  }
  return found;
};

test('control: from an ordinary page, the attempts do reach the server', async () => {
  const page = await app.context.newPage();
  await page.goto(`${url}/`);
  const reached = await leaks((name) => page.evaluate(tryChannel, [url, name]));
  const expected = names.filter((name) => !['prefetch', 'preconnect', 'importScripts'].includes(name));
  assert.deepEqual(expected.filter((name) => !reached.some((line) => line.startsWith(`${name}:`))), []);
  await page.close();
});

test('the app: every channel is blocked by the policy, and the server sees no request', async () => {
  const page = await app.context.newPage();
  const violations = [];
  await page.exposeFunction('reportViolation', (directive) => violations.push(directive));
  await page.addInitScript(() => document.addEventListener('securitypolicyviolation', (event) => window.reportViolation(event.effectiveDirective)));
  await page.goto(`chrome-extension://${app.id}/app.html`);
  // The browser opens a bare connection ahead of its policy check for a preconnect and for a frame: no request
  // follows, and manifest.test.js fails if the code gains one.
  const reached = (await leaks((name) => page.evaluate(tryChannel, [url, name]))).filter((line) => !/^(preconnect|frame): connection(, connection)*$/.test(line));
  assert.deepEqual(reached, []);
  for (const directive of ['connect-src', 'img-src', 'style-src', 'frame-src', 'form-action']) {
    assert.ok(violations.some((seen) => seen.startsWith(directive)), `no violation of ${directive}: ${[...new Set(violations)].join(', ')}`);
  }
  await page.close();
});

test('the service worker: every channel is blocked', async () => {
  assert.deepEqual(await leaks((name) => app.worker.evaluate(tryChannel, [url, name])), []);
});

test('working on a PDF makes no request outside the extension', async () => {
  const page = await app.context.newPage();
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto(`chrome-extension://${app.id}/app.html`);
  await page.setInputFiles('#pages-file', await writePdf(app.dir, 'a.pdf', [{ size: 200, text: 'Hello' }]));
  await page.locator('#grid li canvas').first().waitFor();
  const download = page.waitForEvent('download');
  await page.locator('#download-all').click();
  await download;
  assert.ok(requests.length > 3, 'the page loaded its own files');
  assert.deepEqual(requests.filter((address) => !/^(chrome-extension|data|blob):/.test(address)), []);
  await page.close();
});
