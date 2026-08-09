export function renderEfficiency(data) {
  if (!data || !data.funnel) {
    return '<p>No data available.</p>';
  }

  const jobDepts = [...new Set((data.jobs || []).map(j => j.department))].sort();

  return `
    <h2 class="section-title">Overall Hiring Efficiency</h2>
    <p class="sub-note" style="margin-top:-8px;">Aggregated metrics across all candidates and jobs.</p>

    <div class="filter-bar">
      <select id="effStatusFilter"><option value="">All Job Statuses</option><option value="Open">Open</option><option value="Closed">Closed</option></select>
      <select id="effTeamFilter"><option value="">All Departments</option>${jobDepts.map(d => `<option value="${d}">${d}</option>`).join('')}</select>
    </div>

    <div class="cards" id="effCards"></div>

    <h3 class="subsection-title">Application Velocity</h3>
    <div class="chart-wrap" style="height:250px"><canvas id="velocityChart"></canvas></div>

    <h3 class="subsection-title">TA Screen Filtering</h3>
    <div class="metric-grid" id="effTaFilter"></div>

    <h3 class="subsection-title">Screening Efficiency</h3>
    <div class="metric-grid" id="effScreening"></div>

    <h3 class="subsection-title">Joining Conversion</h3>
    <div class="metric-grid" id="effJoining"></div>

    <h3 class="subsection-title">Stage-wise Funnel</h3>
    <div class="card" style="padding:14px" id="effFunnel"></div>

    <h3 class="subsection-title">Funnel Breakdown</h3>
    <div class="chart-wrap" style="height:300px"><canvas id="funnelChart"></canvas></div>
    <div class="scroll-table" id="effBreakdown"></div>

    <h3 class="subsection-title">Position Fulfilment</h3>
    <p class="sub-note">Set offer/hire targets below. Gap = Target − Actual.</p>
    <div class="metric-grid" id="effFulfilment"></div>
  `;
}

let velocityChartInstance = null;
let funnelChartInstance = null;

const STAGES_ORDER = ['appReview','taScreen','hmReview','oa','r1','r2','r3','r4','r5','refCheck','docSub','offer','hired'];

function computeReachedFunnel(jobs) {
  let totalApplied = 0;
  const agg = {};
  STAGES_ORDER.forEach(s => { agg[s] = 0; });
  jobs.forEach(j => {
    totalApplied += j.total;
    STAGES_ORDER.forEach(s => { agg[s] += (j.pipeline?.[s] || 0); });
  });
  const reached = {};
  let running = 0;
  for (let i = STAGES_ORDER.length - 1; i >= 0; i--) {
    running += agg[STAGES_ORDER[i]];
    reached[STAGES_ORDER[i]] = running;
  }
  return { applied: totalApplied, reached, current: agg };
}

function fmt(n) { return n != null ? n.toLocaleString() : '—'; }
function pctFmt(num, den) { return den > 0 ? ((num / den) * 100).toFixed(1) + '%' : '—'; }
function pctOf(num, den) { return den > 0 ? ((num / den) * 100).toFixed(1) : '0.0'; }

