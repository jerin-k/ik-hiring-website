import { getData } from '../data.js';
import { defsBlock } from '../definitions.js';
import { canAccessPage } from '../access.js';
import { reportingQuarters } from '../period.js';   // #141e

// #135: kept from renderHome so a card only links to a tab this user may open.
let homeAccess = null;

export function renderHome(access) {
  homeAccess = access;
  const data = getData();
  if (!data) return '<p>Loading...</p>';

  // #141e (Jerin, 17 Sep): the quarters every other tab offers — Q3 2026 to the current quarter, newest first (#127). Overview used to
  // offer the whole year and Q1 / Q2 2026 (figures from before anything was cleaned up) and a Q4 that read all zeros before it began.
  return `
    <div id="home-period-holder" hidden>
      <div>
        <select id="period-selector" style="padding:0.375rem 0.75rem;border:1px solid var(--border);border-radius:0.375rem;font-size:0.75rem;font-weight:500;background:var(--card);color:var(--text);cursor:pointer;min-width:6.875rem;">
          ${reportingQuarters().slice().reverse().map(q => `<option value="${q}">${q.slice(5)} ${q.slice(0, 4)}</option>`).join('')}
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
    // 🚨 quarterly[q].topJobs is the ten jobs with the most APPLICATIONS that quarter (the pipeline sorts by
    // applied, then slices 10). Ranking THAT by hires answers "of the ten busiest roles, which hired most" —
    // not "which roles hired most". Roles that hire well on few applicants never appear: SME India roles hire
    // in double figures on <100 applications. For 2026-Q1 it hid 120 of the quarter's 159 hires and put two
    // jobs with ZERO hires in a top-five-by-hired list. The pipeline now also emits topJobsByHired off the
    // same jobCounts; until a refresh has run, drop the zero-hire rows rather than show a ranking we can't
    // compute — the definitions block says the quarter view is limited to the busiest roles.
    const qHired = isQuarter ? ((data.quarterly && data.quarterly[val] || {}).topJobsByHired || null) : null;
    const allJobs = qHired ? qHired
      : isQuarter ? topJobs.filter(j => j.hired > 0)
      : (data.jobs || []).filter(j => j.hired > 0);
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
    // 🚨 These are DISTINCT-PEOPLE counts deduped WITHIN a quarter, so adding four quarters double-counts
    // anyone assessed in two of them — while the card promises "counts once whether they sat one interview or
    // five". The pipeline now also emits a year-level distinct count; prefer it, and when it is absent say on
    // the card that the year figure is the quarters added up rather than passing a sum off as distinct people.
    const periodSum = (m, y) => !m ? null
      : isQuarter ? (m[val] || 0)
      : (y && y[year] != null) ? y[year]
      : Object.entries(m).reduce((s, [k, v]) => s + (k.startsWith(year + '-') ? v : 0), 0);
    const candInterviewed = periodSum(data.candidatesInterviewedByQuarter, data.candidatesInterviewedByYear);
    const panelPeople = periodSum(data.panelInterviewedByQuarter, data.panelInterviewedByYear);
    const assessedPeople = periodSum(data.assessedByQuarter, data.assessedByYear);
    // true when a YEAR is showing and no year-level distinct count exists, i.e. the figure is a sum of quarters
    const candIsQuarterSum = !isQuarter && !((data.candidatesInterviewedByYear || {})[year] != null);
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

    // #135 (Jerin, 15 Sep 2026 — option A "context cards", colours 1 "clear contrast"): each ranked panel opens with what
    // its rows add up to, the top three wear filled rank badges, jobs and panelists carry a department tag, and each card
    // ends with a link to the tab behind it — shown only when this user may open that tab.
    const ovEsc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const ovMedal = (i) => `<span class="ov-medal${i < 3 ? ' top' : ''}">${i + 1}</span>`;
    const ovPct = (pc) => (pc >= 70 ? 'hi' : pc >= 40 ? 'mid' : 'lo');
    const ovDeptTag = (d) => (d ? `<div class="ov-meta"><span class="ov-dept">${ovEsc(d)}</span></div>` : '');
    const ovLink = (route, label) => {
      let ok = false;
      try { ok = !!homeAccess && canAccessPage(homeAccess, route.split('/')[0]); } catch (e) { ok = false; }
      return ok ? `<a class="ov-link" href="#${route}">${label} →</a>` : '';
    };
    const hiredSum = hiredJobs.reduce((s, j) => s + (j.hired || 0), 0);
    const appSum = displayJobs.reduce((s, j) => s + (j.applied || 0), 0);
    const ovTop = panelistsInPeriod.slice(0, 5);
    const ovPanelOk = ovTop.length > 0 && ovTop[0].interviews > 0;
    const panSum = ovTop.reduce((s, p) => s + (p.interviews || 0), 0);
    // A person has no department in Ashby, so a panelist's tag is the department they INTERVIEWED FOR most in the period:
    // panelists[] holds one row per panelist per job, with that job's department and a per-quarter count. Rows with no
    // known job ('Unknown') are ignored; "+N" when they interviewed for more than one department.
    const ovPanelDept = (() => {
      const byName = {};
      (data.panelists || []).forEach(r => {
        const dept = r.dept && r.dept !== 'Unknown' ? r.dept : null;
        if (!dept) return;
        const bq = r.byQuarter;
        const n = !bq ? (r.interviews || 0)
          : isQuarter ? (bq[val] || 0)
          : Object.entries(bq).reduce((s, [k, v]) => s + (k.startsWith(year + '-') ? v : 0), 0);
        if (!n) return;
        const m = (byName[r.name] = byName[r.name] || {});
        m[dept] = (m[dept] || 0) + n;
      });
      const out = {};
      Object.entries(byName).forEach(([name, m]) => {
        const ds = Object.entries(m).sort((a, b) => b[1] - a[1]);
        out[name] = ds[0][0] + (ds.length > 1 ? ` +${ds.length - 1}` : '');
      });
      return out;
    })();

    container.innerHTML = `
      <div style="margin-bottom:1.5rem;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:1rem;margin-bottom:0.625rem;">
          <h3 class="subsection-title" style="margin:0;">Key Metrics — ${periodLabel}</h3>
          <span id="home-period-slot" style="flex-shrink:0"></span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:0.75rem;">
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
                  const split = both > 0
                    ? `${panelPeople.toLocaleString()} sat an interview, ${assessedPeople.toLocaleString()} took an assessment, ${both.toLocaleString()} did both`
                    : `${panelPeople.toLocaleString()} sat an interview \u00b7 ${assessedPeople.toLocaleString()} took an assessment`;
                  // a year with no year-level distinct count is the quarters added up — say so rather than
                  // letting "counts once" stand over a figure that counts a cross-quarter candidate twice
                  return split + (candIsQuarterSum ? ' \u00b7 quarters added up' : '');
                })()
              : `${(anyByQuarter ? panelistsInPeriod.length : (data.interviewers || []).length)} panelists${hasIq ? '' : ' · all time'}`}</div>
          </div>
          <div class="card">
            <div class="label">Applications Hired</div>
            <div class="value" style="color:var(--green)">${(f.hired || 0).toLocaleString()}</div>
            <div class="sub">${convRate}% of applications</div>
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

      <div class="ov-grid">
        <div class="ov-card">
          <div class="ov-head">
            <div class="ov-top"><h3 class="ov-title">Positions by Department</h3><span class="ov-chip">${ovEsc(periodLabel)}</span></div>
            <div class="ov-sum">${deptArr.length ? `<b>${totalFilled}</b> of <b>${totalPositions}</b> positions joined · <b>${totalOpen}</b> still open` : 'No opening data for this period'}</div>
          </div>
          <div class="ov-list">
            ${deptArr.slice(0, 6).map(([dept, v], i) => {
              const pc = v.total > 0 ? Math.round((v.joined / v.total) * 100) : 0;
              const seg = (n, cls) => (n ? `<i class="${cls}" style="width:${Math.round((n / maxDeptTotal) * 100)}%"></i>` : '');
              return `<div class="ov-row">${ovMedal(i)}<div class="ov-main"><div class="ov-name">${ovEsc(dept)}</div><div class="ov-bar">${seg(v.joined, 'j')}${seg(v.open, 'o')}${seg(v.missed || 0, 'm')}</div></div>`
                + `<div class="ov-val"><div class="ov-big"><span class="ov-ink">${v.joined}</span><span class="ov-of"> / ${v.total}</span></div><span class="ov-pct ${ovPct(pc)}">${pc}% joined</span></div></div>`;
            }).join('')}
            ${(() => {
              // Capped at six; the rest are summed on one line so the card still reconciles with Total Positions.
              const rest = deptArr.slice(6);
              if (!rest.length) return '';
              const rt = rest.reduce((s, [, v]) => s + v.total, 0);
              const rj = rest.reduce((s, [, v]) => s + v.joined, 0);
              return `<div class="ov-row ov-rest"><span></span><span class="ov-small">+ ${rest.length} more department${rest.length > 1 ? 's' : ''}</span><span class="ov-small">${rj} / ${rt}</span></div>`;
            })()}
          </div>
          <div class="ov-foot"><span class="ov-legend"><span><i class="j"></i>Joined</span><span><i class="o"></i>Open</span><span><i class="m"></i>Missed</span></span>${ovLink('hm-report/positions', 'Hiring Manager')}</div>
        </div>

        <div class="ov-card">
          <div class="ov-head">
            <div class="ov-top"><h3 class="ov-title">Top Jobs by Hired</h3><span class="ov-chip">${ovEsc(periodLabel)}</span></div>
            <div class="ov-sum">${hiredJobs.length ? `The top ${hiredJobs.length > 1 ? hiredJobs.length + ' jobs' : 'job'} made <b>${hiredSum}</b> hire${hiredSum === 1 ? '' : 's'}${hiredJobs.length > 1 ? ' between them' : ''}` : 'No hire data for this period'}</div>
          </div>
          <div class="ov-list">
            ${hiredJobs.map((j, i) => {
              const w = hiredJobs[0].hired > 0 ? Math.max(Math.round((j.hired / hiredJobs[0].hired) * 100), 3) : 0;
              return `<div class="ov-row">${ovMedal(i)}<div class="ov-main"><div class="ov-name">${ovEsc(j.title)}</div>${ovDeptTag(j.department)}<div class="ov-bar thin"><i class="h" style="width:${w}%"></i></div></div>`
                + `<div class="ov-val"><div class="ov-big ov-ink">${j.hired}</div><div class="ov-small">${(j.applied || 0).toLocaleString()} apps</div></div></div>`;
            }).join('')}
          </div>
          <div class="ov-foot"><span>Hires in the period</span>${ovLink('hm-report/positions', 'Hiring Manager')}</div>
        </div>

        <div class="ov-card">
          <div class="ov-head">
            <div class="ov-top"><h3 class="ov-title">Top Jobs by Applications</h3><span class="ov-chip">${ovEsc(periodLabel)}</span></div>
            <div class="ov-sum">${displayJobs.length ? `The top ${displayJobs.length > 1 ? displayJobs.length + ' jobs' : 'job'} drew <b>${appSum.toLocaleString()}</b> application${appSum === 1 ? '' : 's'}` : 'No application data for this period'}</div>
          </div>
          <div class="ov-list">
            ${displayJobs.map((j, i) => {
              const w = displayJobs[0].applied > 0 ? Math.max(Math.round((j.applied / displayJobs[0].applied) * 100), 3) : 0;
              return `<div class="ov-row">${ovMedal(i)}<div class="ov-main"><div class="ov-name">${ovEsc(j.title)}</div>${ovDeptTag(j.department)}<div class="ov-bar thin"><i class="a" style="width:${w}%"></i></div></div>`
                + `<div class="ov-val"><div class="ov-big">${(j.applied || 0).toLocaleString()}</div><div class="ov-small${j.hired ? ' ov-ink' : ''}">${j.hired || 0} hired</div></div></div>`;
            }).join('')}
          </div>
          <div class="ov-foot"><span>Applications in the period</span>${ovLink('hm-report/pipeline', 'Hiring Manager')}</div>
        </div>

        <div class="ov-card">
          <div class="ov-head">
            <div class="ov-top"><h3 class="ov-title">Top Panelists by Interview Count</h3><span class="ov-chip">${ovEsc(periodLabel)}</span></div>
            <div class="ov-sum">${ovPanelOk ? `${ovTop.length > 1 ? `The top ${ovTop.length} ran` : 'Ran'} <b>${panSum.toLocaleString()}</b> interview${panSum === 1 ? '' : 's'}` : 'No interview data for this period'}</div>
          </div>
          <div class="ov-list">
            ${ovPanelOk ? ovTop.map((pp, i) => {
              const w = ovTop[0].interviews > 0 ? Math.max(Math.round((pp.interviews / ovTop[0].interviews) * 100), 3) : 0;
              return `<div class="ov-row">${ovMedal(i)}<div class="ov-main"><div class="ov-name">${ovEsc(pp.name)}</div>${ovDeptTag(ovPanelDept[pp.name])}<div class="ov-bar thin"><i class="a" style="width:${w}%"></i></div></div>`
                + `<div class="ov-val"><div class="ov-big">${(pp.interviews || 0).toLocaleString()}</div><div class="ov-small">interviews</div></div></div>`;
            }).join('') : ''}
          </div>
          <div class="ov-foot"><span>Interviews in the period${anyByQuarter ? '' : ' · all time'}</span>${ovLink('hm-report/panelists', 'Panelists')}</div>
        </div>
      </div>
      ${defsBlock('overview')}
    `;
    // The selector is rendered in the page shell so its listener can be bound once, then moved into the
    // Key Metrics row here — same level as the heading, which is where Jerin asked for it.
    const slot = document.getElementById('home-period-slot');
    if (slot) slot.appendChild(sel);
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

