// Run with jsdom available: NODE_PATH=<dependency-dir>/node_modules node tests/sf-setup.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');

async function main() {
  const html = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'https://example.com/mosuan/', runScripts: 'outside-only' });
  const w = dom.window, d = w.document;
  try {
    // Execute the independent find-number module, without modifying its closure or exposing state.
    const script = [...d.scripts].find(s => s.textContent.includes('window.SF_BUILTIN_TXT ='));
    w.eval(script.textContent);
    await new Promise(resolve => w.setTimeout(resolve, 0));
    const get = name => d.querySelector(`#sf-root [data-sf="${name}"]`);
    const edit = (input, value, event = 'input') => {
      input.value = value;
      input.dispatchEvent(new w.Event(event, { bubbles: true }));
    };
    const ready = () => d.querySelector('#sf-root .ready-num').textContent;
    d.querySelector('[data-kao="zhao"]').click();
    get('sample').click();
    d.querySelector('[data-sf-mode="random"]').click();
    const slider = get('count'), number = get('countn');
    for (const value of ['2', '8', '15']) {
      edit(slider, value);
      assert.equal(get('count'), slider, 'drag must retain the original range node');
      assert.equal(number.value, value);
      assert.equal(ready(), value);
    }
    number.focus();
    edit(number, '');
    assert.equal(number.value, '', 'allow temporary empty input');
    edit(number, '1');
    edit(number, '12');
    assert.equal(d.activeElement, number, 'typing must retain focus');
    assert.equal(slider.value, '12');
    assert.equal(ready(), '12');
    edit(number, '999');
    assert.equal(number.value, '999', 'do not rewrite the active draft');
    number.blur();
    assert.equal(number.value, slider.max, 'clamp on blur');
    edit(number, '3.9', 'change');
    assert.equal(number.value, '3');
    edit(number, '-1', 'change');
    assert.equal(number.value, '1');
    edit(number, '', 'change');
    assert.equal(number.value, '1', 'empty commit restores last valid value');
    const countdown = d.querySelector('[data-sf-sw="countdown"]');
    if (!countdown.checked) countdown.click();
    const minutes = get('minutes'), minutesn = get('minutesn');
    edit(minutes, '45');
    assert.equal(get('minutes'), minutes);
    assert.equal(minutesn.value, '45');
    edit(minutesn, '');
    edit(minutesn, '90');
    assert.equal(minutes.value, '90');
    edit(minutesn, '200', 'change');
    assert.equal(minutesn.value, '120');
    d.querySelector('[data-sf-mode="range"]').click();
    const from = get('from'), to = get('to');
    edit(from, '12');
    assert.equal(get('from'), from);
    edit(to, '5', 'change');
    assert.equal(from.value, '5', 'reversed interval is reconciled on commit');
    assert.equal(ready(), '1');
    edit(from, '10', 'change');
    assert.equal(to.value, '10');
    edit(to, '15', 'change');
    assert.equal(ready(), '6');
    get('start').click();
    assert(d.querySelector('#sf-root .exam-page'), 'start exam still works');
    console.log('PASS: slider node retention, focus, multi-digit drafts, numeric bounds, countdown, intervals, start exam');
  } finally {
    w.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
