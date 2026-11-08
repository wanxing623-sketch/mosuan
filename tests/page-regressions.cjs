// Run with jsdom available: NODE_PATH=<dependency-dir>/node_modules node tests/page-regressions.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');

async function main() {
  const html = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'https://example.com/mosuan/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window, d = w.document;
  try {
    w.localStorage.setItem('zz_wrong_notes', JSON.stringify([
      { stem: '增长量计算', type: '增长', ts: Date.now(), answer: 'A' },
      { stem: '基期量计算', type: '基期', ts: Date.now(), answer: 'B' }
    ]));
    const enhancement = [...d.scripts].find(s => s.textContent.includes("var LS_WRONG = 'zz_wrong_notes'"));
    w.eval(enhancement.textContent);
    const findModule = [...d.scripts].find(s => s.textContent.includes('window.SF_BUILTIN_TXT ='));
    w.eval(findModule.textContent);
    await new Promise(resolve => w.setTimeout(resolve, 0));

    d.querySelector('[data-zz-page="wrong"]').click();
    const search = d.querySelector('#zz-wrong-search');
    const visible = () => [...d.querySelectorAll('[data-zz-wi]')].filter(c => c.style.display !== 'none');
    search.focus();
    for (const query of ['增', '增长', '增长量']) {
      search.value = query;
      search.dispatchEvent(new w.Event('input', { bubbles: true }));
      assert.equal(d.querySelector('#zz-wrong-search'), search, 'retain search node');
      assert.equal(d.activeElement, search, 'retain keyboard focus');
      assert.equal(visible().length, 1);
    }
    search.value = '不存在';
    search.dispatchEvent(new w.Event('input', { bubbles: true }));
    assert.equal(visible().length, 0);
    assert.equal(d.querySelector('[data-zz-search-empty]').style.display, '');
    search.value = '';
    search.dispatchEvent(new w.Event('input', { bubbles: true }));
    assert.equal(visible().length, 2, 'clearing search restores cards');
    assert.equal(d.querySelector('[data-zz-search-empty]').style.display, 'none');
    // Existing card click/delete handlers survive local filtering.
    visible()[0].click();
    assert(visible()[0].classList.contains('open'));
    d.querySelector('[data-zz-del]').click();
    assert.equal(JSON.parse(w.localStorage.getItem('zz_wrong_notes')).length, 1);

    const get = name => d.querySelector(`#sf-root [data-sf="${name}"]`);
    d.querySelector('[data-kao="zhao"]').click();
    get('sample').click();
    const countdown = d.querySelector('[data-sf-sw="countdown"]');
    if (!countdown.checked) countdown.click();
    const minutes = get('minutesn');
    minutes.value = '1';
    minutes.dispatchEvent(new w.Event('change', { bubbles: true }));
    let now = 1000000;
    w.Date.now = () => now;
    get('start').click();
    assert.equal(get('timer').textContent, '01:00');
    // Simulate a throttled background tab: no interval callbacks, but 31 real seconds elapsed.
    now += 31000;
    d.dispatchEvent(new w.Event('visibilitychange'));
    assert.equal(get('timer').textContent, '00:29');
    now += 30000;
    d.dispatchEvent(new w.Event('visibilitychange'));
    assert(d.querySelector('#sf-root .result-page'), 'expired background exam submits on return');
    const scores = w.localStorage.getItem('sf_scores');
    d.dispatchEvent(new w.Event('visibilitychange'));
    assert.equal(w.localStorage.getItem('sf_scores'), scores, 'return event does not submit twice');
    console.log('PASS: wrong-note search focus/filter/clear/delete; real-time countdown and background expiry');
  } finally {
    w.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
