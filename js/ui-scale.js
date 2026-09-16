// ===== #140 — the site's 90% scale, for everything CSS cannot reach (16 Sep 2026) =====
// Jerin wanted the site to open at the size Chrome shows at 90%. style.css sets `html { font-size: 90% }` and every CSS
// length is in rem, so the whole page follows ONE root size — and a person's own browser font setting.
//
// Three things never read CSS, so they come through here instead:
//   1. Canvas drawing — ctx.font and every pixel constant in a draw hook: offsets, dot radii, and the "too thin to label"
//      thresholds. 🚨 Leave a threshold unscaled and a chart quietly stops printing numbers it printed before.
//   2. Chart.js options — font sizes, paddings, legend boxes. Scaled ONCE, as each chart is created (below), so no chart
//      builder has to remember to.
//   3. A size set from code — `wrap.style.height = uiPx(h) + 'px'`.
//
// 🚨 A MEASURED value (getBoundingClientRect, offsetWidth, a Chart.js element's x / y / width) is already in real pixels.
//    Never pass it through uiPx. Mixing the two kinds is exactly how a one-line `zoom: 0.9` threw the heat-grid tooltips
//    29–90px off (measured 16 Sep) — which is why this is not a one-liner. worklists/140_scale_90_rebuild_plan.md.

let cached = 0;

// Root font size ÷ 16: 0.9 on a default browser. Read lazily — the first call is always at render time, after style.css.
export function uiScale() {
  if (cached) return cached;
  const root = parseFloat(getComputedStyle(document.documentElement).fontSize);
  const s = root > 0 ? root / 16 : 1;
  if (document.readyState !== 'loading') cached = s;
  return s;
}

// A design-time pixel number, scaled to the page.
export function uiPx(n) {
  return Math.round(n * uiScale() * 100) / 100;
}

// ----- Chart.js -----
// Pixel-valued option keys. Ratios (barPercentage, categoryPercentage), counts, colours and data are never touched.
// Values of 2px or less stay as they are — the same rule style.css follows, so hairlines stay crisp.
const PX_KEYS = new Set([
  'padding', 'boxWidth', 'boxHeight', 'boxPadding', 'pointStyleWidth', 'barThickness', 'maxBarThickness', 'borderRadius',
  'borderWidth', 'hoverBorderWidth', 'lineWidth', 'pointRadius', 'pointHoverRadius', 'hoverRadius', 'hitRadius', 'radius',
  'tickLength', 'labelOffset', 'caretSize', 'caretPadding', 'cornerRadius', 'titleMarginBottom', 'titleSpacing',
  'bodySpacing', 'footerSpacing', 'footerMarginTop', 'hoverOffset', 'spacing'
]);
const seen = new WeakSet();   // a shared options object must be scaled once, however many charts reuse it

function scaleOpts(obj, parentKey) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj) || obj.nodeType || seen.has(obj)) return;
  seen.add(obj);
  const parentIsPx = PX_KEYS.has(parentKey);            // padding: { top, right } · borderRadius: { topLeft, … }
  const parentIsFont = /font$/i.test(parentKey || '');  // font · titleFont · bodyFont · footerFont
  for (const key of Object.keys(obj)) {
    const v = obj[key];
    if (typeof v === 'number') {
      const px = parentIsPx || PX_KEYS.has(key) || (parentIsFont && key === 'size');
      if (px && Math.abs(v) > 2) obj[key] = uiPx(v);
    } else if (v && typeof v === 'object' && !Array.isArray(v) && key !== 'data') {
      scaleOpts(v, key);
    }
  }
}

// Chart.js's own built-in pixel defaults — the ones a chart falls back on when its options say nothing.
function scaleDefaults(C) {
  const d = C.defaults;
  const set = (o, k) => { if (o && typeof o[k] === 'number' && Math.abs(o[k]) > 2) o[k] = uiPx(o[k]); };
  set(d.font, 'size');
  set(d.plugins?.legend?.labels, 'boxWidth'); set(d.plugins?.legend?.labels, 'padding');
  set(d.plugins?.title, 'padding');
  ['padding', 'caretSize', 'cornerRadius', 'titleMarginBottom'].forEach(k => set(d.plugins?.tooltip, k));
  set(d.scale?.ticks, 'padding'); set(d.scale?.grid, 'tickLength');
  set(d.scale?.title?.padding, 'top'); set(d.scale?.title?.padding, 'bottom');
  set(d.elements?.point, 'radius'); set(d.elements?.point, 'hoverRadius');
}

// Every page draws with `new Chart(...)`, which reads window.Chart at the moment it runs, so replacing it here reaches all
// of them. The subclass inherits Chart.register / getChart / defaults / instances untouched.
(function install() {
  const Base = window.Chart;
  if (!Base || Base.__uiScaled) return;
  let defaultsDone = false;
  class ScaledChart extends Base {
    constructor(item, config) {
      if (!defaultsDone) { scaleDefaults(Base); defaultsDone = true; }
      if (config) {
        scaleOpts(config.options, 'options');
        ((config.data && config.data.datasets) || []).forEach(ds => scaleOpts(ds, 'dataset'));
      }
      super(item, config);
    }
  }
  ScaledChart.__uiScaled = true;
  window.Chart = ScaledChart;
})();