export function initEfficiencyFilters(data) {
  if (!data) return;
  const jobs = data.jobs || [];
  const weeklyVelocity = data.weeklyVelocity || [];

  // Velocity chart (static, not filter-dependent)
  if (velocityChartInstance) velocityChartInstance.destroy();
  const velCtx = document.getElementById('velocityChart');
  if (velCtx && weeklyVelocity.length > 0) {
    velocityChartInstance = new Chart(velCtx, {
      type: 'bar',
      data: {
        labels: weeklyVelocity.map(w => w.week),
        datasets: [{ label: 'Applications', data: weeklyVelocity.map(w => w.count), backgroundColor: 'rgba(78,107,166,0.75)', borderRadius: 4 }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true }, x: { grid: { display: false } } } }
    });
  }

  function render() {
    const statusF = document.getElementById('effStatusFilter')?.value || '';
    const teamF = document.getElementById('effTeamFilter')?.value || '';

    const filtered = jobs.filter(j => {
      if (statusF && j.status !== statusF) return false;
      if (teamF && j.department !== teamF) return false;
      return true;
    });

    const funnel = computeReachedFunnel(filtered);
    const r = funnel.reached;
    const totalApplied = funnel.applied;
    const totalHired = funnel.current.hired;

    // KPI cards
    const cards = document.getElementById('effCards');
    if (cards) {
      cards.innerHTML = `
        <div class="card"><div class="label">Total Submissions</div><div class="value">${fmt(totalApplied)}</div></div>
        <div class="card"><div class="label">Reached TA Screen</div><div class="value">${fmt(r.taScreen)}</div><div class="sub">${pctFmt(r.taScreen, totalApplied)} of submissions</div></div>
        <div class="card"><div class="label">Reached R1</div><div class="value">${fmt(r.r1)}</div><div class="sub">${pctFmt(r.r1, r.taScreen)} of TA Screen</div></div>
        <div class="card"><div class="label">Reached Offer</div><div class="value" style="color:var(--blue)">${fmt(r.offer)}</div><div class="sub">${pctFmt(r.offer, r.r1)} of R1</div></div>
        <div class="card"><div class="label">Hired</div><div class="value" style="color:var(--green)">${fmt(totalHired)}</div><div class="sub">${pctFmt(totalHired, r.offer)} of Offers</div></div>
      `;
    }

    // TA Screen Filtering (separate section)
    const taFilter = document.getElementById('effTaFilter');
    if (taFilter) {
      taFilter.innerHTML = `
        <div class="metric-box"><h4>TA Screen Filtering</h4>
          <div class="metric-row"><span class="metric-label">Reached TA Screen</span><span class="metric-val">${fmt(r.taScreen)}</span></div>
          <div class="metric-row"><span class="metric-label">Cleared (→ HM Review)</span><span class="metric-val">${fmt(r.hmReview)}</span></div>
          <div class="metric-row"><span class="metric-label">Pass Rate</span><span class="metric-val pct">${pctFmt(r.hmReview, r.taScreen)}</span></div>
        </div>
      `;
    }

    // Screening: HM Review + OA + R1
    const screening = document.getElementById('effScreening');
    if (screening) {
      screening.innerHTML = `
        <div class="metric-box"><h4>HM Review</h4>
          <div class="metric-row"><span class="metric-label">Added</span><span class="metric-val">${fmt(r.hmReview)}</span></div>
          <div class="metric-row"><span class="metric-label">Cleared (→ OA)</span><span class="metric-val">${fmt(r.oa)}</span></div>
          <div class="metric-row"><span class="metric-label">Pass Rate</span><span class="metric-val pct">${pctFmt(r.oa, r.hmReview)}</span></div>
        </div>
        <div class="metric-box"><h4>Online Assessment</h4>
          <div class="metric-row"><span class="metric-label">Added</span><span class="metric-val">${fmt(r.oa)}</span></div>
          <div class="metric-row"><span class="metric-label">Cleared (→ R1)</span><span class="metric-val">${fmt(r.r1)}</span></div>
          <div class="metric-row"><span class="metric-label">Pass Rate</span><span class="metric-val pct">${pctFmt(r.r1, r.oa)}</span></div>
        </div>
        <div class="metric-box"><h4>R1 Interview</h4>
          <div class="metric-row"><span class="metric-label">Added</span><span class="metric-val">${fmt(r.r1)}</span></div>
          <div class="metric-row"><span class="metric-label">Cleared (→ Offer)</span><span class="metric-val">${fmt(r.offer)}</span></div>
          <div class="metric-row"><span class="metric-label">Pass Rate</span><span class="metric-val pct">${pctFmt(r.offer, r.r1)}</span></div>
        </div>
      `;
    }

    // Joining conversion
    const joining = document.getElementById('effJoining');
    if (joining) {
      joining.innerHTML = `
        <div class="metric-box"><h4>Offer → Hired</h4>
          <div class="metric-row"><span class="metric-label">Offers Extended</span><span class="metric-val">${fmt(r.offer)}</span></div>
          <div class="metric-row"><span class="metric-label">Hired</span><span class="metric-val">${fmt(totalHired)}</span></div>
          <div class="metric-row"><span class="metric-label">Conversion Rate</span><span class="metric-val pct">${pctFmt(totalHired, r.offer)}</span></div>
        </div>
        <div class="metric-box"><h4>Overall Funnel</h4>
          <div class="metric-row"><span class="metric-label">TA Screen → Offer</span><span class="metric-val pct">${pctFmt(r.offer, r.taScreen)}</span></div>
          <div class="metric-row"><span class="metric-label">TA Screen → Hired</span><span class="metric-val pct">${pctFmt(totalHired, r.taScreen)}</span></div>
          <div class="metric-row"><span class="metric-label">Submissions → Hired</span><span class="metric-val pct">${pctFmt(totalHired, totalApplied)}</span></div>
        </div>
      `;
    }

    // Funnel bars
    const funnelEl = document.getElementById('effFunnel');
    if (funnelEl) {
      const stages = [
        { label: 'Applied', value: totalApplied, color: '#938FB8' },
        { label: 'TA Screen', value: r.taScreen, color: '#7E86B5' },
        { label: 'HM Review', value: r.hmReview, color: '#4E6BA6' },
        { label: 'OA', value: r.oa, color: '#3D80A6' },
        { label: 'R1', value: r.r1, color: '#398AA2' },
        { label: 'Offer', value: r.offer, color: '#2A7E96' },
        { label: 'Hired', value: totalHired, color: '#1E7590' },
      ];
      const max = stages[0].value || 1;
      funnelEl.innerHTML = `<div style="display:flex;flex-direction:column;gap:6px;">
        ${stages.map(s => {
          const p = Math.max(Math.round((s.value / max) * 100), s.value > 0 ? 2 : 0);
          return `<div style="display:flex;align-items:center;gap:10px;">
            <span style="width:80px;font-size:12px;color:var(--muted);text-align:right">${s.label}</span>
            <div style="flex:1;background:#f1f5f9;border-radius:4px;height:24px;overflow:hidden;">
              <div style="width:${p}%;height:100%;background:${s.color};border-radius:4px;display:flex;align-items:center;padding-left:8px;min-width:${s.value > 0 ? '40px' : '0'}">
                <span style="color:#fff;font-size:11px;font-weight:600">${fmt(s.value)}</span>
              </div>
            </div>
            <span style="width:50px;text-align:right;font-size:11px;color:var(--muted)">${Math.round((s.value / max) * 100)}%</span>
          </div>`;
        }).join('')}
      </div>`;
    }

    // Funnel chart (Chart.js)
    if (funnelChartInstance) funnelChartInstance.destroy();
    const funnelCtx = document.getElementById('funnelChart');
    if (funnelCtx) {
      funnelChartInstance = new Chart(funnelCtx, {
        type: 'bar',
        data: {
          labels: ['TA Screen', 'HM Review', 'OA', 'R1', 'Offer', 'Hired'],
          datasets: [{ label: 'Reached', data: [r.taScreen, r.hmReview, r.oa, r.r1, r.offer, totalHired],
            backgroundColor: ['#4E6BA6', '#4E6BA6', '#4E6BA6', '#398AA2', '#2A7E96', '#1E7590'], borderRadius: 4 }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { font: { size: 11 } } }, x: { grid: { display: false } } } }
      });
    }

    // Funnel breakdown table
    const breakdown = document.getElementById('effBreakdown');
    if (breakdown) {
      const screenPct = pctOf(r.taScreen, totalApplied);
      const interviewPct = pctOf(r.r1, r.taScreen);
      const offerPct = pctOf(r.offer, r.r1);
      const hirePct = pctOf(totalHired, r.offer);
      const overallPct = pctOf(totalHired, totalApplied);
      breakdown.innerHTML = `<table>
        <thead><tr><th>Stage</th><th>Count</th><th>% of Total</th><th>Stage Conversion</th></tr></thead>
        <tbody>
          <tr><td style="font-weight:500">Applied</td><td style="font-weight:600">${fmt(totalApplied)}</td><td>100%</td><td>—</td></tr>
          <tr><td style="font-weight:500">TA Screen</td><td style="font-weight:600">${fmt(r.taScreen)}</td><td class="pct">${screenPct}%</td><td class="pct">${screenPct}%</td></tr>
          <tr><td style="font-weight:500">R1</td><td style="font-weight:600">${fmt(r.r1)}</td><td class="pct">${pctOf(r.r1, totalApplied)}%</td><td class="pct">${interviewPct}%</td></tr>
          <tr><td style="font-weight:500">Offer</td><td style="font-weight:600;color:var(--blue)">${fmt(r.offer)}</td><td class="pct">${pctOf(r.offer, totalApplied)}%</td><td class="pct">${offerPct}%</td></tr>
          <tr><td style="font-weight:500">Hired</td><td class="good">${fmt(totalHired)}</td><td class="good">${overallPct}%</td><td class="pct">${hirePct}%</td></tr>
        </tbody>
      </table>`;
    }

    // Position Fulfilment
    const fulfilment = document.getElementById('effFulfilment');
    if (fulfilment) {
      const totalOffers = r.offer;
      fulfilment.innerHTML = `
        <div class="metric-box"><h4>Offer Fulfilment</h4>
          <div class="metric-row"><span class="metric-label">Target</span><span><input type="number" id="offerTarget" value="50" style="width:60px;padding:2px 6px;border:1px solid var(--border);border-radius:4px;font-size:12px"></span></div>
          <div class="metric-row"><span class="metric-label">Actual</span><span class="metric-val">${fmt(totalOffers)}</span></div>
          <div class="metric-row"><span class="metric-label">Gap</span><span class="metric-val" id="offerGap">${totalOffers - 50}</span></div>
        </div>
        <div class="metric-box"><h4>Hire Fulfilment</h4>
          <div class="metric-row"><span class="metric-label">Target</span><span><input type="number" id="hireTarget" value="10" style="width:60px;padding:2px 6px;border:1px solid var(--border);border-radius:4px;font-size:12px"></span></div>
          <div class="metric-row"><span class="metric-label">Actual</span><span class="metric-val">${fmt(totalHired)}</span></div>
          <div class="metric-row"><span class="metric-label">Gap</span><span class="metric-val" id="hireGap">${totalHired - 10}</span></div>
        </div>
      `;

      document.getElementById('offerTarget')?.addEventListener('input', function() {
        const el = document.getElementById('offerGap');
        if (el) el.textContent = totalOffers - (parseInt(this.value) || 0);
      });
      document.getElementById('hireTarget')?.addEventListener('input', function() {
        const el = document.getElementById('hireGap');
        if (el) el.textContent = totalHired - (parseInt(this.value) || 0);
      });
    }
  }

  document.getElementById('effStatusFilter')?.addEventListener('change', render);
  document.getElementById('effTeamFilter')?.addEventListener('change', render);
  render();
}
