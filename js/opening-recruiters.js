// ===== #187 — the Recruiter level on the two Position Fulfilment tables =====
//
// The tree grows a level between the job and the topic:
//   Department ➔ Job ➔ Recruiter ➔ Specialisation
//
// 🔑 SAME CONTRACT AS `opening-topics.js`: the rows are built from `data.openingRows`, the per-opening list the
// pipeline emits from inside the SAME loop that fills `openingBuckets`. Apply the period filter the job row
// applied and the recruiter rows add up to the job BY CONSTRUCTION rather than by a second sum (Rule 3). The
// caller passes that filter in; this module never invents one. Measured 27 Sep: openingBuckets and openingRows
// agree exactly for Q3 — 204 total, 154 joined, zero jobs disagreeing.
//
// 🚨 BOTH HALVES OF THE TABLE SPLIT (Jerin, 27 Sep: *"Both openings & people have to split recruiter-wise"*).
// The counting half splits by the position's OWNER. The people half — who joined, who is joining, offer drops —
// splits by `recruiterOfPerson()` below. They are different questions and the wrong answer to the second is how
// a row ends up with names and numbers describing different people.
//
// 🚨 A `(recruiter not set)` row is NOT optional, and it is a CATCH-ALL, not merely "openings with no owner":
// `closeToJob()` also pushes into it any position the job counted that this index could not see (an archived
// opening, or data older than `openingRowsFrom`). Without that the children stop summing to the parent — this
// project's favourite bug.
//
// ⚠ Old data has no `openingRows`. Then `recruiterIndex` returns an empty index, every job stays a leaf, and the
// tables render exactly as they did before. Never assume the field exists.

/** What a recruiter row shows when no recruiter can be named. Matches the house wording already on the site —
 *  `(topic not set)`, `(source not recorded)`. Jerin, 27 Sep: kept over "No Recruiter" for consistency. */
export const NO_RECRUITER = '(recruiter not set)';

/**
 * Group the openings of the selected period by job, then by the recruiter who OWNS each opening.
 *
 * @param {object} data  the dashboard payload
 * @param {object} sel   the SAME period selection the job rows used:
 *                       { wholeWin, winQs, dayOK, inDay } — see topicIndex(), which this mirrors exactly.
 * @returns {{byJob: object, ownerOf: object}}
 *   byJob   → { [job8]: Array<{recruiter,total,joined,open,missed,jpTied,openings}> }, biggest first,
 *             `(recruiter not set)` always last.
 *   ownerOf → { [openingId]: recruiter } for every opening IN PERIOD. This is the half topicIndex never
 *             needed: attributing a PERSON needs to look up the owner of the position their offer names.
 */
export function recruiterIndex(data, sel) {
  const rows = (data && data.openingRows) || null;
  if (!rows || !rows.length) return { byJob: {}, ownerOf: {} };

  const take = (r) => {
    if (sel.wholeWin) return sel.winQs.includes(r.quarter);
    if (sel.dayOK) return !!r.day && sel.inDay(r.day);
    return false;
  };

  const byJob = {};
  const ownerOf = {};
  rows.forEach((r) => {
    if (!take(r)) return;
    // An opening carries `owners` as a LIST. Measured 27 Sep: 198 of 204 name exactly one and 6 name none —
    // no opening has two, so there is no credit split to design around here (that lives on the Recruiter tab,
    // where `share` divides an opening 1/n). Taking [0] is the whole rule; it is not a simplification that
    // loses anybody today, and a second owner would land in the first owner's row rather than vanish.
    const who = (r.owners && r.owners[0]) || NO_RECRUITER;
    if (r.openingId) ownerOf[r.openingId] = who;
    const job = byJob[r.jobId8] || (byJob[r.jobId8] = {});
    const t = job[who] || (job[who] = { recruiter: who, total: 0, joined: 0, open: 0, missed: 0, jpTied: 0, openings: [] });
    t.total++;
    if (r.state === 'joined' || r.state === 'open' || r.state === 'missed') t[r.state]++;
    t.jpTied += r.jpTied || 0;
    t.openings.push({ id: r.openingId, state: r.state, topic: r.topic || null, quarter: r.quarter,
                      jpTied: r.jpTied || 0, share: r.share || 0 });
  });

  const out = {};
  Object.keys(byJob).forEach((job8) => {
    out[job8] = Object.values(byJob[job8]).sort(cmp);
  });
  return { byJob: out, ownerOf };
}

function cmp(a, b) {
  // the catch-all sits last however big it is: it is a backlog marker, not a recruiter
  if (a.recruiter === NO_RECRUITER) return 1;
  if (b.recruiter === NO_RECRUITER) return -1;
  if (b.total !== a.total) return b.total - a.total;
  return a.recruiter.localeCompare(b.recruiter);
}

/**
 * Which recruiter a PERSON belongs to — the rule for the people half of the table.
 *
 * 🔑 THE POSITION WINS WHERE THERE IS ONE. If the person's record names an opening this period counted, they
 * belong to whoever owns that position; otherwise they belong to whoever worked them. Measured 27 Sep: that
 * places EVERY person — 157 of 157 joiners, 14 of 14 in the joining pipeline, 12 of 12 offer drops — where the
 * position alone would have placed 9 of 14 and none of the drops, and the person alone would have disagreed
 * with the position on 1 of the 9 cases where both are known.
 * ⚠ The balance shifts toward the position on its own as more offers carry an opening: 0% of offers raised
 * before Jul 2026 named one, 100% of those raised since August do (Rule 8).
 */
export function recruiterOfPerson(idx, who) {
  if (!who) return NO_RECRUITER;
  const byPos = who.openingId && idx.ownerOf ? idx.ownerOf[who.openingId] : null;
  return byPos || who.recruiter || NO_RECRUITER;
}

/**
 * Make a job's recruiter rows add up to the job row, whatever the index could not see.
 *
 * The counting half comes from `openingBuckets`; these rows come from `openingRows`. They agree today, but an
 * ARCHIVED opening is absent from `openingRows` (that is why #183b had to price Jana Gopi's drop from the
 * offer's own `openingComplexity`), and any data older than `openingRowsFrom` is absent too. Rather than let a
 * difference disappear, it is pushed into the catch-all row, where it reads as what it is.
 *
 * @returns the same array, with `(recruiter not set)` created or topped up when it is needed.
 */
export function closeToJob(rows, jobTotal, jobJoined) {
  const list = (rows || []).slice();
  const seenT = list.reduce((a, r) => a + r.total, 0);
  const seenJ = list.reduce((a, r) => a + r.joined, 0);
  const missT = Math.max(0, (jobTotal || 0) - seenT);
  const missJ = Math.max(0, (jobJoined || 0) - seenJ);
  if (!missT && !missJ) return list;
  let none = list.find((r) => r.recruiter === NO_RECRUITER);
  if (!none) {
    none = { recruiter: NO_RECRUITER, total: 0, joined: 0, open: 0, missed: 0, jpTied: 0, openings: [] };
    list.push(none);
  }
  none.total += missT;
  none.joined += missJ;
  none.open += Math.max(0, missT - missJ);
  return list.sort(cmp);
}

/** True when this job is worth opening to a recruiter level: more than one recruiter, or people to show under
 *  the one there is. A job whose every position belongs to the same person and which has nobody unplaced stays
 *  a plain row — a row that does not pretend to expand (the #157 rule, applied here). */
export function hasRecruiterLevel(rows, extraNames) {
  const n = (rows || []).length;
  return n > 1 || (n === 1 && !!extraNames);
}
