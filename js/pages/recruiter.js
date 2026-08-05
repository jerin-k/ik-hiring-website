function pct(num, den) {
  if (!den) return '0.0';
  return ((num / den) * 100).toFixed(1);
}

function pctClass(val) {
  const n = parseFloat(val);
  if (n >= 50) return 'good';
  if (n >= 20) return 'pct';
  if (n > 0) return 'warn';
  return 'zero';
}

export function renderRecruiter(data) {
  if (!data || !data.recruiters || data.recruiters.length === 0) {
    return `
      <h2>Recruiter Efficiency</h2>
      <p class="sub-note">Per-recruiter metrics based on candidate pipeline data.</p>
      <div class="card" style="text-align:center;padding:2rem;">
        <p style="color:var(--muted);font-size:13px;">Recruiter data not yet available.</p>
      </div>
    `;
  }

  return `
    <h2 class="section-title">Recruiter Efficiency</h2>
    <p class="sub-note" style="margin-top:-8px;">Per-recruiter metrics based on "reached stage" data. Only recruiters with applications shown.</p>
    <div class="filter-bar">
      <input type="text" id="recNameFilter" placeholder="Filter by recruiter name..." style="width:220px">
      <label style="font-size:12px;color:var(--muted);display:flex;align-items:center;gap:4px"><input type="checkbox" id="recHideZero" checked> Hide zero-app recruiters</label>
    </div>

    <div class="cards" id="recKpiCards"></div>

    <!-- Submission Velocity -->
    <h3 class="subsection-title">Submission Velocity</h3>
    <div class="chart-wrap" style="height:250px"><canvas id="recruiterVelocityChart"></canvas></div>
    <div class="scroll-table">
      <table>
        <thead><tr><th>Recruiter</th><th>Total Apps</th><th style="width:40%"></th></tr></thead>
        <tbody id="recVelocityBody"></tbody>
      </table>
    </div>

    <hr class="section-divider">

    <!-- Resume Filtering Efficiency -->
    <h3 class="subsection-title">Resume Filtering Efficiency</h3>
    <p class="sub-note">TA Screen: candidates who reached TA Screen vs those who progressed beyond it.</p>
    <div class="scroll-table">
      <table>
        <thead><tr><th>Recruiter</th><th>Total Apps</th><th>Reached TA Screen</th><th>Cleared TA Screen</th><th>TA Filtering %</th></tr></thead>
        <tbody id="recFilterBody"></tbody>
      </table>
    </div>

    <hr class="section-divider">

    <!-- Screening Efficiency -->
    <h3 class="subsection-title">Screening Efficiency</h3>
    <div class="scroll-table">
      <table>
        <thead><tr><th>Recruiter</th><th>R1 In</th><th>R1→Offer</th><th>R1→Offer %</th><th>Offer</th><th>Hired</th><th>Offer→Hired %</th></tr></thead>
        <tbody id="recScreenBody"></tbody>
      </table>
    </div>

    <hr class="section-divider">

    <!-- Joining Conversion -->
    <h3 class="subsection-title">Joining Conversion</h3>
    <div class="scroll-table">
      <table>
        <thead><tr><th>Recruiter</th><th>Offered</th><th>Hired</th><th>Conversion %</th></tr></thead>
        <tbody id="recJoinBody"></tbody>
      </table>
    </div>

    <hr class="section-divider">

    <!-- Position Fulfilment -->
    <h3 class="subsection-title">Position Fulfilment</h3>
    <p class="sub-note">Target vs actual. Set targets using the input fields below.</p>
    <div class="scroll-table">
      <table>
        <thead><tr><th>Recruiter</th><th>Offer Target</th><th>Offers Made</th><th>Offer Gap</th><th>Hire Target</th><th>Hired</th><th>Hire Gap</th></tr></thead>
        <tbody id="recFulfilBody"></tbody>
      </table>
    </div>
  `;
}

let recVelocityChart = null;

