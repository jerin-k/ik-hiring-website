import { podOf, POD_OPTIONS, isSalesPod, capacityOf, currentQuarter, qKey } from '../recruiter-pods.js';
import { resolveDeptTeam } from '../dept-map.js';

// Overall Efficiency = everything Recruiter Efficiency has, but the Recruiter dimension is replaced by
// Department. Trees are Pod → Department → Job; charts are one-per-pod with Y = Job. Pods map to
// recruiters (not jobs), so attributing a Job/Department to a Pod needs the recruiter×job rollup from the
// pipeline redesign — until then every metric cell is a placeholder (—), same honesty as the Recruiter tab.
// The only live values here: Fulfilment pod Target = summed pod capacities, and the org-wide Sourcing chart.

const POD_ORDER = [...POD_OPTIONS, 'Unassigned'];
const CARET = '<span class="caret" style="display:inline-block;width:14px;color:var(--muted)">▸</span>';
const DASH = '<span class="zero">—</span>';
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Throughput stages (mirrors the HM tab)
const TP_KEYS = ['app','ta','hm','oa','r1','r2','r3','r4','r5','rc','ds','offer'];
const TP_LABELS = { app:'Application', ta:'TA Screen', hm:'HM Review', oa:'OA', r1:'R1', r2:'R2', r3:'R3', r4:'R4', r5:'R5', rc:'Ref Check', ds:'Doc Sub', offer:'Offer' };

function dashTds(n) { return `<td>${DASH}</td>`.repeat(n); }

// Generic N-level collapsible tree. Rows carry data-path ("0", "0-1", "0-1-2"…) + data-haschild for
// expandable rows. Clicking shows only direct children; collapsing hides + resets all descendants.
function wireTreePath(tbody, expandAll) {
  tbody.querySelectorAll('tr[data-haschild]').forEach(row => {
    row.addEventListener('click', () => {
      const path = row.dataset.path, depth = path.split('-').length;
      const exp = row.dataset.exp === '1';
      row.dataset.exp = exp ? '0' : '1';
      const c = row.querySelector('.caret'); if (c) c.textContent = exp ? '▸' : '▾';
      tbody.querySelectorAll('tr[data-path]').forEach(r => {
        const p = r.dataset.path;
        if (!p || p === path || !p.startsWith(path + '-')) return;
        const d = p.split('-').length;
        if (exp) { r.style.display = 'none'; if (d > depth) { r.dataset.exp = '0'; const rc = r.querySelector('.caret'); if (rc) rc.textContent = '▸'; } }
        else if (d === depth + 1) { r.style.display = ''; }
      });
    });
  });
  if (expandAll) {
    tbody.querySelectorAll('tr[data-path]').forEach(r => { r.style.display = ''; if (r.dataset.haschild) { r.dataset.exp = '1'; const c = r.querySelector('.caret'); if (c) c.textContent = '▾'; } });
  }
}

let effFulfilCombined = null, effSourceChart = null;

