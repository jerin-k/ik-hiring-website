// #137 (Jerin, 15 Sep 2026 — option A of mock-up 1): the ONE home for the cells of the two people lists — Joining Pending and Joiners
// on Hiring Manager, Recruiter Efficiency and Overall Efficiency. State is carried by form, never by a new number: a Sub-Stage badge that
// fills in towards joining, a joining date that says when (rose once it has passed), chips for the opening quarter / Not linked /
// No recruiter, and the recruiter's initials in their pod's colour. Who is listed, the columns and the order stay with each caller.
// Every cell carries `data-sv`, so table-sort.js sorts on the value (a date, a quarter, the stage's place) and not on the words drawn round it.
// Styles: the `.pl-*` block at the end of style.css.
import { podOf, currentQuarter } from './recruiter-pods.js';
import { quarterOfDay } from './period.js';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const STAGES = ['Ref Check', 'Documentation', 'Offer Created', 'Offer Sent', 'Offer Accepted'];
const POD_CLASS = { 'Sales': 'sales', 'SME-US': 'smeus', 'SME-India': 'smein', 'Lateral': 'lateral', 'Others': 'others' };
const DASH = '<span class="zero">—</span>';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const isDay = (s) => /^\d{4}-\d{2}-\d{2}/.test(s || '');
const utcDay = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const todayUtc = () => { const n = new Date(); return Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()); };
// The quarter a chip or a pod colour is judged against: the day's own quarter (a start date), else the quarter we are in (a live list).
const refQuarter = (day) => (isDay(day) ? quarterOfDay(day) : currentQuarter());

export function tdCandidate(name, style) {
  return `<td class="pl-cand"${style ? ` style="${style}"` : ''}>${name ? esc(name) : DASH}</td>`;
}
export const tdDept = (d) => `<td class="pl-dept">${d ? esc(d) : DASH}</td>`;
export const tdJob = (j) => `<td class="pl-job">${j ? esc(j) : DASH}</td>`;

// `refDay` = the person's start date on Joiners; left out on Joining Pending, which is judged against today's quarter.
export function tdQuarter(q, refDay) {
  if (!q) return '<td data-sv=""><span class="pl-chip pl-fix">Not linked</span></td>';
  const ref = refQuarter(refDay), earlier = q < ref;
  const title = earlier ? ` title="An opening from ${q.slice(5)} ${q.slice(0, 4)}, before ${ref.slice(5)} ${ref.slice(0, 4)}"` : '';
  return `<td data-sv="${q.replace('-Q', '')}"><span class="pl-chip${earlier ? ' pl-prev' : ''}"${title}>${q.slice(5)} ${q.slice(0, 4)}</span></td>`;
}

export function tdMonth(day) {
  if (!isDay(day)) return `<td data-sv="">${DASH}</td>`;
  return `<td class="pl-mon" data-sv="${day.slice(0, 7).replace('-', '')}">${MON[+day.slice(5, 7) - 1]} ${day.slice(0, 4)}</td>`;
}

// live: a Joining Pending date — how far away it is, rose once it has passed (they are still not moved to Hired).
// Otherwise a start date on Joiners — just the weekday under it.
export function tdDoj(day, { live = false } = {}) {
  if (!isDay(day)) return `<td data-sv="">${live ? '<span class="pl-chip pl-unset">Not set</span>' : DASH}</td>`;
  const t = utcDay(day), dt = new Date(t), sv = day.slice(0, 10).replace(/-/g, '');
  const sameYear = dt.getUTCFullYear() === new Date().getFullYear();
  const shown = `${dt.getUTCDate()} ${MON[dt.getUTCMonth()]}${sameYear ? '' : ' ' + dt.getUTCFullYear()}`, wd = WD[dt.getUTCDay()];
  // #153 (Jerin, 19 Sep 2026): the caption under the joining date is GONE on BOTH lists — the bare weekday on
  // Joiners (F2) and the countdown on Joining Pending (F). 🚨 What the countdown also carried was the LATE
  // signal, and that is not lost: the `pl-passed` / `pl-today` classes stay on the cell and now colour the DATE
  // itself, so a joining date that has gone by without the person being moved to Hired still reads rose at a
  // glance. The full sentence is still on hover, in the cell's title.
  if (!live) return `<td class="pl-doj" data-sv="${sv}" title="${day.slice(0, 10)}"><b>${shown}</b></td>`;
  const diff = Math.round((t - todayUtc()) / 864e5);
  if (diff < 0) {
    return `<td class="pl-doj pl-passed" data-sv="${sv}" title="${day.slice(0, 10)} — the joining date has passed and they are not moved to Hired yet: ${-diff} day${diff === -1 ? '' : 's'} ago">`
      + `<b>${shown}</b></td>`;
  }
  if (diff === 0) return `<td class="pl-doj pl-today" data-sv="${sv}" title="${day.slice(0, 10)} — today"><b>${shown}</b></td>`;
  const when = diff === 1 ? 'tomorrow' : diff <= 13 ? `in ${diff} days` : `in ${Math.round(diff / 7)} weeks`;
  return `<td class="pl-doj" data-sv="${sv}" title="${day.slice(0, 10)} — ${wd} · ${when}"><b>${shown}</b></td>`;
}

