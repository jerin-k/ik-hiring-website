import { getData } from '../data.js';

export function renderHome(access) {
  const data = getData();
  if (!data) return '<p>Loading...</p>';

  const years = new Set();
  if (data.quarterly) {
    Object.keys(data.quarterly).forEach(k => years.add(k.split('-')[0]));
  }
  const sortedYears = [...years].sort().reverse();
  if (sortedYears.length === 0) sortedYears.push(new Date().getFullYear().toString());

  return `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;gap:24px;">
      <div>
        <h2 style="font-size:16px;font-weight:600;margin-bottom:2px;letter-spacing:-0.01em;">Overview</h2>
        <p style="color:var(--muted);font-size:12px;">Talent acquisition performance across InterviewKickstart.</p>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
        <select id="period-selector" style="padding:6px 12px;border:1px solid var(--border);border-radius:6px;font-size:12px;font-weight:500;background:var(--card);color:var(--text);cursor:pointer;min-width:110px;">
          ${sortedYears.map(y => `<option value="${y}">${y}</option>`).join('')}
          ${sortedYears.map(y => `
            <optgroup label="${y} Quarters">
              <option value="${y}-Q1">Q1 ${y}</option>
              <option value="${y}-Q2">Q2 ${y}</option>
              <option value="${y}-Q3">Q3 ${y}</option>
              <option value="${y}-Q4">Q4 ${y}</option>
            </optgroup>
          `).join('')}
        </select>
      </div>
    </div>
    <div id="home-data-area"></div>
  `;
}

