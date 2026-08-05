export function renderSourcing(data) {
  if (!data || !data.sources || data.sources.length === 0) {
    return `
      <h2>Sourcing Mix</h2>
      <p class="sub-note">Source channel breakdown and effectiveness.</p>
      <div class="card" style="text-align:center;padding:2rem;">
        <p style="color:var(--muted);font-size:13px;">Sourcing data not yet available.</p>
        <p style="color:var(--muted);font-size:11px;margin-top:6px;">This section will populate once source channel data is integrated from Ashby.</p>
      </div>
    `;
  }

  const totalCandidates = data.sources.reduce((sum, s) => sum + s.candidates, 0);
  const totalApplied = data.funnel?.applied || totalCandidates;
  const uncategorized = totalApplied - totalCandidates;
  const topSource = data.sources.reduce((max, s) => s.candidates > max.candidates ? s : max, data.sources[0]);

  const colors = ['var(--accent)', 'var(--blue)', 'var(--orange)', 'var(--green)', 'var(--yellow)', 'var(--red)'];

  return `
    <h2 class="section-title">Sourcing Mix</h2>

    <div class="cards">
      <div class="card">
        <div class="label">Total Sourced</div>
        <div class="value">${totalCandidates.toLocaleString()}</div>
      </div>
      <div class="card">
        <div class="label">Top Channel</div>
        <div class="value" style="font-size:18px">${topSource.name}</div>
        <div class="sub">${topSource.candidates.toLocaleString()} candidates (${Math.round((topSource.candidates / totalCandidates) * 100)}%)</div>
      </div>
      <div class="card">
        <div class="label">Active Channels</div>
        <div class="value">${data.sources.filter(s => s.candidates > 0).length}</div>
      </div>
    </div>

    <h3 class="subsection-title">Source Distribution</h3>
    <div class="source-bar">
      ${data.sources.map((s, i) => {
        const pct = totalApplied > 0 ? (s.candidates / totalApplied) * 100 : 0;
        return pct >= 1 ? `<div style="width:${pct}%;background:${colors[i % colors.length]}" title="${s.name}: ${s.candidates.toLocaleString()}">${pct >= 8 ? s.name + ' ' + s.candidates.toLocaleString() : s.candidates.toLocaleString()}</div>` : '';
      }).join('')}${uncategorized > 0 ? `<div style="width:${(uncategorized / totalApplied * 100)}%;background:#cbd5e1;color:#475569" title="Uncategorized: ${uncategorized.toLocaleString()}">${uncategorized.toLocaleString()}</div>` : ''}
    </div>
    <p class="sub-note">${totalCandidates.toLocaleString()} of ${totalApplied.toLocaleString()} total applications have a categorized source type. ${uncategorized.toLocaleString()} are uncategorized.</p>

    <h3 class="subsection-title">Channel Breakdown</h3>
    <div class="chart-wrap" style="max-width:400px;margin:0 auto 20px"><canvas id="sourceChart"></canvas></div>

    <h3 class="subsection-title">Source Breakdown</h3>
    <div class="scroll-table">
      <table>
        <thead><tr><th>Source</th><th>Candidates</th><th>% of Categorized</th><th>% of Total</th><th>Hires</th><th>Conversion</th></tr></thead>
        <tbody>
          ${data.sources.map(s => {
            const pctCat = totalCandidates > 0 ? ((s.candidates / totalCandidates) * 100).toFixed(1) : '0.0';
            const pctTotal = totalApplied > 0 ? ((s.candidates / totalApplied) * 100).toFixed(1) : '0.0';
            const conv = s.candidates > 0 ? ((s.hires || 0) / s.candidates * 100).toFixed(1) : '0.0';
            return `
              <tr>
                <td style="font-weight:500">${s.name}</td>
                <td>${s.candidates.toLocaleString()}</td>
                <td class="${s.candidates === 0 ? 'zero' : 'pct'}">${pctCat}%</td>
                <td>${pctTotal}%</td>
                <td class="${(s.hires || 0) > 0 ? 'good' : 'zero'}">${(s.hires || 0).toLocaleString()}</td>
                <td>${conv}%</td>
              </tr>
            `;
          }).join('')}
          <tr style="background:#f1f5f9"><td style="font-weight:600">Uncategorized</td><td>${uncategorized.toLocaleString()}</td><td>—</td><td>${totalApplied > 0 ? ((uncategorized / totalApplied) * 100).toFixed(1) : '0.0'}%</td><td class="zero">—</td><td>—</td></tr>
          <tr style="background:#e2e8f0"><td style="font-weight:700">Total</td><td style="font-weight:700">${totalApplied.toLocaleString()}</td><td></td><td style="font-weight:700">100%</td><td></td><td></td></tr>
        </tbody>
      </table>
    </div>
  `;
}

let sourceChartInstance = null;

export function initSourcingChart(data) {
  if (!data || !data.sources || data.sources.length === 0) return;

  const totalCandidates = data.sources.reduce((sum, s) => sum + s.candidates, 0);
  const totalApplied = data.funnel?.applied || totalCandidates;
  const uncategorized = totalApplied - totalCandidates;

  const chartLabels = data.sources.filter(s => s.candidates > 0).map(s => s.name);
  const chartData = data.sources.filter(s => s.candidates > 0).map(s => s.candidates);
  if (uncategorized > 0) {
    chartLabels.push('Uncategorized');
    chartData.push(uncategorized);
  }
  const colorMap = { Referral: '#4f46e5', Inbound: '#2563eb', Sourced: '#ea580c', Internal: '#64748b' };
  const chartColors = chartLabels.map(l => colorMap[l] || '#cbd5e1');

  if (sourceChartInstance) sourceChartInstance.destroy();
  const ctx = document.getElementById('sourceChart');
  if (ctx) {
    sourceChartInstance = new Chart(ctx, {
      type: 'doughnut',
      data: { labels: chartLabels, datasets: [{ data: chartData, backgroundColor: chartColors }] },
      options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
    });
  }
}