// The badge fills in one step per stage of closing, so it darkens as the person gets closer to joining; it sorts in that order too.
export function tdStage(s) {
  if (!s) return `<td data-sv="">${DASH}</td>`;
  const k = STAGES.indexOf(s) + 1;
  if (!k) return `<td data-sv="${esc(s)}"><span class="pl-stage pl-s0">${esc(s)}</span></td>`;
  const ticks = [1, 2, 3, 4, 5].map((i) => `<i${i <= k ? ' class="on"' : ''}></i>`).join('');
  return `<td data-sv="${k}"><span class="pl-stage pl-s${k}"><span class="pl-ticks" aria-hidden="true">${ticks}</span>${s}</span></td>`;
}

// The class suffix for a pod's colour (`pl-pod-<x>` here, `pod-<x>` on Admin's pod dropdowns — #137b). Unassigned / unknown = 'none'.
export const podClass = (pod) => POD_CLASS[pod] || 'none';

export function avatar(name, pod) {
  const p = String(name || '').trim().split(/\s+/).filter(Boolean);
  const ini = !p.length ? '' : p.length === 1 ? p[0].slice(0, 2) : p[0][0] + p[p.length - 1][0];
  return `<span class="pl-av pl-pod-${podClass(pod)}" aria-hidden="true">${esc(ini.toUpperCase())}</span>`;
}

// `refDay` as for tdQuarter: the pod is the recruiter's pod in the quarter of the start date, else today's.
export function tdRecruiter(name, refDay) {
  if (!name || name === 'Unassigned') return '<td data-sv=""><span class="pl-chip pl-fix">No recruiter</span></td>';
  return `<td data-sv="${esc(name)}"><span class="pl-rec">${avatar(name, podOf(name, refQuarter(refDay)))}${esc(name)}</span></td>`;
}

export const tdLinked = (linked) => (linked
  ? '<td data-sv="1"><span class="pl-chip pl-ok">Linked</span></td>'
  : '<td data-sv="0"><span class="pl-chip pl-fix">Not linked</span></td>');

export const countTag = (n) => `<span class="pl-count">${n}</span>`;

// ===== #168 part 2 (Jerin, 23 Sep 2026): "need to have the names called" =====
// The two people lists already name everyone. What they never said is WHICH TOPIC each person was really for —
// and, when that cannot be shown, WHY. Without the why, a blank reads as "no topic exists" when the truth is
// usually "nobody linked the offer to an opening", which is a different job for a different person.
//
// 🔑 JERIN'S RULE, the same one that scopes the Data Hygiene list: this only means anything on a job where
//    OTHER openings already carry a real topic. A job that does not use topics at all gets a plain dash, not a
//    reproach — and a topic typed as "NA" is not a topic, which is how those openings are NAMED (#159).
//
// topicLookup(data) is built once per render and handed to tdTopic, so a list of 200 people does not rebuild it
// 200 times, and both lists read the identical index — they can never disagree about who is on which topic.
const NOT_A_TOPIC = /^(na|n\/a|n\.a\.|none|-|--)$/i;
export const realTopic = (t) => {
  const s = String(t ?? '').trim();
  return s && !NOT_A_TOPIC.test(s) ? s : null;
};

// Memoised on the data object itself, so a caller can say topicLookup(data) inside a per-row cell function
// without rebuilding the index for every person. A new payload (a refresh) is a new object, so it rebuilds then
// and only then.
let tlData = null, tlIdx = null;
export function topicLookup(data) {
  if (data && data === tlData && tlIdx) return tlIdx;
  const byOpening = {}, jobUses = {};
  ((data && data.openingRows) || []).forEach((r) => {
    const t = realTopic(r.topic);
    if (r.openingId) byOpening[String(r.openingId).slice(0, 8)] = t;
    if (t && r.jobId8) jobUses[r.jobId8] = true;
  });
  tlData = data; tlIdx = { byOpening, jobUses };
  return tlIdx;
}

// `why` is deliberately plain English and deliberately NOT a number: it names the next action.
export function tdTopic(openingId, job8, idx) {
  const known = idx || { byOpening: {}, jobUses: {} };
  if (!known.jobUses[job8]) return `<td class="pl-topic" data-sv="">${DASH}</td>`;   // this job does not use topics
  const key = String(openingId ?? '').slice(0, 8);
  const why = (txt) => `<td class="pl-topic" data-sv=""><span class="pl-topic-why">${txt}</span></td>`;
  if (!key) return why('no opening on the offer');
  if (!(key in known.byOpening)) return why('opening not in this period');
  const t = known.byOpening[key];
  return t ? `<td class="pl-topic" data-sv="${esc(t)}">${esc(t)}</td>` : why('opening has no topic');
}
