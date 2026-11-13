// Run with jsdom available: NODE_PATH=<dependency-dir>/node_modules node tests/mobile-viewport.cjs
// 覆盖移动端“地址栏/底部工具栏收起后固定元素被吞掉、页面滚不到底”的修正层。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

function nextFrame(w) {
  return new Promise(resolve => (w.requestAnimationFrame || (fn => w.setTimeout(fn, 0)))(() => resolve()));
}

async function main() {
  // 1) Viewport meta：安全区 + 键盘改为挤压内容而不是盖住底部。
  const viewport = html.match(/<meta[^>]*name="viewport"[^>]*>/i);
  assert(viewport, 'viewport meta exists');
  assert(/viewport-fit=cover/.test(viewport[0]), 'viewport-fit=cover kept');
  assert(/interactive-widget=resizes-content/.test(viewport[0]), 'keyboard resizes layout viewport');

  // 2) 修正层存在且关键规则齐全。
  assert(html.includes('id="mvv-layer"'), 'mobile viewport style layer present');
  assert(html.includes('id="mvv-script"'), 'mobile viewport script present');
  const layer = html.slice(html.indexOf('id="mvv-layer"'), html.indexOf('id="mvv-script"'));
  for (const rule of [
    '--app-vh',
    '--vv-bottom-gap',
    'overflow-x:clip',
    '.draft-fab',
    'bottom:calc(max(12px,env(safe-area-inset-bottom,0px)) + var(--vv-bottom-gap))',
    '#kao-hub,#sf-root',
    'height:var(--app-vh)',
  ]) {
    assert(layer.includes(rule), 'layer contains: ' + rule);
  }

  // 3) 运行修正脚本：可视视口比布局视口矮时，固定元素应被抬起。
  const dom = new JSDOM(html, { url: 'https://example.com/mosuan/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  const d = w.document;
  // jsdom 的 pretendToBeVisual rAF 循环在 close() 之后仍会触发；这里换成普通定时器。
  w.requestAnimationFrame = fn => w.setTimeout(fn, 0);
  try {
    w.innerHeight = 700; // 布局视口
    let vvEvents = 0;
    const vv = {
      width: 375,
      height: 600, // 底部被浏览器工具栏遮住 100px
      offsetTop: 0,
      offsetLeft: 0,
      scale: 1,
      addEventListener() { vvEvents++; },
      removeEventListener() {},
    };
    Object.defineProperty(w, 'visualViewport', { value: vv, configurable: true });
    // jsdom 没有真实排版，用固定值模拟布局视口高度。
    Object.defineProperty(d.documentElement, 'clientHeight', { value: 700, configurable: true });
    Object.defineProperty(d.documentElement, 'clientWidth', { value: 375, configurable: true });

    const script = [...d.scripts].find(s => s.id === 'mvv-script');
    assert(script, 'mvv script tag found');
    w.eval(script.textContent);
    await nextFrame(w);
    await nextFrame(w);

    const rootStyle = d.documentElement.style;
    assert.equal(rootStyle.getPropertyValue('--vv-bottom-gap'), '100px', 'bottom gap follows visualViewport');
    assert.equal(rootStyle.getPropertyValue('--app-vh'), '600px', 'app height follows visualViewport');
    assert(vvEvents >= 1, 'visualViewport listeners attached');

    // 草稿工具条初始位置（沿旧 innerHeight 计算）落在可视区之外 → 应被拉回可视区。
    const tb = d.createElement('div');
    tb.className = 'draft-toolbar';
    tb.style.position = 'fixed';
    tb.style.left = '10px';
    tb.style.top = '650px';
    d.body.appendChild(tb);
    await nextFrame(w);
    await nextFrame(w);
    assert.equal(tb.style.top, '592px', 'toolbar clamped into visual viewport');

    // 页面滚动后浏览器工具栏状态变化：可视视口变高，gap 归零。
    vv.height = 700;
    w.dispatchEvent(new w.Event('resize'));
    await nextFrame(w);
    await nextFrame(w);
    assert.equal(rootStyle.getPropertyValue('--vv-bottom-gap'), '0px', 'gap clears when chrome hides');

    // React 重新渲染会把样式写回旧坐标，观察器需要再拉回一次。
    tb.style.top = '695px';
    await nextFrame(w);
    await nextFrame(w);
    assert.equal(tb.style.top, '692px', 'toolbar re-clamped after re-render');

    console.log('PASS: mobile viewport vars, fixed draft FAB/toolbar reachable, meta viewport hardened');
  } finally {
    // 让修正层里的延迟调度跑完，再关闭 jsdom 窗口，避免关闭后的定时器回调报错。
    await new Promise(resolve => setTimeout(resolve, 700));
    w.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
