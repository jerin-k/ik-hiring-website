import { getData } from '../data.js';
import { defsBlock } from '../definitions.js';

export function renderHome(access) {
  const data = getData();
  if (!data) return '<p>Loading...</p>';

  const currentYear = new Date().getFullYear();
  const startYear = 2026;
  const endYear = Math.max(currentYear, 2026);
  const sortedYears = [];
  for (let y = endYear; y >= startYear; y--) sortedYears.push(String(y));

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

  // Default the period to the CURRENT quarter, matching Recruiter and Overall Efficiency.
  // Landing on "All"/full-year mixed finished quarters with the one in progress, which is not the view
  // anyone actually wants first — the live quarter is what gets worked on.
  (() => {
    const now = new Date();
    const want = `${now.getFullYear()}-Q${Math.floor(now.getMonth() / 3) + 1}`;
    if ([...sel.options].some(o => o.value === want)) sel.value = want;
  })();

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

    // Openings are counted per DISTINCT opening, bucketed by the quarter the opening
    // itself was opened: Total = Joined + Open + Missed (On Hold / Shelved are excluded
    // from Total entirely). Replaces the old "openedAt falls inside From-To" filter.
    const buckets = aggregateOpenings(data, val, isQuarter, year);
    const hasBuckets = buckets !== null;

    let totalPositions, totalFilled, totalOpen, totalMissed, totalPending, deptArr, maxDeptTotal;
    if (hasBuckets) {
      totalPositions = buckets.tot.total;
      totalFilled = buckets.tot.joined;
      totalOpen = buckets.tot.open;
      totalMissed = buckets.tot.missed;
      totalPending = buckets.tot.pending;
      deptArr = Object.entries(buckets.byDept)
        .filter(([, v]) => v.total > 0)
        .sort((a, b) => b[1].total - a[1].total);
      maxDeptTotal = deptArr.length > 0 ? deptArr[0][1].total : 1;
    } else {
      // Fallback for older dashboard.json without openingBuckets
      totalOpen = openingsArr.reduce((s, o) => s + o.open, 0);
      totalFilled = f.hired || 0;
      totalPositions = totalFilled + totalOpen;
      totalMissed = 0;
      totalPending = 0;
      const deptMap = {};
      openingsArr.forEach(o => {
        if (!deptMap[o.department]) deptMap[o.department] = { total: 0, joined: 0, open: 0 };
        deptMap[o.department].open += o.open;
        deptMap[o.department].joined += o.filled;
        deptMap[o.department].total += o.open + o.filled;
      });
      deptArr = Object.entries(deptMap).sort((a, b) => b[1].total - a[1].total);
      maxDeptTotal = deptArr.length > 0 ? deptArr[0][1].total : 1;
    }
    const openVacant = Math.max(totalOpen - totalPending, 0);

    const fillRate = totalPositions > 0 ? ((totalFilled / totalPositions) * 100).toFixed(1) : '0.0';
    const convRate = f.applied > 0 ? ((f.hired / f.applied) * 100).toFixed(1) : '0.0';
    const displayJobs = topJobs.slice(0, 5);
    const allJobs = isQuarter ? topJobs : (data.jobs || []).filter(j => j.hired > 0);
    const hiredJobs = [...allJobs].sort((a, b) => b.hired - a.hired).slice(0, 5);

    // Interviews are period-aware when the pipeline supplies interviewsByQuarter;
    // otherwise fall back to the all-time total rather than showing nothing.
    const iq = data.interviewsByQuarter || {};
    const hasIq = Object.keys(iq).length > 0;
    const interviewCount = !hasIq
      ? (data.totalInterviews || 0)
      : (isQuarter
          ? (iq[val] || 0)
          : Object.entries(iq).reduce((s, [k, v]) => s + (k.startsWith(year + '-') ? v : 0), 0));

    // ===== Candidates Interviewed (2026-08-25) =====
    // PEOPLE, not interviews. interviewsByQuarter counts EVENTS — one candidate doing R1, R2 and R3 is three
    // of those and one of these — so the tile could not simply be relabelled; the pipeline now emits a
    // distinct-candidate count per quarter. A candidate counts if they sat a panel interview OR took an
    // online assessment (HeyMilo / Trifle / HackerEarth, which live in Ashby as the Online Assessment STAGE,
    // not as interview events). The two sets are unioned server-side by application, never added, because
    // plenty of people do both in one quarter.
    // Until the next refresh has run these fields are absent — in that case the tile keeps its OLD name and
    // its old number rather than putting a people label on a count of events.
    const periodSum = (m) => !m ? null
      : (isQuarter ? (m[val] || 0) : Object.entries(m).reduce((s, [k, v]) => s + (k.startsWith(year + '-') ? v : 0), 0));
    const candInterviewed = periodSum(data.candidatesInterviewedByQuarter);
    const panelPeople = periodSum(data.panelInterviewedByQuarter);
    const assessedPeople = periodSum(data.assessedByQuarter);
    const hasCand = candInterviewed != null && Object.keys(data.candidatesInterviewedByQuarter || {}).length > 0;

    // Panelists for the selected period. Each panelist carries a per-quarter breakdown,
    // so the list matches the Total Interviews figure above it instead of always showing
    // lifetime totals (which made a future quarter look busy while the total read zero).
    const periodInterviews = (p) => {
      const bq = p.byQuarter;
      if (!bq) return p.interviews || 0;           // pre-byQuarter data: fall back to lifetime
      if (isQuarter) return bq[val] || 0;
      return Object.entries(bq).reduce((s, [k, v]) => s + (k.startsWith(year + '-') ? v : 0), 0);
    };
    const panelistsInPeriod = (data.interviewers || [])
      .map(p => ({ name: p.name, interviews: periodInterviews(p) }))
      .filter(p => p.interviews > 0)
      .sort((a, b) => b.interviews - a.interviews);
    const anyByQuarter = (data.interviewers || []).some(p => p.byQuarter);

    const pipelineStages = [
      { label: 'Applied', value: f.applied || 0, color: '#938FB8' },
      { label: 'Screened', value: f.screened || 0, color: '#6E86B0' },
      { label: 'Interviewed', value: f.interviewed || 0, color: '#4E6BA6' },
      { label: 'Offered', value: f.offered || 0, color: '#398AA2' },
      { label: 'Hired', value: f.hired || 0, color: '#1E7590' },
    ];
    const maxPipeline = Math.max(...pipelineStages.map(s => s.value), 1);

    container.innerHTML = `
      ${defsBlock('overview')}
      <div style="margin-bottom:24px;">
        <h3 class="subsection-title" style="margin-top:0;">Key Metrics — ${periodLabel}</h3>
        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;">
          <div class="card">
            <div class="label">Total Positions</div>
            <div class="value">${totalPositions}</div>
            <div class="sub">${totalFilled} joined · ${totalOpen} open${totalMissed > 0 ? ` · ${totalMissed} missed` : ''}</div>
          </div>
          <div class="card">
            <div class="label">Applications</div>
            <div class="value">${(f.applied || 0).toLocaleString()}</div>
            <div class="sub">candidates applied</div>
          </div>
          <div class="card">
            <div class="label">${hasCand ? 'Candidates Interviewed' : 'Total Interviews Managed'}</div>
            <div class="value">${(hasCand ? candInterviewed : interviewCount).toLocaleString()}</div>
            <div class="sub">${hasCand
              ? (() => {
                  // 🚨 These two sets OVERLAP — the headline is their union, not their sum. Printing them
                  // as "578 interviewed · 93 assessed" invited the reader to add them and find 671 against
                  // a headline of 643 (Jerin, 2026-08-29). Name the overlap so the arithmetic closes.
                  const both = Math.max(0, panelPeople + assessedPeople - candInterviewed);
                  return both > 0
                    ? `${panelPeople.toLocaleString()} sat an interview, ${assessedPeople.toLocaleString()} took an assessment, ${both.toLocaleString()} did both`
                    : `${panelPeople.toLocaleString()} sat an interview \u00b7 ${assessedPeople.toLocaleString()} took an assessment`;
                })()
              : `${(anyByQuarter ? panelistsInPeriod.length : (data.interviewers || []).length)} panelists${hasIq ? '' : ' · all time'}`}</div>
          </div>
          <div class="card">
            <div class="label">Total Hired</div>
            <div class="value" style="color:var(--green)">${(f.hired || 0).toLocaleString()}</div>
            <div class="sub">${convRate}% conversion</div>
          </div>
          <div class="card">
            <div class="label">Fill Rate</div>
            <div class="value" style="color:var(--green)">${fillRate}%</div>
            <div class="sub">${totalFilled} of ${totalPositions} joined</div>
          </div>
        </div>
      </div>

      <div class="pipeline-wrap">
        <h3>Hiring Pipeline</h3>
        <div class="pipeline-flow">
          ${pipelineStages.map(s => {
            const flex = Math.max((s.value / maxPipeline) * 100, s.value > 0 ? 8 : 2);
            return `<div class="pipeline-col" style="flex:${flex.toFixed(1)}">
              <div class="stage" style="background:${s.color}">${s.value.toLocaleString()}</div>
              <div class="stage-label">${s.label}</div>
            </div>`;
          }).join('')}
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <div style="min-width:0;">
          <h3 class="subsection-title" style="margin-top:0;">Positions by Department</h3>
          <div style="background:var(--card);border:1px solid var(--border);border-radius:8px;overflow:hidden;">
            ${deptArr.length === 0 ? '<div style="padding:16px;text-align:center;color:var(--muted);font-size:13px;">No opening data for this period</div>' :
              deptArr.slice(0, 6).map(([ dept, v ], i) => {
                const joinedPct = Math.round((v.joined / maxDeptTotal) * 100);
                const openPct = Math.round((v.open / maxDeptTotal) * 100);
                const missedPct = Math.round(((v.missed || 0) / maxDeptTotal) * 100);
                return `
                  <div style="padding:8px 12px;border-bottom:1px solid var(--border);${i === Math.min(deptArr.length, 6) - 1 ? 'border:none;' : ''}">
                    <div style="display:flex;justify-content:space-between;margin-bottom:4px;gap:10px;">
                      <span style="display:flex;gap:10px;min-width:0;">
                        <span style="font-size:11px;color:var(--muted);width:16px;text-align:right;flex-shrink:0;">${i + 1}</span>
                        <span style="font-weight:500;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${dept}</span>
                      </span>
                      <span style="font-size:12px;white-space:nowrap;"><span class="good">${v.joined}</span> <span style="color:var(--muted)">/ ${v.total}</span></span>
                    </div>
                    <div style="display:flex;height:6px;border-radius:3px;overflow:hidden;background:var(--border-light);margin-left:26px;">
                      <div style="width:${joinedPct}%;background:var(--green);"></div>
                      <div style="width:${openPct}%;background:var(--blue);"></div>
                      <div style="width:${missedPct}%;background:var(--red);"></div>
                    </div>
                  </div>
                `;
              }).join('')}
          </div>
        </div>

        <div style="min-width:0;">
          <h3 class="subsection-title" style="margin-top:0;">Top Jobs by Hired</h3>
          <div style="background:var(--card);border:1px solid var(--border);border-radius:8px;overflow:hidden;">
            ${hiredJobs.length === 0 ? '<div style="padding:16px;text-align:center;color:var(--muted);font-size:13px;">No hire data for this period</div>' :
              hiredJobs.map((j, i) => {
                const pct = hiredJobs[0].hired > 0 ? Math.max(Math.round((j.hired / hiredJobs[0].hired) * 100), 3) : 0;
                return `
                  <div style="padding:8px 12px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;${i === hiredJobs.length - 1 ? 'border:none;' : ''}">
                    <span style="font-size:11px;color:var(--muted);width:16px;text-align:right;">${i + 1}</span>
                    <div style="flex:1;min-width:0;">
                      <div style="font-weight:500;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${j.title}</div>
                      <div style="margin-top:4px;background:var(--border-light);border-radius:3px;height:6px;overflow:hidden;">
                        <div style="width:${pct}%;height:100%;background:var(--green);border-radius:3px;"></div>
                      </div>
                    </div>
                    <div style="text-align:right;white-space:nowrap;">
                      <div style="font-weight:700;font-size:13px;color:var(--green)">${j.hired}</div>
                      <div style="font-size:10px;color:var(--muted);font-weight:600;">${j.applied.toLocaleString()} apps</div>
                    </div>
                  </div>
                `;
              }).join('')}
          </div>
        </div>

        <div style="min-width:0;">
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

        <div style="min-width:0;">
          <h3 class="subsection-title" style="margin-top:0;">Top Panelists by Interview Count</h3>
          <div style="background:var(--card);border:1px solid var(--border);border-radius:8px;overflow:hidden;">
            ${(() => {
              const tp = panelistsInPeriod.slice(0, 5);
              if (!tp.length || !tp[0].interviews) return '<div style="padding:16px;text-align:center;color:var(--muted);font-size:13px;">No interview data for this period</div>';
              return tp.map((p, i) => {
                const pct = tp[0].interviews > 0 ? Math.max(Math.round((p.interviews / tp[0].interviews) * 100), 3) : 0;
                return `
                  <div style="padding:8px 12px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;${i === tp.length - 1 ? 'border:none;' : ''}">
                    <span style="font-size:11px;color:var(--muted);width:16px;text-align:right;">${i + 1}</span>
                    <div style="flex:1;min-width:0;">
                      <div style="font-weight:500;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.name}</div>
                      <div style="margin-top:4px;background:var(--border-light);border-radius:3px;height:6px;overflow:hidden;">
                        <div style="width:${pct}%;height:100%;background:var(--accent);border-radius:3px;"></div>
                      </div>
                    </div>
                    <div style="text-align:right;white-space:nowrap;">
                      <div style="font-weight:700;font-size:13px;">${(p.interviews || 0).toLocaleString()}</div>
                    </div>
                  </div>
                `;
              }).join('');
            })()}
          </div>
        </div>
      </div>
    `;
  }

  sel.addEventListener('change', renderData);
  renderData();
}