export function initRecruiterFilters(data) {
  if (!data || !data.recruiters) return;
  const allRecs = data.recruiters;
  const weeklyVelocity = data.weeklyVelocity || [];

  function getFilteredRecs() {
    const nameF = (document.getElementById('recNameFilter')?.value || '').toLowerCase();
    const hideZero = document.getElementById('recHideZero')?.checked;
    return allRecs.filter(r => {
      if (hideZero && r.total === 0) return false;
      if (nameF && !r.name.toLowerCase().includes(nameF)) return false;
      return true;
    });
  }

  function renderAllTables() {
    const recs = getFilteredRecs();
    const totals = {
      total: recs.reduce((s, r) => s + (r.total || 0), 0),
      ta: recs.reduce((s, r) => s + (r.ta || 0), 0),
      hm: recs.reduce((s, r) => s + (r.hm || 0), 0),
      r1: recs.reduce((s, r) => s + (r.r1 || 0), 0),
      offer: recs.reduce((s, r) => s + (r.offer || 0), 0),
      hired: recs.reduce((s, r) => s + (r.hired || 0), 0),
    };

    // KPI cards
    const cards = document.getElementById('recKpiCards');
    if (cards) {
      cards.innerHTML = `
        <div class="card"><div class="label">Total Submissions</div><div class="value">${totals.total}</div></div>
        <div class="card"><div class="label">Reached TA Screen</div><div class="value">${totals.ta}</div><div class="sub">${pct(totals.ta, totals.total)}% of submissions</div></div>
        <div class="card"><div class="label">Reached R1</div><div class="value">${totals.r1}</div><div class="sub">${pct(totals.r1, totals.ta)}% of TA Screen</div></div>
        <div class="card"><div class="label">Offers</div><div class="value" style="color:var(--blue)">${totals.offer}</div><div class="sub">${pct(totals.offer, totals.r1)}% of R1</div></div>
        <div class="card"><div class="label">Hired</div><div class="value" style="color:var(--green)">${totals.hired}</div><div class="sub">${pct(totals.hired, totals.offer)}% of Offers</div></div>
      `;
    }

    // Velocity
    const velBody = document.getElementById('recVelocityBody');
    if (velBody) {
      let html = '';
      recs.filter(r => r.total > 0).sort((a, b) => b.total - a.total).forEach(r => {
        const barPct = totals.total > 0 ? Math.max(Math.round((r.total / totals.total) * 100), 1) : 0;
        html += `<tr>
          <td style="font-weight:500;white-space:nowrap">${r.name}</td>
          <td style="font-weight:600">${r.total}</td>
          <td><div style="background:#f1f5f9;border-radius:3px;height:16px;overflow:hidden;">
            <div style="width:${barPct}%;height:100%;background:var(--accent);border-radius:3px;display:flex;align-items:center;justify-content:flex-end;padding-right:4px;">
              <span style="font-size:9px;color:#fff;font-weight:600">${pct(r.total, totals.total)}%</span>
            </div>
          </div></td>
        </tr>`;
      });
      html += `<tr class="totals-row"><td>Total</td><td>${totals.total}</td><td></td></tr>`;
      velBody.innerHTML = html;
    }

    // Velocity chart
    if (recVelocityChart) recVelocityChart.destroy();
    const velCtx = document.getElementById('recruiterVelocityChart');
    if (velCtx && weeklyVelocity.length > 0) {
      recVelocityChart = new Chart(velCtx, {
        type: 'bar',
        data: {
          labels: weeklyVelocity.map(w => w.week),
          datasets: [{ label: 'Total Applications', data: weeklyVelocity.map(w => w.count), backgroundColor: '#4f46e5cc', borderRadius: 4 }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: '#f1f5f9' } }, x: { grid: { display: false } } } }
      });
    }

    // Filtering
    const filterBody = document.getElementById('recFilterBody');
    if (filterBody) {
      let html = '';
      recs.forEach(r => {
        html += `<tr><td style="font-weight:500">${r.name}</td><td>${r.total}</td><td>${r.ta}</td><td>${r.hm}</td><td class="${pctClass(pct(r.hm, r.ta))}">${pct(r.hm, r.ta)}%</td></tr>`;
      });
      html += `<tr class="totals-row"><td>Total</td><td>${totals.total}</td><td>${totals.ta}</td><td>${totals.hm}</td><td class="pct">${pct(totals.hm, totals.ta)}%</td></tr>`;
      filterBody.innerHTML = html;
    }

    // Screening
    const screenBody = document.getElementById('recScreenBody');
    if (screenBody) {
      let html = '';
      recs.forEach(r => {
        html += `<tr><td style="font-weight:500">${r.name}</td><td>${r.r1}</td><td>${r.offer}</td><td class="${pctClass(pct(r.offer, r.r1))}">${pct(r.offer, r.r1)}%</td><td>${r.offer}</td><td class="${r.hired > 0 ? 'good' : 'zero'}">${r.hired}</td><td class="${pctClass(pct(r.hired, r.offer))}">${pct(r.hired, r.offer)}%</td></tr>`;
      });
      html += `<tr class="totals-row"><td>Total</td><td>${totals.r1}</td><td>${totals.offer}</td><td class="pct">${pct(totals.offer, totals.r1)}%</td><td>${totals.offer}</td><td>${totals.hired}</td><td class="pct">${pct(totals.hired, totals.offer)}%</td></tr>`;
      screenBody.innerHTML = html;
    }

    // Joining
    const joinBody = document.getElementById('recJoinBody');
    if (joinBody) {
      let html = '';
      recs.forEach(r => {
        html += `<tr><td style="font-weight:500">${r.name}</td><td>${r.offer}</td><td class="${r.hired > 0 ? 'good' : 'zero'}">${r.hired}</td><td class="${pctClass(pct(r.hired, r.offer))}">${pct(r.hired, r.offer)}%</td></tr>`;
      });
      html += `<tr class="totals-row"><td>Total</td><td>${totals.offer}</td><td>${totals.hired}</td><td class="pct">${pct(totals.hired, totals.offer)}%</td></tr>`;
      joinBody.innerHTML = html;
    }

    // Fulfilment
    const fulfilBody = document.getElementById('recFulfilBody');
    if (fulfilBody) {
      let html = '';
      recs.forEach(r => {
        const og = r.offer - 5;
        const hg = r.hired - 2;
        html += `<tr><td style="font-weight:500">${r.name}</td>
          <td><input type="number" class="rec-offer-target" data-rec="${r.name}" value="5" style="width:50px;padding:2px 4px;border:1px solid var(--border);border-radius:3px;font-size:11px"></td>
          <td>${r.offer}</td><td class="rec-offer-gap ${og >= 0 ? 'good' : 'bad'}" data-rec="${r.name}">${og}</td>
          <td><input type="number" class="rec-hire-target" data-rec="${r.name}" value="2" style="width:50px;padding:2px 4px;border:1px solid var(--border);border-radius:3px;font-size:11px"></td>
          <td>${r.hired}</td><td class="rec-hire-gap ${hg >= 0 ? 'good' : 'bad'}" data-rec="${r.name}">${hg}</td>
        </tr>`;
      });
      fulfilBody.innerHTML = html;

      document.querySelectorAll('.rec-offer-target').forEach(inp => {
        inp.addEventListener('input', () => {
          const rec = inp.dataset.rec;
          const target = parseInt(inp.value) || 0;
          const r = allRecs.find(x => x.name === rec);
          if (!r) return;
          const gap = r.offer - target;
          const cell = document.querySelector(`.rec-offer-gap[data-rec="${rec}"]`);
          if (cell) { cell.textContent = gap; cell.className = 'rec-offer-gap ' + (gap >= 0 ? 'good' : 'bad'); }
        });
      });
      document.querySelectorAll('.rec-hire-target').forEach(inp => {
        inp.addEventListener('input', () => {
          const rec = inp.dataset.rec;
          const target = parseInt(inp.value) || 0;
          const r = allRecs.find(x => x.name === rec);
          if (!r) return;
          const gap = r.hired - target;
          const cell = document.querySelector(`.rec-hire-gap[data-rec="${rec}"]`);
          if (cell) { cell.textContent = gap; cell.className = 'rec-hire-gap ' + (gap >= 0 ? 'good' : 'bad'); }
        });
      });
    }
  }

  document.getElementById('recNameFilter')?.addEventListener('input', renderAllTables);
  document.getElementById('recHideZero')?.addEventListener('change', renderAllTables);
  renderAllTables();
}