export function initHomeFilters() {
  const sel = document.getElementById('period-selector');
  if (!sel) return;

  function renderData() {
    const data = getData();
    if (!data) return;
    const val = sel.value;
    const container = document.getElementById('home-data-area');
    if (!container) return;

    let f, topJobs, openingsArr, periodLabel;

    const isQuarter = val.includes('-Q');
    const year = val.split('-')[0];

    if (isQuarter && data.quarterly && data.quarterly[val]) {
      const q = data.quarterly[val];
      f = q.funnel;
      topJobs = q.topJobs || [];
      openingsArr = (data.openings || []).filter(o => {
        if (!o.openedAt) return false;
        const qk = getQuarterFromDate(o.openedAt);
        return qk === val;
      });
      periodLabel = val.replace('-', ' ');
    } else if (isQuarter) {
      f = { applied: 0, screened: 0, interviewed: 0, offered: 0, hired: 0 };
      topJobs = [];
      openingsArr = [];
      periodLabel = val.replace('-', ' ');
    } else {
      if (data.quarterly) {
        f = { applied: 0, screened: 0, interviewed: 0, offered: 0, hired: 0 };
        Object.entries(data.quarterly).forEach(([k, q]) => {
          if (k.startsWith(year + '-')) {
            f.applied += q.funnel.applied;
            f.screened += q.funnel.screened;
            f.interviewed += q.funnel.interviewed;
            f.offered += q.funnel.offered;
            f.hired += q.funnel.hired;
          }
        });
        if (f.applied === 0) f = data.funnel || {};
      } else {
        f = data.funnel || {};
      }
      topJobs = (data.jobs || []).filter(j => j.applied > 0).sort((a, b) => b.applied - a.applied).slice(0, 5);
      openingsArr = data.openings || [];
      periodLabel = year;
    }

    const totalOpen = openingsArr.reduce((s, o) => s + o.open, 0);
    const totalFilled = isQuarter ? (f.hired || 0) : (f.hired || 0);
    const totalPositions = isQuarter ? (f.hired || 0) + totalOpen : (f.hired || 0) + totalOpen;
    const fillRate = totalPositions > 0 ? ((totalFilled / totalPositions) * 100).toFixed(1) : '0.0';
    const convRate = f.applied > 0 ? ((f.hired / f.applied) * 100).toFixed(1) : '0.0';
    const displayJobs = isQuarter ? topJobs.slice(0, 5) : topJobs.slice(0, 5);

    const deptMap = {};
    openingsArr.forEach(o => {
      if (!deptMap[o.department]) deptMap[o.department] = { open: 0, filled: 0 };
      deptMap[o.department].open += o.open;
      deptMap[o.department].filled += o.filled;
    });
    const deptArr = Object.entries(deptMap).sort((a, b) => (b[1].open + b[1].filled) - (a[1].open + a[1].filled));
    const maxDeptTotal = deptArr.length > 0 ? deptArr[0][1].open + deptArr[0][1].filled : 1;

    const pipelineStages = [
      { label: 'Applied', value: f.applied || 0, color: '#3b82f6' },
      { label: 'Screened', value: f.screened || 0, color: '#6366f1' },
      { label: 'Interviewed', value: f.interviewed || 0, color: '#2563eb' },
      { label: 'Offered', value: f.offered || 0, color: '#0891b2' },
      { label: 'Hired', value: f.hired || 0, color: '#0f766e' },
    ];
    const maxPipeline = Math.max(...pipelineStages.map(s => s.value), 1);

    container.innerHTML = `
      <div style="margin-bottom:24px;">
        <h3 class="subsection-title" style="margin-top:0;">Key Metrics — ${periodLabel}</h3>
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

      <div class="pipeline-wrap">
        <h3>Hiring Pipeline</h3>
        <div class="pipeline-flow">
          ${pipelineStages.map(s => {
            const flex = Math.max((s.value / maxPipeline) * 100, s.value > 0 ? 8 : 2);
            return `<div class="stage" style="flex:${flex.toFixed(1)};background:${s.color}">${s.value.toLocaleString()}</div>`;
          }).join('')}
        </div>
        <div class="pipeline-labels">
          ${pipelineStages.map(s => `<span>${s.label}</span>`).join('')}
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <div>
          <h3 class="subsection-title" style="margin-top:0;">Top Jobs by Applications</h3>
          <div style="background:var(--card);border:1px solid var(--border);border-radius:8px;overflow:hidden;">
            ${displayJobs.length === 0 ? '<div style="padding:16px;text-align:center;color:var(--muted);font-size:13px;">No application data for this period</div>' :
              displayJobs.map((j, i) => {
                const pct = displayJobs[0].applied > 0 ? Math.max(Math.round((j.applied / displayJobs[0].applied) * 100), 3) : 0;
                return `
                  <div style="padding:8px 12px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;${i === displayJobs.length - 1 ? 'border:none;' : ''}">
                    <span style="font-size:11px;color:var(--muted);width:16px;text-align:right;">${i + 1}</span>
                    <div style="flex:1;min-width:0;">
                      <div style="font-weight:500;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${j.title}</div>
                      <div style="margin-top:4px;background:var(--border-light);border-radius:3px;height:6px;overflow:hidden;">
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
          <h3 class="subsection-title" style="margin-top:0;">Positions by Department</h3>
          <div style="background:var(--card);border:1px solid var(--border);border-radius:8px;overflow:hidden;">
            ${deptArr.length === 0 ? '<div style="padding:16px;text-align:center;color:var(--muted);font-size:13px;">No opening data for this period</div>' :
              deptArr.slice(0, 6).map(([ dept, v ], i) => {
                const filledPct = Math.round((v.filled / maxDeptTotal) * 100);
                const openPct = Math.round((v.open / maxDeptTotal) * 100);
                return `
                  <div style="padding:8px 12px;border-bottom:1px solid var(--border);${i === Math.min(deptArr.length, 6) - 1 ? 'border:none;' : ''}">
                    <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                      <span style="font-weight:500;font-size:12px;">${dept}</span>
                      <span style="font-size:12px;"><span class="good">${v.filled}</span> <span style="color:var(--muted)">/ ${v.open + v.filled}</span></span>
                    </div>
                    <div style="display:flex;height:6px;border-radius:3px;overflow:hidden;background:var(--border-light);">
                      <div style="width:${filledPct}%;background:var(--green);"></div>
                      <div style="width:${openPct}%;background:var(--blue);"></div>
                    </div>
                  </div>
                `;
              }).join('')}
          </div>
        </div>
      </div>
    `;
  }

  sel.addEventListener('change', renderData);
  renderData();
}

function getQuarterFromDate(dateStr) {
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const q = Math.floor(d.getMonth() / 3) + 1;
  return y + '-Q' + q;
}

