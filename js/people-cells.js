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

export function tdCandidate(name, style, caption) {
  return `<td class="pl-cand"${style ? ` style="${style}"` : ''}>${name ? esc(name) : DASH}${caption || ''}</td>`;
}

// ===== #176b (Jerin, 25 Sep 2026) — a person's points, as a CAPTION under their name =====
// 🗣 "i just need point mentioned as a caption = below the name dude :)" — NOT a new column. Two column
// designs were mocked and both rejected: the table is already eight columns wide, so a Points column either
// falls off the right edge or pushes everything along. The page already had the lighter convention sitting
// on its job rows ("L2 · Normal · 20pt"); this is the same idea one level down.
// 🔑 ONE helper for every list, so the Recruiter tab and Overall Efficiency cannot word or style it
// differently (Rule 3). Scope is those two tabs only — the Hiring Manager tab is deliberately NOT included
// (Jerin: "Dont need it in HM"), which costs nothing here because HM simply never passes a caption.
// A zero says WHY in amber: with 8 of 156 joiners scoring zero today that is a short, fixable list, and a
// bare 0 is a number nobody can act on (the #165e rule).
export function pointsCaption(pts, reason) {
  if (pts == null) return '';
  const n = Math.round(pts);
  if (n > 0) return `<span class="pl-pts">${n} pt</span>`;
  return `<span class="pl-pts pl-pts-zero">0 pt${reason ? ` \u00b7 ${esc(reason)}` : ''}</span>`;
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
  const byOpening = {}, jobUses = {}, nameOf = {};
  ((data && data.openingRows) || []).forEach((r) => {
    const t = realTopic(r.topic);
    if (r.openingId) {
      const k = String(r.openingId).slice(0, 8);
      byOpening[k] = t;
      nameOf[k] = String(r.name || '').trim();   // #169: the opening's full name, "IK-403 - ..." (#159)
    }
    if (t && r.jobId8) jobUses[r.jobId8] = true;
  });
  tlData = data; tlIdx = { byOpening, jobUses, nameOf };
  return tlIdx;
}

// `why` is deliberately plain English and deliberately NOT a number: it names the next action.
export function tdTopic(openingId, job8, idx) {
  const known = idx || { byOpening: {}, jobUses: {} };
  if (!known.jobUses[job8]) return `<td class="pl-topic" data-sv="">${DASH}</td>`;   // this job does not use topics
  const key = String(openingId ?? '').slice(0, 8);
  const why = (txt) => `<td class="pl-topic" data-sv=""><span class="pl-topic-why">${txt}</span></td>`;
  // #169: the Opening column beside this one already says "no opening on the offer" / "not in this period", so
  // saying it again here would be noise. This column answers exactly one question: which TOPIC.
  if (!key || !(key in known.byOpening)) return `<td class="pl-topic" data-sv="">${DASH}</td>`;
  const t = known.byOpening[key];
  return t ? `<td class="pl-topic" data-sv="${esc(t)}">${esc(t)}</td>` : why('opening has no topic');
}

// ===== #169 (Jerin, 23 Sep 2026): "Opening & Topic to be 2 columns; makes life cleaner/clearer for all" =====
// The opening's FULL NAME - "IK-403 - <recruiter> - <Role Type> - <topic or NA>" (#159) - which is what the team
// actually recognises. NOT gated on whether the job uses topics: every person either has an opening or does not,
// and that is worth knowing on every role, not just SME ones.
// ⚠ Until the pipeline's next run the name is absent (it was added to openingRows on 23 Sep), so this falls back
//   to the 8-character id rather than showing an empty column. It upgrades itself at the next refresh.
export function tdOpening(openingId, idx) {
  const known = idx || { byOpening: {}, nameOf: {} };
  const key = String(openingId ?? '').slice(0, 8);
  const why = (txt) => `<td class="pl-open-name" data-sv=""><span class="pl-topic-why">${txt}</span></td>`;
  if (!key) return why('no opening on the offer');
  if (!(key in known.byOpening)) return why('not in this period');
  const nm = (known.nameOf || {})[key];
  if (nm) return `<td class="pl-open-name" data-sv="${esc(nm)}">${esc(nm)}</td>`;
  return `<td class="pl-open-name" data-sv="${esc(key)}" title="The opening's name arrives with the next data refresh.">`
    + `<span class="pl-open-id">${esc(key)}</span></td>`;
}
