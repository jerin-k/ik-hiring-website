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
// 🚨 BOTH HALVES OF THE TABLE SPLIT (Jerin, 27 Sep: *"Both openings & people have to split recruiter-wise"*),
// AND THEY SPLIT ON DIFFERENT THINGS — settled by Jerin on 28 Sep 2026 (#192):
//   the counting half — total, joined, open — splits by the POSITION's owner (this file's `recruiterIndex`);
//   the people half   — who joined, who is joining, offer drops — splits by the CANDIDATE's own recruiter.
// 🗣 *"While the Opening Count against a recruiter can be taken from Opening's Hiring team, the names under
//     'Who joined' & 'Who is joining' should be calculated as per the Candidates 'Hiring Team'."*
// They are different questions and the wrong answer to the second is how a row ends up with names and numbers
// describing different people.
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
 *
 * ⚠ #192 (28 Sep 2026) REMOVED the `ownerOf` half of this return. It existed for one caller — the old
 *   `recruiterOfPerson`, which filed a PERSON under the owner of the position their offer named. That rule is
 *   gone, so the map has no consumer. It is deleted rather than left unused, because leaving it invites the
 *   exact re-wiring #192 undid.
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
  rows.forEach((r) => {
    if (!take(r)) return;
    // An opening carries `owners` as a LIST. Measured 27 Sep: 198 of 204 name exactly one and 6 name none —
    // no opening has two, so there is no credit split to design around here (that lives on the Recruiter tab,
    // where `share` divides an opening 1/n). Taking [0] is the whole rule; it is not a simplification that
    // loses anybody today, and a second owner would land in the first owner's row rather than vanish.
    const who = (r.owners && r.owners[0]) || NO_RECRUITER;
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
  return { byJob: out };
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
 * 🔑 THE RECRUITER WHO WORKED THEM, ALWAYS. A person who joined, is joining, or dropped after an offer counts
 * against the Recruiter on the CANDIDATE's own hiring team. The position their offer happens to name never
 * decides who they belong to — that is the other half of the table, and it is a different question.
 *
 * 🚨 #192 (Jerin, 28 Sep 2026) REVERSED #187 HERE. #187 read "the position wins where there is one", so a
 * person whose offer named someone else's position was both LISTED and COUNTED under that owner. Jerin caught
 * it live: Digvijay Singh Shekhawat, worked by Praveetha A, sat in Leenita Joseph Albert's Joining pipeline
 * because his offer names a position Leenita owns. 🗣 *"Digvijay who is mentioned a Joining pending is
 * Pravee's candidate - but is reflecting againsdt Leenita."*
 *
 * ⚠ IT LOOKED LIKE ONE STRAY ROW AND WAS NOT. The rule was almost never REACHED, by accident: `openingRows`
 * stores an 8-character opening id while `offerEvents` and `dropEvents` store the full 36-character uuid, so
 * the lookup missed every joiner (0 of 117 that carry one) and every drop, and only the joining pipeline — whose
 * ids the pipeline already truncates — ever matched. Measured 28 Sep: had those ids lined up, the old rule would
 * have re-filed 110 of 157 joiners and 6 of 12 drops, moving 5 more people onto a recruiter who never worked
 * them. A one-character "tidy-up" of that mismatch would have done it silently. The rule is gone, so the
 * mismatch is now harmless.
 */
export function recruiterOfPerson(who) {
  return (who && who.recruiter) || NO_RECRUITER;
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