// Sums openingBuckets over the selected period. Each opening is counted once, in the
// quarter it was opened, so a role opened in Q2 still counts toward Q2 while it stays
// open. Returns null when the data file predates openingBuckets so callers can fall back.
function aggregateOpenings(data, val, isQuarter, year) {
  const ob = data.openingBuckets;
  if (!ob || Object.keys(ob).length === 0) return null;
  const pendingByJobQ = data.openingPendingByJobQ || {};
  const tot = { total: 0, joined: 0, open: 0, missed: 0, pending: 0 };
  const byDept = {};
  Object.entries(ob).forEach(([job8, rec]) => {
    const dept = rec.department || 'Unknown';
    Object.entries(rec.quarters || {}).forEach(([q, b]) => {
      const inPeriod = isQuarter ? q === val : q.indexOf(year + '-') === 0;
      if (!inPeriod) return;
      const pending = (pendingByJobQ[job8] && pendingByJobQ[job8][q]) || 0;
      if (!byDept[dept]) byDept[dept] = { total: 0, joined: 0, open: 0, missed: 0, pending: 0 };
      ['total', 'joined', 'open', 'missed'].forEach(k => {
        tot[k] += b[k] || 0;
        byDept[dept][k] += b[k] || 0;
      });
      tot.pending += pending;
      byDept[dept].pending += pending;
    });
  });
  return { tot, byDept };
}

function getQuarterFromDate(dateStr) {
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const q = Math.floor(d.getMonth() / 3) + 1;
  return y + '-Q' + q;
}