export function renderEfficiency(data) {
  if (!data || !data.funnel) return '<p>No data available.</p>';

  const cy = new Date().getFullYear();
  const years = [];
  for (let y = Math.max(cy, 2026); y >= 2024; y--) years.push(y);

  return `
    <style>
      .eff-subtabs { display:flex; gap:2px; flex-wrap:wrap; border-bottom:1px solid var(--border); margin-bottom:20px; }
      .eff-subtab { appearance:none; background:none; border:none; padding:9px 16px; font-size:13px; font-weight:500;
        color:var(--muted); cursor:pointer; border-bottom:2px solid transparent; margin-bottom:-1px; }
      .eff-subtab:hover { color:var(--text); }
      .eff-subtab.active { color:var(--accent); border-bottom-color:var(--accent); font-weight:600; }

      .eff-filters { background:#e4eaf4; border:1px solid #c3d0e8; border-radius:12px; padding:14px 18px; margin-bottom:18px;
        display:flex; flex-wrap:wrap; align-items:center; gap:14px; box-shadow:0 1px 2px rgba(15,23,42,0.06); }
      .eff-filters select, .eff-filters input[type=date] {
        appearance:none; -webkit-appearance:none; height:34px; padding:0 11px; border:1px solid var(--border);
        border-radius:8px; font-size:12px; font-weight:500; background:var(--card); color:var(--text); }
      .eff-filters select { padding-right:28px; cursor:pointer;
        background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%2364748b' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
        background-repeat:no-repeat; background-position:right 10px center; }
      .eff-filters select:hover, .eff-filters input:hover { border-color:var(--muted); }
      .eff-filters select:focus, .eff-filters input:focus { outline:none; border-color:var(--accent); box-shadow:0 0 0 3px rgba(78,107,166,0.16); }
      .eff-filters .fchip { display:flex; align-items:center; gap:7px; }
      .eff-filters .fchip > span.lbl { font-size:11px; font-weight:700; color:var(--accent); text-transform:uppercase; letter-spacing:0.04em; }
      .eff-filters .fchip > label.opt { font-size:12px; font-weight:500; display:flex; align-items:center; gap:4px; cursor:pointer; color:var(--text) }
      .eff-filters .fdiv { width:1px; align-self:stretch; background:#cdddf7; margin:2px 2px; }

      /* Velocity table — freeze the first two columns */
      .evel-table { width:auto; min-width:100%; border-collapse:separate; border-spacing:0; overflow:visible; }
      .evel-table th, .evel-table td { white-space:nowrap; }
      .evel-table th:not(:first-child), .evel-table td:not(:first-child) { text-align:right; }
      .evel-table th:nth-child(n+3), .evel-table td:nth-child(n+3) { min-width:56px; }
      .evel-table th:nth-child(1), .evel-table td:nth-child(1) { position:sticky; left:0; z-index:2; width:260px; min-width:260px; max-width:260px; text-align:left; white-space:normal; }
      .evel-table th:nth-child(2), .evel-table td:nth-child(2) { position:sticky; left:260px; z-index:2; min-width:96px; border-right:2px solid var(--border); }
      .evel-table thead th:nth-child(1), .evel-table thead th:nth-child(2) { z-index:3; background:var(--bg); }
      .evel-table tbody td:nth-child(1), .evel-table tbody td:nth-child(2) { background:var(--card); }

      /* per-pod chart placeholder cards */
      .eff-podcharts { display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:12px; margin-bottom:18px; }
      .eff-podchart { border:1px solid var(--border); border-radius:10px; padding:14px 16px; background:var(--card); min-height:110px;
        display:flex; flex-direction:column; gap:6px; }
      .eff-podchart h5 { font-size:12px; font-weight:600; color:var(--text); margin:0; }
      .eff-podchart p { font-size:11px; color:var(--muted); margin:0; line-height:1.5; }
    </style>

    <h2 class="section-title">Overall Efficiency</h2>
    <p class="sub-note" style="margin-top:-8px;">The Recruiter Efficiency views, aggregated <strong>without the recruiter</strong> — trees are <strong>Pod → Department → Job</strong>, charts are one per pod (Y = Job). Year/Quarter drives the quarter (pod grouping + capacity). Attributing jobs to a pod needs the recruiter×job rollup (pipeline), so metric cells show <span class="zero">—</span> until then; Fulfilment pod targets and the org-wide Sourcing chart are live.</p>

    <div class="eff-filters">
      <div class="fchip"><span class="lbl">Pod</span><div class="ms" id="effMsPod"></div></div>
      <div class="fchip"><span class="lbl">Department</span><div class="ms" id="effMsDept"></div></div>
      <div class="fchip"><span class="lbl">Job</span><div class="ms" id="effMsJob"></div></div>
      <div class="fchip"><label class="opt"><input type="checkbox" id="effExpandAll"> Expand all branches</label></div>
      <span class="fdiv"></span>
      <div class="fchip"><span class="lbl">From</span><input type="date" id="effVelFrom"></div>
      <div class="fchip"><span class="lbl">To</span><input type="date" id="effVelTo"></div>
      <div class="fchip"><span class="lbl">Year</span><select id="effYear"><option value="">All</option>${years.map(y => `<option value="${y}">${y}</option>`).join('')}</select></div>
      <div class="fchip"><span class="lbl">Quarter</span><select id="effQuarter"><option value="">All</option><option value="Q1">Q1</option><option value="Q2">Q2</option><option value="Q3">Q3</option><option value="Q4">Q4</option></select></div>
    </div>

    <div class="eff-subtabs">
      <button class="eff-subtab active" data-tab="fulfilment">Fulfilment</button>
      <button class="eff-subtab" data-tab="velocity">Submission Velocity</button>
      <button class="eff-subtab" data-tab="screening">Screening Efficiency</button>
      <button class="eff-subtab" data-tab="throughput">Throughput</button>
      <button class="eff-subtab" data-tab="joining">Joining Conversion</button>
      <button class="eff-subtab" data-tab="sourcing">Sourcing Mix</button>
    </div>

    <!-- PANEL: Fulfilment -->
    <div class="eff-panel" data-panel="fulfilment">
      <p class="sub-note"><strong>Non-Sales</strong> pods are measured on <strong>Offers</strong>, the <strong>Sales</strong> pod on <strong>Hires</strong>. <strong>Target Score = summed pod capacity</strong> (per quarter, from Metric Configuration) — this pod total is live; per-job Assigned/Offered/Hired/Gap need the pipeline.</p>
      <div class="eff-podcharts" id="effFulfilPodCharts"></div>
      <div class="chart-wrap" style="max-width:520px;margin:0 0 18px"><canvas id="effFulfilCombined"></canvas></div>

      <h4 style="font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:0.04em;margin:14px 0 6px">Fulfilment — Non-Sales (Offers)</h4>
      <div class="scroll-table"><table>
        <thead>
          <tr><th rowspan="2" style="min-width:260px">Pod / Department / Job</th><th colspan="2" class="stage-hdr">Assigned</th><th rowspan="2" class="stage-hdr">Target<br><span style="font-weight:400;text-transform:none">Score</span></th><th colspan="2" class="stage-hdr">Offered</th><th colspan="2" class="stage-hdr">Joining Pending</th><th rowspan="2" class="stage-hdr">Gap<br><span style="font-weight:400;text-transform:none">Score</span></th></tr>
          <tr><th class="stage-sub">HC</th><th class="stage-sub">Score</th><th class="stage-sub">HC</th><th class="stage-sub">Score</th><th class="stage-sub">HC</th><th class="stage-sub">Score</th></tr>
        </thead>
        <tbody id="effFulfilOfferBody"></tbody>
      </table></div>

      <h4 style="font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:0.04em;margin:18px 0 6px">Fulfilment — Sales (Hires)</h4>
      <div class="scroll-table"><table>
        <thead>
          <tr><th rowspan="2" style="min-width:260px">Pod / Department / Job</th><th colspan="2" class="stage-hdr">Assigned</th><th rowspan="2" class="stage-hdr">Target<br><span style="font-weight:400;text-transform:none">Score</span></th><th colspan="2" class="stage-hdr">Offered</th><th colspan="2" class="stage-hdr">Joining Pending</th><th colspan="2" class="stage-hdr">Hired</th><th rowspan="2" class="stage-hdr">Gap<br><span style="font-weight:400;text-transform:none">Score</span></th></tr>
          <tr><th class="stage-sub">HC</th><th class="stage-sub">Score</th><th class="stage-sub">HC</th><th class="stage-sub">Score</th><th class="stage-sub">HC</th><th class="stage-sub">Score</th><th class="stage-sub">HC</th><th class="stage-sub">Score</th></tr>
        </thead>
        <tbody id="effFulfilHireBody"></tbody>
      </table></div>
    </div>

    <!-- PANEL: Submission Velocity -->
    <div class="eff-panel" data-panel="velocity" style="display:none">
      <p class="sub-note" style="color:var(--orange)">Structure preview — Pod → Department → Job → Stage (OA / HM Screening / R1) across the last 30 days of the selected range. Per-day / per-stage cells need the job×stage×date rollup (pipeline redesign).</p>
      <div class="eff-podcharts" id="effVelPodCharts"></div>
      <div class="scroll-table"><table class="evel-table">
        <thead id="effVelHead"></thead>
        <tbody id="effVelBody"></tbody>
      </table></div>
    </div>

    <!-- PANEL: Screening Efficiency -->
    <div class="eff-panel" data-panel="screening" style="display:none">
      <p class="sub-note">Added = reached the stage; Cleared = transitioned out (reached the next stage). Per Department/Job values need the job×stage rollup (pipeline).</p>
      <div class="eff-podcharts" id="effScreenPodCharts"></div>
      <div class="scroll-table"><table>
        <thead>
          <tr><th rowspan="2" style="min-width:260px">Pod / Department / Job</th><th colspan="3" class="stage-hdr">HM Screening</th><th colspan="3" class="stage-hdr">Online Assessment</th><th colspan="3" class="stage-hdr">R1</th></tr>
          <tr><th class="stage-sub">Added</th><th class="stage-sub">Cleared</th><th class="stage-sub">%</th><th class="stage-sub">Added</th><th class="stage-sub">Cleared</th><th class="stage-sub">%</th><th class="stage-sub">Added</th><th class="stage-sub">Cleared</th><th class="stage-sub">%</th></tr>
        </thead>
        <tbody id="effScreenBody"></tbody>
      </table></div>
    </div>

    <!-- PANEL: Throughput (mirrors HM) -->
    <div class="eff-panel" data-panel="throughput" style="display:none">
      <p class="sub-note">In = candidates who entered the stage (cumulative). Out = candidates who moved past it. Throughput = Out/In %. Per Department/Job values need the job×stage rollup (pipeline).</p>
      <div style="display:flex;flex-wrap:wrap;gap:12px 16px;margin-bottom:12px;font-size:12px;align-items:center">
        <span style="font-weight:600;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:0.04em">Stages</span>
        ${TP_KEYS.map(k => `<label style="display:flex;align-items:center;gap:5px;cursor:pointer"><input type="checkbox" class="eff-tpStage" value="${k}" checked> ${TP_LABELS[k]}</label>`).join('')}
      </div>
      <div class="eff-podcharts" id="effTpPodCharts"></div>
      <div class="scroll-table"><table>
        <thead id="effTpHead"></thead>
        <tbody id="effTpBody"></tbody>
      </table></div>
    </div>

    <!-- PANEL: Joining Conversion -->
    <div class="eff-panel" data-panel="joining" style="display:none">
      <p class="sub-note">Offered → Hired, by pod. Per Department/Job values need the job×stage rollup (pipeline).</p>
      <div class="eff-podcharts" id="effJoinPodCharts"></div>
      <div class="scroll-table"><table>
        <thead><tr><th style="min-width:260px">Pod / Department / Job</th><th>Offered</th><th>Hired</th><th>Conversion %</th></tr></thead>
        <tbody id="effJoinBody"></tbody>
      </table></div>
    </div>

    <!-- PANEL: Sourcing Mix -->
    <div class="eff-panel" data-panel="sourcing" style="display:none">
      <p class="sub-note"><strong>Pod → Department → Category → Source.</strong> Category = Ashby <code>source_type</code> (Sourced / Referral / Inbound / Internal). The <strong>org-wide channel mix below is live</strong> (from the source rollup); the per-pod / per-department split needs the pipeline.</p>
      <h3 class="subsection-title">Org-wide Channel Mix</h3>
      <div class="chart-wrap" style="max-width:400px;margin:0 auto 20px"><canvas id="effSourceChart"></canvas></div>
      <div class="scroll-table"><table>
        <thead><tr><th style="min-width:340px">Pod / Department / Category / Source</th><th>Count</th><th>%</th></tr></thead>
        <tbody id="effSourceBody"></tbody>
      </table></div>
    </div>
  `;
}

