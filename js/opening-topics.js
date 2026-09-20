// ===== #157 — the Specialization/Topic level (SME - US and SME - India only) =====
//
// One job can run several topics, one per opening, so the tree grows a level:
//   Department ➔ Job ➔ Specialisation ➔ Opening
//
// 🔑 THE TOPIC ROWS MUST CLOSE THE JOB ROW. They are built from `data.openingRows`, which the pipeline
// emits from inside the SAME loop that fills `openingBuckets` — one row per opening × job, carrying the
// quarter and the India-time day the opening was opened. So as long as this module applies the SAME period
// filter the job row applied, the topics add up to the job by construction rather than by a second sum
// (CLAUDE.md Rule 3). The caller passes that filter in; this module never invents one.
//
// 🚨 A `(topic not set)` row is NOT optional. Every opening the job counted has to land in some topic row, or
// the level silently loses openings and the children stop summing to the parent — this project's favourite bug.
//
// ⚠ Old data has no `openingRows` (anything written before 20 Sep 2026). Then `topicIndex` returns an empty
// index, every job is a leaf, and the tables render exactly as they did before. Never assume the field exists.

/** The only two departments that grow a level. Jerin, 20 Sep: "only applies to SME India & US". */
export const TOPIC_DEPTS = new Set(['SME - US', 'SME - India']);
export const deptHasTopics = (dept) => TOPIC_DEPTS.has(dept);

/** What a topic row shows when the field has not been filled in. Q3 is almost entirely this, and that is
 *  CORRECT, not a broken join — the field ships for Q4 (Jerin, 20 Sep). */
export const NO_TOPIC = '(topic not set)';

/**
 * Group the openings of the selected period by job, then by topic.
 *
 * @param {object} data      the dashboard payload
 * @param {object} sel       the SAME period selection the job rows used:
 *                           { wholeWin:boolean, winQs:string[], dayOK:boolean, inDay:(day)=>boolean }
 *                           - wholeWin → take rows whose `quarter` is in winQs (a window covering whole quarters)
 *                           - else dayOK → take rows whose `day` falls in the window
 *                           This mirrors `openingBuckets` exactly: quarters when the window is whole, days when
 *                           it is narrower. Rows opened before the reporting floor carry `day: null` and are
 *                           dropped by a narrow window, exactly as `openingBuckets.days` drops them.
 * @returns {object}         { [job8]: Array<{topic,total,joined,open,missed,jpTied,openings}> }
 *                           sorted by total descending, with `(topic not set)` always last.
 */
export function topicIndex(data, sel) {
  const rows = (data && data.openingRows) || null;
  if (!rows || !rows.length) return {};

  const take = (r) => {
    if (sel.wholeWin) return sel.winQs.includes(r.quarter);
    if (sel.dayOK) return !!r.day && sel.inDay(r.day);
    return false;
  };

  const byJob = {};
  rows.forEach((r) => {
    if (!take(r)) return;
    const job = byJob[r.jobId8] || (byJob[r.jobId8] = {});
    const key = r.topic || NO_TOPIC;
    const t = job[key] || (job[key] = { topic: key, total: 0, joined: 0, open: 0, missed: 0, jpTied: 0, openings: [] });
    t.total++;
    if (r.state === 'joined' || r.state === 'open' || r.state === 'missed') t[r.state]++;
    t.jpTied += r.jpTied || 0;
    // `quarter` rides along because Overall Efficiency prices each opening at the points of ITS OWN
    // quarter, exactly as jobSplit() prices the buckets. `owners`/`share` ride along for the Recruiter
    // page, where an opening's credit is split 1/n between co-recruiters.
    t.openings.push({ id: r.openingId, state: r.state, jpTied: r.jpTied || 0, quarter: r.quarter,
                      owners: r.owners || [], share: r.share || 0 });
  });

  const out = {};
  Object.keys(byJob).forEach((job8) => {
    out[job8] = Object.values(byJob[job8]).sort((a, b) => {
      // the catch-all sits last however big it is: it is a backlog marker, not a topic
      if (a.topic === NO_TOPIC) return 1;
      if (b.topic === NO_TOPIC) return -1;
      if (b.total !== a.total) return b.total - a.total;
      return a.topic.localeCompare(b.topic);
    });
    out[job8].forEach((t) => t.openings.sort((x, y) => x.id.localeCompare(y.id)));
  });
  return out;
}

/** True when this job has a topic level worth drawing: an SME department AND at least one opening in period. */
export function hasTopicLevel(index, dept, job8) {
  return deptHasTopics(dept) && !!(index[job8] && index[job8].length);
}

/** How many of a job's openings still have no topic — the team's backlog for that job, for a quiet caption. */
export function untopiced(index, job8) {
  const rows = index[job8] || [];
  const none = rows.find((r) => r.topic === NO_TOPIC);
  return none ? none.total : 0;
}
