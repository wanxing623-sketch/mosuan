// NODE_PATH=<dependency-dir>/node_modules node tests/offline-import.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');

async function main() {
  const html = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'file:///offline/index.html', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window, d = w.document;
  let requests = 0;
  w.fetch = () => { requests++; throw new Error('Network disabled'); };
  try {
    assert.equal(d.querySelectorAll('script[src], link[rel="stylesheet"][href], link[rel="modulepreload"][href]').length, 0,
      'offline page must not depend on external scripts/styles');
    const sf = [...d.scripts].find(s => s.textContent.includes('window.SF_BUILTIN_TXT ='));
    // Intentionally execute while document is loading, before DOMContentLoaded.
    Object.defineProperty(d, 'readyState', { configurable: true, get: () => 'loading' });
    w.eval(sf.textContent);
    assert(d.querySelector('#kao-hub.show'), 'entry starts without waiting for DOMContentLoaded');
    const get = name => d.querySelector(`#sf-root [data-sf="${name}"]`);
    d.querySelector('[data-kao="zhao"]').click();
    get('to-import').click();
    const input = get('file');
    assert.equal(input.hidden, false, 'native picker input is directly interactive');
    assert(input.accept.includes('text/plain'));
    const localFile = new w.File([w.SF_BUILTIN_TXT], '本地题库.txt', { type: 'text/plain' });
    Object.defineProperty(input, 'files', { value: [localFile] });
    input.dispatchEvent(new w.Event('change', { bubbles: true }));
    await new Promise(resolve => w.setTimeout(resolve, 100));
    assert.equal(get('ta').value, w.SF_BUILTIN_TXT, 'local FileReader reads TXT offline');
    assert.equal(get('go-setup').disabled, false);
    get('go-setup').click();
    assert(d.querySelector('#sf-root .setup-page'));
    assert.equal(requests, 0, 'local import makes no network request');
    console.log('PASS: immediate startup before DOMContentLoaded, local TXT import under file URL, no network dependency');
  } finally { w.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