export function initEfficiencyFilters(data) {
  if (!data || !data.funnel) return;
  const jobs = data.jobs || [];
  const recruiters = data.recruiters || [];
  let activeTab = 'fulfilment';
  let msPod = null, msDept = null, msJob = null;

  const expandAll = () => !!document.getElementById('effExpandAll')?.checked;

  function selQuarter() {
    const y = document.getElementById('effYear')?.value;
    const q = document.getElementById('effQuarter')?.value;
    return (y && q) ? qKey(y, q) : currentQuarter();
  }

  // Recruiters mapped to a pod for the selected quarter — used only for the live capacity sums.
  function podMembers(pod, q) { return recruiters.filter(r => podOf(r.name, q) === pod); }
  function podCapacity(pod, q) { return podMembers(pod, q).reduce((s, r) => s + (capacityOf(r.name, q) || 0), 0); }

  // Which pods are visible given the Pod multi-select ([] = all).
  function visiblePods() {
    const sel = msPod ? msPod.getSelected() : [];
    return POD_ORDER.filter(p => sel.length === 0 || sel.includes(p));
  }

  // Styled multi-select checkbox dropdown. Returns { getSelected }; empty selection = "All".
  function makeMultiSelect(container, label, options, onChange) {
    if (!container) return null;
    const selected = new Set();
    const labelText = () => selected.size === 0 ? `${label}: All` : (selected.size === 1 ? `${label}: ${[...selected][0]}` : `${label}: ${selected.size} selected`);
    container.classList.add('ms');
    container.innerHTML = `<button type="button" class="ms-btn"></button><div class="ms-panel" style="display:none">${options.map(o => `<label class="ms-opt"><input type="checkbox" value="${String(o).replace(/"/g, '&quot;')}"> ${o}</label>`).join('') || '<span style="font-size:11px;color:var(--muted);padding:4px 8px">No options yet</span>'}</div>`;
    const btn = container.querySelector('.ms-btn'), panel = container.querySelector('.ms-panel');
    btn.textContent = labelText();
    btn.addEventListener('click', (e) => { e.stopPropagation(); const open = panel.style.display !== 'none'; document.querySelectorAll('.ms-panel').forEach(p => p.style.display = 'none'); panel.style.display = open ? 'none' : 'block'; });
    panel.addEventListener('click', e => e.stopPropagation());
    container.querySelectorAll('input[type=checkbox]').forEach(cb => cb.addEventListener('change', () => { if (cb.checked) selected.add(cb.value); else selected.delete(cb.value); btn.textContent = labelText(); onChange(); }));
    return { getSelected: () => [...selected] };
  }

  const PENDING = 'Department → Job — pending job→pod attribution (pipeline)';

  // Skeleton body: Pod header rows + one pending child per pod. cellsFn(pod, q, isPodRow) returns the
  // metric <td>s for the pod row; the pending child fills metric columns with —.
  function podSkeletonBody(tbodyId, metricCols, cellsFn, grandRow) {
    const body = document.getElementById(tbodyId);
    if (!body) return;
    const pods = visiblePods();
    let html = '';
    pods.forEach((pod, pi) => {
      html += `<tr data-path="${pi}" data-haschild data-exp="0" style="cursor:pointer;background:var(--border-light)">
        <td style="font-weight:600">${CARET}${pod}</td>${cellsFn(pod)}</tr>`;
      html += `<tr data-path="${pi}-0" style="display:none">
        <td style="padding-left:32px;color:var(--muted);font-style:italic">${PENDING}</td>${dashTds(metricCols)}</tr>`;
    });
    if (grandRow) html += grandRow;
    body.innerHTML = html || `<tr><td colspan="${metricCols + 1}" style="text-align:center;color:var(--muted);padding:16px">No pods match the filter.</td></tr>`;
    wireTreePath(body, expandAll());
  }

  function renderFulfilment() {
    const q = selQuarter();
    const pods = visiblePods();
    // Non-Sales (offers, 8 metric cols) and Sales (hires, 10 metric cols).
    const offerCells = (pod) => {
      const cap = podCapacity(pod, q);
      return `<td>${DASH}</td><td>${DASH}</td><td style="font-weight:600">${cap || DASH}</td><td>${DASH}</td><td>${DASH}</td><td>${DASH}</td><td>${DASH}</td><td>${DASH}</td>`;
    };
    const hireCells = (pod) => {
      const cap = podCapacity(pod, q);
      return `<td>${DASH}</td><td>${DASH}</td><td style="font-weight:600">${cap || DASH}</td><td>${DASH}</td><td>${DASH}</td><td>${DASH}</td><td>${DASH}</td><td>${DASH}</td><td>${DASH}</td><td>${DASH}</td>`;
    };
    const nonSales = pods.filter(p => !isSalesPod(p));
    const sales = pods.filter(p => isSalesPod(p));
    const grand = (list, cols, targetCol) => {
      const total = list.reduce((s, p) => s + podCapacity(p, q), 0);
      const before = targetCol - 1; // metric cells before Target
      return `<tr style="background:var(--accent-light);font-weight:700"><td>Overall Total needed</td>${dashTds(before)}<td>${total || DASH}</td>${dashTds(cols - targetCol)}</tr>`;
    };
    // Non-Sales table
    renderPodTable('effFulfilOfferBody', 8, offerCells, nonSales, grand(nonSales, 8, 3));
    // Sales table
    renderPodTable('effFulfilHireBody', 10, hireCells, sales, grand(sales, 10, 3));
    renderFulfilCharts(pods, q);
  }

  // Variant of podSkeletonBody scoped to a specific pod list (Fulfilment splits Sales/Non-Sales).
  function renderPodTable(tbodyId, metricCols, cellsFn, podList, grandRow) {
    const body = document.getElementById(tbodyId);
    if (!body) return;
    let html = '';
    podList.forEach((pod, pi) => {
      html += `<tr data-path="${pi}" data-haschild data-exp="0" style="cursor:pointer;background:var(--border-light)">
        <td style="font-weight:600">${CARET}${pod}<span style="color:var(--muted);font-weight:400;font-size:11px;margin-left:6px">Total of Pod</span></td>${cellsFn(pod)}</tr>`;
      html += `<tr data-path="${pi}-0" style="display:none">
        <td style="padding-left:32px;color:var(--muted);font-style:italic">${PENDING}</td>${dashTds(metricCols)}</tr>`;
    });
    if (grandRow) html += grandRow;
    body.innerHTML = html || `<tr><td colspan="${metricCols + 1}" style="text-align:center;color:var(--muted);padding:16px">No pods in this group.</td></tr>`;
    wireTreePath(body, expandAll());
  }

  function renderScreening() {
    podSkeletonBody('effScreenBody', 9, () => dashTds(9));
  }

  function renderJoining() {
    podSkeletonBody('effJoinBody', 3, () => dashTds(3));
  }

  function renderThroughput() {
    const vis = TP_KEYS.filter(k => { const cb = document.querySelector(`.eff-tpStage[value="${k}"]`); return !cb || cb.checked; });
    const head = document.getElementById('effTpHead');
    if (head) {
      let r1 = '<tr><th rowspan="2" style="min-width:260px">Pod / Department / Job</th>';
      vis.forEach(k => { r1 += `<th colspan="3" class="stage-hdr">${TP_LABELS[k]}</th>`; });
      r1 += '</tr><tr>';
      vis.forEach(() => { r1 += '<th class="stage-sub">In</th><th class="stage-sub">Out</th><th class="stage-sub">%</th>'; });
      r1 += '</tr>';
      head.innerHTML = r1;
    }
    podSkeletonBody('effTpBody', vis.length * 3, () => dashTds(vis.length * 3));
  }

  // ===== Submission Velocity (Pod → Department → Job → Stage; last 30 days of range, descending) =====
  function velDates() {
    const toV = document.getElementById('effVelTo')?.value;
    const fromV = document.getElementById('effVelFrom')?.value;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let end = toV ? new Date(toV + 'T00:00:00') : today;
    if (end > today) end = today;
    const start = fromV ? new Date(fromV + 'T00:00:00') : null;
    const out = [];
    for (let i = 0; i < 30; i++) { const d = new Date(end); d.setDate(end.getDate() - i); if (start && d < start) break; out.push(d); }
    return out;
  }
  function applyVelYearQuarter() {
    const y = document.getElementById('effYear')?.value || '';
    const q = document.getElementById('effQuarter')?.value || '';
    const fromEl = document.getElementById('effVelFrom'), toEl = document.getElementById('effVelTo');
    if (!fromEl || !toEl || (!y && !q)) return;
    const yr = y || String(new Date().getFullYear());
    if (q) {
      const qi = parseInt(q.slice(1), 10); const sm = (qi - 1) * 3 + 1; const em = sm + 2;
      const last = new Date(parseInt(yr, 10), em, 0).getDate();
      fromEl.value = `${yr}-${String(sm).padStart(2, '0')}-01`;
      toEl.value = `${yr}-${String(em).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
    } else { fromEl.value = `${yr}-01-01`; toEl.value = `${yr}-12-31`; }
  }
  function renderVelocity() {
    const head = document.getElementById('effVelHead');
    const body = document.getElementById('effVelBody');
    if (!body) return;
    const pods = visiblePods();
    const dates = velDates();
    if (head) {
      let h = '<tr><th style="min-width:260px">Pod / Department / Job / Stage</th><th>Total - 30 days</th>';
      dates.forEach(d => { h += `<th>${MON[d.getMonth()]} ${d.getDate()}</th>`; });
      h += '</tr>';
      head.innerHTML = h;
    }
    const cols = dates.length + 1; // Total-30 + dates
    let html = '';
    pods.forEach((pod, pi) => {
      html += `<tr data-path="${pi}" data-haschild data-exp="0" style="cursor:pointer;background:var(--border-light)">
        <td style="font-weight:600">${CARET}${pod}</td>${dashTds(cols)}</tr>`;
      html += `<tr data-path="${pi}-0" style="display:none">
        <td style="padding-left:32px;color:var(--muted);font-style:italic">${PENDING} → Stage</td>${dashTds(cols)}</tr>`;
    });
    body.innerHTML = html || `<tr><td colspan="${cols + 1}" style="text-align:center;color:var(--muted);padding:16px">No pods match the filter.</td></tr>`;
    wireTreePath(body, expandAll());
    renderPodChartCards('effVelPodCharts', pods, 'day-wise submissions stacked by day');
  }

  // ===== Sourcing Mix — Pod → Department → Category → Source; org-wide chart is live =====
  function renderSourcing() {
    const pods = visiblePods();
    const body = document.getElementById('effSourceBody');
    if (body) {
      const CATS = ['Sourced', 'Referral', 'Inbound', 'Internal'];
      let html = '';
      pods.forEach((pod, pi) => {
        html += `<tr data-path="${pi}" data-haschild data-exp="0" style="cursor:pointer;background:var(--border-light)">
          <td style="font-weight:600">${CARET}${pod}</td><td>${DASH}</td><td>${DASH}</td></tr>`;
        html += `<tr data-path="${pi}-0" style="display:none">
          <td style="padding-left:32px;color:var(--muted);font-style:italic">Department → Category → Source — pending job→pod attribution (pipeline)</td><td>${DASH}</td><td>${DASH}</td></tr>`;
      });
      body.innerHTML = html || `<tr><td colspan="3" style="text-align:center;color:var(--muted);padding:16px">No pods match the filter.</td></tr>`;
      wireTreePath(body, expandAll());
    }
    buildSourceChart();
  }

  // ===== charts =====
  const C = { blue: '#4E6BA6', green: '#398AA2', cyan: '#1E7590', amber: '#D8B5BE', slate: '#938FB8' };
  const gridY = { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { font: { size: 11 } } };

  // Per-pod chart placeholders (Y=Job lights up with the pipeline).
  function renderPodChartCards(containerId, pods, what) {
    const el = document.getElementById(containerId); if (!el) return;
    el.innerHTML = pods.map(p => `<div class="eff-podchart"><h5>${p}</h5><p>Y = Job · ${what} — pending job→pod attribution (pipeline).</p></div>`).join('');
  }

  function renderFulfilCharts(pods, q) {
    // Per-pod placeholder cards (Y=Job) + a live combined chart of pod Target (summed capacity).
    renderPodChartCards('effFulfilPodCharts', pods, 'Target vs Gap (Score)');
    const ctx = document.getElementById('effFulfilCombined'); if (!ctx) return;
    if (effFulfilCombined) effFulfilCombined.destroy();
    const rows = pods.map(p => ({ pod: p, cap: podCapacity(p, q) })).filter(r => r.cap > 0);
    const wrap = ctx.parentElement;
    let emptyMsg = wrap && wrap.querySelector('.chart-empty');
    if (rows.length === 0) {
      ctx.style.display = 'none';
      if (wrap && !emptyMsg) { emptyMsg = document.createElement('div'); emptyMsg.className = 'chart-empty'; emptyMsg.style.cssText = 'display:flex;align-items:center;justify-content:center;min-height:120px;color:var(--muted);font-size:13px;text-align:center;padding:20px'; wrap.appendChild(emptyMsg); }
      if (emptyMsg) { emptyMsg.textContent = `No pod capacities set for ${q.replace('-', ' ')} — set them in Recruiter Efficiency → Metric Configuration.`; emptyMsg.style.display = 'flex'; }
      return;
    }
    ctx.style.display = ''; if (emptyMsg) emptyMsg.style.display = 'none';
    effFulfilCombined = new Chart(ctx, { type: 'bar',
      data: { labels: rows.map(r => r.pod), datasets: [{ label: 'Target (summed capacity)', data: rows.map(r => r.cap), backgroundColor: C.blue, borderRadius: 4, barPercentage: 0.6 }] },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top', align: 'center', labels: { usePointStyle: true, pointStyle: 'rect', boxWidth: 11, boxHeight: 11, font: { size: 12 } } } },
        scales: { x: { ...gridY, title: { display: true, text: 'Target Score', font: { size: 11 }, color: '#64748b' } }, y: { grid: { display: false }, ticks: { font: { size: 11, weight: '500' } } } } } });
  }

  function buildSourceChart() {
    const ctx = document.getElementById('effSourceChart'); if (!ctx) return;
    if (effSourceChart) effSourceChart.destroy();
    const sources = (data.sources || []).filter(s => (s.candidates || 0) > 0);
    const wrap = ctx.parentElement;
    let emptyMsg = wrap && wrap.querySelector('.chart-empty');
    if (sources.length === 0) {
      ctx.style.display = 'none';
      if (wrap && !emptyMsg) { emptyMsg = document.createElement('div'); emptyMsg.className = 'chart-empty'; emptyMsg.style.cssText = 'display:flex;align-items:center;justify-content:center;min-height:120px;color:var(--muted);font-size:13px;text-align:center;padding:20px'; wrap.appendChild(emptyMsg); }
      if (emptyMsg) { emptyMsg.textContent = 'No source data available yet.'; emptyMsg.style.display = 'flex'; }
      return;
    }
    ctx.style.display = ''; if (emptyMsg) emptyMsg.style.display = 'none';
    const colorMap = { Referral: '#4E6BA6', Inbound: '#398AA2', Sourced: '#D8B5BE', Internal: '#938FB8' };
    effSourceChart = new Chart(ctx, { type: 'doughnut',
      data: { labels: sources.map(s => s.name), datasets: [{ data: sources.map(s => s.candidates), backgroundColor: sources.map(s => colorMap[s.name] || '#A9CAD6') }] },
      options: { responsive: true, plugins: { legend: { position: 'bottom' } } } });
  }

  function renderActive() {
    if (activeTab === 'fulfilment') renderFulfilment();
    else if (activeTab === 'velocity') renderVelocity();
    else if (activeTab === 'screening') { renderScreening(); renderPodChartCards('effScreenPodCharts', visiblePods(), 'Added vs Cleared per stage'); }
    else if (activeTab === 'throughput') { renderThroughput(); renderPodChartCards('effTpPodCharts', visiblePods(), 'In vs Out per stage'); }
    else if (activeTab === 'joining') { renderJoining(); renderPodChartCards('effJoinPodCharts', visiblePods(), 'Offered vs Hired'); }
    else if (activeTab === 'sourcing') renderSourcing();
  }

  function renderAll() {
    // Re-render every panel so switching tabs shows current filters immediately.
    renderFulfilment();
    renderVelocity();
    renderScreening(); renderPodChartCards('effScreenPodCharts', visiblePods(), 'Added vs Cleared per stage');
    renderThroughput(); renderPodChartCards('effTpPodCharts', visiblePods(), 'In vs Out per stage');
    renderJoining(); renderPodChartCards('effJoinPodCharts', visiblePods(), 'Offered vs Hired');
    renderSourcing();
  }

  function showTab(name) {
    activeTab = name;
    document.querySelectorAll('.eff-subtab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.eff-panel').forEach(p => { p.style.display = p.dataset.panel === name ? '' : 'none'; });
    renderActive();
  }
  document.querySelectorAll('.eff-subtab').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));

  // Filters
  const deptNames = [...new Set(jobs.map(j => resolveDeptTeam(j.department).dept).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const jobNames = [...new Set(jobs.map(j => j.title || j.name || j.job).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  msPod = makeMultiSelect(document.getElementById('effMsPod'), 'Pod', POD_ORDER, renderAll);
  msDept = makeMultiSelect(document.getElementById('effMsDept'), 'Department', deptNames, renderAll);
  msJob = makeMultiSelect(document.getElementById('effMsJob'), 'Job', jobNames, renderAll);
  document.addEventListener('click', () => document.querySelectorAll('.ms-panel').forEach(p => p.style.display = 'none'));
  document.getElementById('effExpandAll')?.addEventListener('change', renderAll);
  document.querySelectorAll('.eff-tpStage').forEach(cb => cb.addEventListener('change', renderThroughput));

  ['effVelFrom', 'effVelTo'].forEach(id => document.getElementById(id)?.addEventListener('change', renderVelocity));
  ['effYear', 'effQuarter'].forEach(id => document.getElementById(id)?.addEventListener('change', () => { applyVelYearQuarter(); renderAll(); }));

  // Default Year+Quarter to current
  const vy = document.getElementById('effYear'), vq = document.getElementById('effQuarter');
  if (vy) { const nowY = String(new Date().getFullYear()); vy.value = [...vy.options].some(o => o.value === nowY) ? nowY : (vy.options[1] ? vy.options[1].value : ''); }
  if (vq) vq.value = 'Q' + (Math.floor(new Date().getMonth() / 3) + 1);
  applyVelYearQuarter();

  renderAll();
  showTab('fulfilment');
}
