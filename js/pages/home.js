import { getData } from '../data.js';

export function renderHome(access) {
  const data = getData();
  if (!data) return '<p>Loading...</p>';

  const totalOpen = data.openings?.reduce((s, o) => s + o.open, 0) || 0;
  const f = data.funnel || {};
  const totalPositions = (f.hired || 0) + totalOpen;
  const totalFilled = f.hired || 0;
  const fillRate = totalPositions > 0 ? ((totalFilled / totalPositions) * 100).toFixed(1) : '0.0';
  const convRate = f.applied > 0 ? ((f.hired / f.applied) * 100).toFixed(1) : '0.0';

  const topJobs = (data.jobs || [])
    .filter(j => j.applied > 0)
    .sort((a, b) => b.applied - a.applied)
    .slice(0, 5);

  const deptMap = {};
  (data.openings || []).forEach(o => {
    if (!deptMap[o.department]) deptMap[o.department] = { open: 0, filled: 0 };
    deptMap[o.department].open += o.open;
    deptMap[o.department].filled += o.filled;
  });
  const deptArr = Object.entries(deptMap).sort((a, b) => (b[1].open + b[1].filled) - (a[1].open + a[1].filled));
  const maxDeptTotal = deptArr.length > 0 ? deptArr[0][1].open + deptArr[0][1].filled : 1;

  return `
    <!-- Welcome + Period Selector -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;gap:24px;">
      <div>
        <h2 style="font-size:20px;font-weight:700;margin-bottom:4px;">Welcome to IK Hiring Dashboard</h2>
        <p style="color:var(--muted);font-size:13px;">Your talent acquisition command center. Track openings, pipeline, and hiring performance across InterviewKickstart.</p>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
        <span style="font-size:11px;color:var(--muted);font-weight:500;text-transform:uppercase;letter-spacing:.3px;">Period</span>
        <select id="period-selector" style="padding:7px 12px;border:1px solid var(--border);border-radius:6px;font-size:13px;font-weight:500;background:var(--card);color:var(--text);cursor:pointer;min-width:120px;">
          <option value="2026" selected>2026</option>
          <option value="2025">2025</option>
          <option value="2024">2024</option>
          <optgroup label="2026 Quarters">
            <option value="2026-Q1">Q1 2026</option>
            <option value="2026-Q2">Q2 2026</option>
            <option value="2026-Q3">Q3 2026</option>
            <option value="2026-Q4">Q4 2026</option>
          </optgroup>
          <optgroup label="2025 Quarters">
            <option value="2025-Q1">Q1 2025</option>
            <option value="2025-Q2">Q2 2025</option>
            <option value="2025-Q3">Q3 2025</option>
            <option value="2025-Q4">Q4 2025</option>
          </optgroup>
          <optgroup label="2024 Quarters">
            <option value="2024-Q1">Q1 2024</option>
            <option value="2024-Q2">Q2 2024</option>
            <option value="2024-Q3">Q3 2024</option>
            <option value="2024-Q4">Q4 2024</option>
          </optgroup>
        </select>
      </div>
    </div>

    <div id="home-data-area">
    <!-- KPI Cards -->
    <div style="margin-bottom:24px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
        <div style="width:4px;height:18px;background:var(--accent);border-radius:2px;"></div>
        <h3 style="margin:0;font-size:14px;font-weight:600;color:var(--text);">Key Metrics — 2026</h3>
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;">
        <div class="card">
          <div class="label">Total Positions</div>
          <div class="value">${totalPositions}</div>
          <div class="sub">${totalOpen} open · ${totalFilled} filled</div>
        </div>
        <div class="card">
          <div class="label">Fill Rate</div>
          <div class="value" style="color:var(--green)">${fillRate}%</div>
          <div class="sub">${totalFilled} of ${totalPositions} filled</div>
        </div>
        <div class="card">
          <div class="label">Total Applications</div>
          <div class="value">${(f.applied || 0).toLocaleString()}</div>
        </div>
        <div class="card">
          <div class="label">Total Hired</div>
          <div class="value" style="color:var(--green)">${(f.hired || 0).toLocaleString()}</div>
          <div class="sub">${convRate}% conversion</div>
        </div>
      </div>
    </div>

    <!-- Pipeline visual -->
    <div class="card" style="padding:16px;margin-bottom:24px;">
      <h3 style="margin:0 0 12px;">Hiring Pipeline</h3>
      <div style="display:flex;align-items:center;gap:0;">
        ${renderPipelineArrow('Applied', f.applied || 0, '#4f46e5', true)}
        ${renderPipelineArrow('Screened', f.screened || 0, '#6366f1', false)}
        ${renderPipelineArrow('Interviewed', f.interviewed || 0, '#2563eb', false)}
        ${renderPipelineArrow('Offered', f.offered || 0, '#0891b2', false)}
        ${renderPipelineArrow('Hired', f.hired || 0, '#16a34a', false, true)}
      </div>
    </div>

    <!-- Two column: Top Jobs + Departments -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
      <div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
          <div style="width:4px;height:18px;background:var(--accent);border-radius:2px;"></div>
          <h3 style="margin:0;">Top Jobs by Applications</h3>
        </div>
        <div style="background:var(--card);border:1px solid var(--border);border-radius:8px;overflow:hidden;">
          ${topJobs.map((j, i) => {
            const pct = topJobs[0].applied > 0 ? Math.max(Math.round((j.applied / topJobs[0].applied) * 100), 3) : 0;
            return `
              <div style="padding:8px 12px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;${i === topJobs.length - 1 ? 'border:none;' : ''}">
                <span style="font-size:11px;color:var(--muted);width:16px;text-align:right;">${i + 1}</span>
                <div style="flex:1;min-width:0;">
                  <div style="font-weight:500;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${j.title}</div>
                  <div style="margin-top:4px;background:#f1f5f9;border-radius:3px;height:6px;overflow:hidden;">
                    <div style="width:${pct}%;height:100%;background:var(--accent);border-radius:3px;"></div>
                  </div>
                </div>
                <div style="text-align:right;white-space:nowrap;">
                  <div style="font-weight:700;font-size:13px;">${j.applied.toLocaleString()}</div>
                  <div style="font-size:10px;color:var(--green);font-weight:600;">${j.hired} hired</div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
          <div style="width:4px;height:18px;background:var(--green);border-radius:2px;"></div>
          <h3 style="margin:0;">Positions by Department</h3>
        </div>
        <div style="background:var(--card);border:1px solid var(--border);border-radius:8px;overflow:hidden;">
          ${deptArr.slice(0, 6).map(([ dept, v ], i) => {
            const filledPct = Math.round((v.filled / maxDeptTotal) * 100);
            const openPct = Math.round((v.open / maxDeptTotal) * 100);
            return `
              <div style="padding:8px 12px;border-bottom:1px solid var(--border);${i === Math.min(deptArr.length, 6) - 1 ? 'border:none;' : ''}">
                <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                  <span style="font-weight:500;font-size:12px;">${dept}</span>
                  <span style="font-size:12px;"><span class="good">${v.filled}</span> <span style="color:var(--muted)">/ ${v.open + v.filled}</span></span>
                </div>
                <div style="display:flex;height:6px;border-radius:3px;overflow:hidden;background:#f1f5f9;">
                  <div style="width:${filledPct}%;background:var(--green);"></div>
                  <div style="width:${openPct}%;background:var(--blue);"></div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </div>
    </div>
  `;
}

export function initHomeFilters() {
  const sel = document.getElementById('period-selector');
  if (!sel) return;
  sel.addEventListener('change', () => {
    const val = sel.value;
    const content = document.getElementById('home-data-area');
    if (!content) return;
    const is2026 = val === '2026' || val.startsWith('2026-');
    if (is2026) {
      content.style.opacity = '1';
      const msg = document.getElementById('period-msg');
      if (msg) msg.remove();
    } else {
      content.style.opacity = '0.3';
      if (!document.getElementById('period-msg')) {
        const div = document.createElement('div');
        div.id = 'period-msg';
        div.style.cssText = 'text-align:center;padding:24px;margin-bottom:16px;background:var(--card);border:1px solid var(--border);border-radius:8px;';
        div.innerHTML = `<p style="color:var(--muted);font-size:13px;">No data available for <strong>${val}</strong>. Currently only 2026 data is loaded.</p>`;
        content.parentNode.insertBefore(div, content);
      }
    }
  });
}

function renderPipelineArrow(label, value, color, isFirst, isLast) {
  return `
    <div style="flex:1;text-align:center;position:relative;">
      <div style="background:${color};color:#fff;padding:8px 4px;font-size:11px;font-weight:700;
        ${isFirst ? 'border-radius:6px 0 0 6px;' : ''}
        ${isLast ? 'border-radius:0 6px 6px 0;' : ''}
      ">
        ${value.toLocaleString()}
      </div>
      <div style="font-size:10px;color:var(--muted);margin-top:4px;">${label}</div>
      ${!isLast ? `<svg style="position:absolute;right:-6px;top:4px;z-index:1;" width="12" height="22" viewBox="0 0 12 22"><path d="M0 0L10 11L0 22" fill="${color}"/></svg>` : ''}
    </div>
  `;
}
