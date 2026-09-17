import { defsBlock } from '../definitions.js';
import { DEPT_TREE } from '../dept-map.js';
import { podOf, POD_OPTIONS, setPod, capacityOf, setCapacity, currentQuarter, qKey } from '../recruiter-pods.js';
import { userTypeOf, setUserType, USER_TYPES, sourcerOnlyNames, getRecruiterDates, setRecruiterDate, recruiterInQuarter } from '../metric-config.js';   // #11b · #111
import { markDirty, isDirty, getMeta, publishConfig, configFileText, collectConfig } from '../metric-config.js';
import { publishAccess, accessFileText, sendInvite, fetchInvites } from '../access-config.js';
import { getCurrentUser } from '../auth.js';
import { avatar, podClass, countTag } from '../people-cells.js';   // #137b: the same initials, pod colours and count tags as the people lists

// ===== Metric Configuration model (moved here from Recruiter Efficiency 2026-08-09) =====
// See memory project_recruiter-score-model. A role's Score = Family + Level + Complexity → grid → points.
const SCORE_TIERS = [['Vanilla', 6], ['Regular', 12], ['Semi-Niche', 15], ['Niche', 20], ['Super Niche', 40], ['Leadership', 60], ['Senior Leadership', 120]];
const CLASSIFICATIONS = [
  ['India SME', 'India SME - Normal', 'Vanilla'], ['India SME', 'India SME - Complex', 'Regular'], ['India SME', 'India SME - Uber Complex', 'Semi-Niche'],
  ['US SME', 'US SME - Normal', 'Regular'], ['US SME', 'US SME - Complex', 'Semi-Niche'], ['US SME', 'US SME - Uber Complex', 'Niche'],
  ['PA', 'India PA Junior', 'Vanilla'], ['PA', 'India PA', 'Regular'], ['PA', 'US PA Junior', 'Vanilla'], ['PA', 'US PA', 'Semi-Niche'],
  ['NonTech', 'NonTech - Intern - Normal', 'Vanilla'], ['NonTech', 'NonTech - Intern - Complex', 'Regular'], ['NonTech', 'NonTech L1 to L3 - Normal', 'Semi-Niche'], ['NonTech', 'NonTech L1 to L3 - Complex', 'Niche'], ['NonTech', 'NonTech L4 to L6 - Normal', 'Niche'], ['NonTech', 'NonTech L4 to L6 - Complex', 'Super Niche'],
  ['Tech', 'Tech - Intern - Normal', 'Regular'], ['Tech', 'Tech - Intern - Complex', 'Semi-Niche'], ['Tech', 'Tech L1 to L3 - Normal', 'Niche'], ['Tech', 'Tech L1 to L3 - Complex', 'Super Niche'], ['Tech', 'Tech L4 to L6 - Normal', 'Super Niche'], ['Tech', 'Tech L4 to L6 - Complex', 'Leadership'],
  ['Leadership', 'L7 - L8', 'Leadership'], ['Leadership', 'L9 & above', 'Senior Leadership'],
];
const FAMILY_OPTIONS = ['India SME', 'US SME', 'India PA', 'US PA', 'NonTech', 'Tech', 'Leadership', 'Exclude'];
const DEPT_FAMILY_DEFAULT = [
  ['SME - India', 'India SME', ''], ['SME - US', 'US SME', ''], ['Engineering', 'Tech', 'Tech = Engineering only'],
  ['IT', 'NonTech', ''], ['Curriculum', 'NonTech', ''],
  ['Business - India', 'India PA', 'PA if title = Program Advisor, else NonTech'], ['US Business', 'US PA', 'PA if title = Program Advisor, else NonTech'],
  ['Marketing', 'NonTech', ''], ['Operations', 'NonTech', ''], ['Finance', 'NonTech', ''], ['Human Resource', 'NonTech', ''],
  ['Talent Acquisition', 'NonTech', ''], ['New Programs', 'NonTech', ''], ["Founder's Office", 'NonTech', ''], ['B2B', 'NonTech', ''], ['Test', 'Exclude', ''],
];
const LEVEL_BANDS = [['Intern', 'L0'], ['Junior (PA/Sales only)', 'L1'], ['L1–L3', 'L1, L2, L3'], ['L4–L6', 'L4, L5, L6'], ['L7–L8', 'L7, L8'], ['L9 & above', 'L9–L12']];

const GRID_LS = 'ik_score_grid_q';   // { "2026-Q3": { tierPoints:{}, rowTier:{} } } — per quarter, copy-forward
const DEPT_FAM_LS = 'ik_dept_family';
function defaultGrid() {
  const tierPoints = {}; SCORE_TIERS.forEach(([n, p]) => { tierPoints[n] = p; });
  const rowTier = {}; CLASSIFICATIONS.forEach(([, cls, tier]) => { rowTier[cls] = tier; });
  return { tierPoints, rowTier };
}
function loadGridStore() { try { return JSON.parse(localStorage.getItem(GRID_LS) || '{}'); } catch (e) { return {}; } }
function saveGridStore(o) { localStorage.setItem(GRID_LS, JSON.stringify(o)); }
function gridQRank(k) { const m = /^(\d{4})-Q([1-4])$/.exec(k || ''); return m ? parseInt(m[1], 10) * 10 + parseInt(m[2], 10) : 0; }
function gridForQuarter(quarter) {
  const store = loadGridStore();
  if (store[quarter]) return store[quarter];
  const target = gridQRank(quarter); let best = null, br = -1;
  for (const k of Object.keys(store)) { const r = gridQRank(k); if (r <= target && r > br) { br = r; best = store[k]; } }
  return best ? JSON.parse(JSON.stringify(best)) : defaultGrid();
}
function materialiseGrid(quarter) { const s = loadGridStore(); if (!s[quarter]) { s[quarter] = gridForQuarter(quarter); saveGridStore(s); } return s; }
function setGridTier(quarter, cls, tier) { const s = materialiseGrid(quarter); s[quarter].rowTier[cls] = tier; saveGridStore(s); }
function setGridPoints(quarter, tier, pts) { const s = materialiseGrid(quarter); s[quarter].tierPoints[tier] = pts; saveGridStore(s); }
function loadDeptFamily() { try { return JSON.parse(localStorage.getItem(DEPT_FAM_LS) || '{}'); } catch (e) { return {}; } }
function saveDeptFamily(o) { localStorage.setItem(DEPT_FAM_LS, JSON.stringify(o)); }
function familyOf(dept) { const o = loadDeptFamily(); const d = DEPT_FAMILY_DEFAULT.find(x => x[0] === dept); return o[dept] || (d ? d[1] : ''); }

// Auto-capture the effective BASELINE for Publish. collectConfig() only snapshots explicit localStorage edits, so
// the very first publish (fresh browser, no edits) would send an empty config. This resolves what the readers
// ACTUALLY use — current-quarter pod assignments for the live roster + the effective score grid + the dept→family
// defaults — and merges them on top of any explicit edits (edits always win; this only FILLS gaps). Preserves
// every other quarter's edits untouched. See memory metric-config-serverside.
const POD_LS = 'ik_recruiter_pods_q', CAP_LS = 'ik_recruiter_capacity_q';
// The manual Active/Inactive override was RETIRED 2026-08-22. Status now comes from the Ashby SEAT: an
// active recruiter holds an elevated seat (UI roles Recruiter / Recruiter Admin = API globalRole
// 'Elevated Access' / 'Organization Admin'). NOTE isEnabled is useless here - it is true for all 446 Ashby
// users because IK never disables accounts, which is why every recruiter first appeared Active.
// Status is reported, never edited. Where no Ashby user matches, the pipeline says so
// (dataQuality.recruitersWithoutUserId) rather than defaulting to Active.
function buildEffectiveConfig(data) {
  const q = currentQuarter();
  const readLS = (k) => { try { return JSON.parse(localStorage.getItem(k) || '{}'); } catch (e) { return {}; } };
  const pods = readLS(POD_LS), capacity = readLS(CAP_LS), scoreGrid = loadGridStore(), deptFamily = loadDeptFamily();
  pods[q] = pods[q] || {}; capacity[q] = capacity[q] || {};
  ((data && data.recruiters) || []).forEach(r => {
    if (!r.name || r.name === 'Unassigned') return;
    // Only freeze a real pod (skip Unassigned so future baseline/edits still resolve for unmapped recruiters).
    if (pods[q][r.name] == null) { const p = podOf(r.name, q); if (p && p !== 'Unassigned') pods[q][r.name] = p; }
    if (capacity[q][r.name] == null) capacity[q][r.name] = capacityOf(r.name, q);
  });
  if (!scoreGrid[q]) scoreGrid[q] = gridForQuarter(q);
  DEPT_FAMILY_DEFAULT.forEach(([dept]) => { if (deptFamily[dept] == null) deptFamily[dept] = familyOf(dept); });
  // Start from collectConfig() so every published key rides along — userType (#11b) and recruiterDates (#111) were
  // silently dropped when this returned only the four baseline-filled keys, so neither ever reached the team.
  return { ...collectConfig(), schemaVersion: 1, pods, capacity, scoreGrid, deptFamily };
}

export function renderAdmin(accessConfig, data) {
  const deptNames = Object.keys(DEPT_TREE).sort();
  const teamCount = Object.values(DEPT_TREE).reduce((s, t) => s + t.length, 0);
  // #137b (Jerin, 15 Sep 2026 — option A of mock-up 2, with #138): four sub-tabs instead of two, and each opens on ONE slim strip — the
  // sync state, who published last, the page's one setting, Publish / Download — in place of the old stack of boxes. Pod & Capacity and
  // Scoring share the team-config strip (#mcStrip): they are one config file, so either Publish sends both. Quarter shows only where it
  // changes something (Pod & Capacity, Scoring → Grid — CLAUDE.md Rule 13). Nothing about publishing, invites or who can edit changed.
  return `
    <style>
      .adm-strip { display:flex; flex-wrap:wrap; align-items:center; gap:0.625rem 1rem; padding:0.75rem 0.875rem; margin-bottom:0.875rem;
        background:var(--card); border:1px solid var(--border); border-radius:0.625rem; }
      .adm-grow { flex:1; }
      .adm-vr { width:1px; height:1.375rem; background:var(--border); }
      .adm-sync { display:inline-flex; align-items:center; gap:0.4375rem; padding:0.25rem 0.6875rem; border-radius:62.4375rem; font-size:0.75rem; font-weight:600;
        white-space:nowrap; background:#e3f1f4; color:#17586c; }
      .adm-sync::before { content:""; width:0.4375rem; height:0.4375rem; border-radius:50%; background:currentColor; flex:none; }
      .adm-sync.is-dirty { background:var(--orange-light); color:var(--orange); }
      .adm-sync.is-busy { background:var(--border-light); color:var(--muted); }
      .adm-sync.is-error { background:var(--red-light); color:var(--red); white-space:normal; }
      .adm-prov { font-size:0.71875rem; color:var(--muted); }
      .adm-field { display:inline-flex; align-items:center; gap:0.5rem; }
      .adm-field .lbl { font-size:0.71875rem; font-weight:600; color:var(--muted); }
      .adm-card { background:var(--card); border:1px solid var(--border); border-radius:0.625rem; overflow:hidden; }
      .adm-toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:0.625rem 0.875rem; padding:0.875rem; border-bottom:1px solid var(--border-light); }
      .adm-title { font-size:0.8125rem; font-weight:700; color:var(--navy); }
      .adm-count { font-size:0.75rem; color:var(--muted); font-variant-numeric:tabular-nums; }
      .adm-strip select, .adm-card select, .adm-card input[type=number], .adm-card input[type=email], .adm-card input[type=text] {
        appearance:none; -webkit-appearance:none; height:1.875rem; padding:0 1.625rem 0 0.625rem; border:1px solid #c9d3e5; border-radius:0.5rem;
        font-family:inherit; font-size:0.75rem; font-weight:500; color:var(--text); cursor:pointer;
        background:var(--card) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5'%3E%3Cpath d='M0 0l4 5 4-5z' fill='%236b7391'/%3E%3C/svg%3E") no-repeat right 0.625rem center; }   /* font-family: controls do not inherit it (Rule 12) */
      .adm-card input[type=number], .adm-card input[type=email], .adm-card input[type=text] { padding:0 0.625rem; background-image:none; cursor:text; }
      .adm-strip select:hover, .adm-card select:hover, .adm-card input:hover { border-color:#9db2d6; }
      .adm-strip select:focus-visible, .adm-card select:focus-visible, .adm-card input:focus-visible { outline:2px solid var(--accent); outline-offset:1px; }
      .adm-card select.adm-quiet { border-color:transparent; background-color:transparent; }
      .adm-card select.adm-quiet:hover { border-color:#c9d3e5; background-color:var(--card); }
      .adm-card #new-email { width:16.25rem; }
      /* #111: the date boxes match the Pod / Capacity controls beside them; empty ones are dashed. */
      .adm-card input.cfg-date { height:1.75rem; width:8.75rem; padding:0 0.5rem 0 0.625rem; border:1px solid #c9d3e5; border-radius:0.4375rem; cursor:pointer;
        font-family:inherit; font-size:0.75rem; font-weight:500; font-variant-numeric:tabular-nums; background:var(--card); color:var(--text); }
      .adm-card input.cfg-date.is-empty { color:var(--muted); font-weight:400; border-style:dashed; }
      .adm-card input.cfg-date::-webkit-calendar-picker-indicator { opacity:.45; cursor:pointer; }
      .adm-card input.cfg-date:hover::-webkit-calendar-picker-indicator { opacity:.8; }
      .ac-table { width:100%; border-collapse:collapse; border:0; border-radius:0; }
      .ac-table th { text-align:left; font-size:0.6875rem; text-transform:uppercase; letter-spacing:.04em; color:var(--muted); font-weight:600; padding:0.5rem 0.75rem;
        background:var(--bg); border-bottom:1px solid var(--border); white-space:nowrap; }
      .ac-table td { padding:0.5rem 0.75rem; border-top:1px solid var(--border-light); vertical-align:middle; font-size:0.78125rem; color:var(--text-secondary); }
      .ac-table tbody tr:first-child td { border-top:0; }
      .ac-table tbody tr:hover td { background:#f8fafc; }
      .adm-who { display:inline-flex; align-items:center; gap:0.5625rem; white-space:nowrap; }
      .adm-who b { font-weight:600; color:var(--text); }
      .adm-who .dom { color:var(--muted); }
      .adm-who .pl-av { width:1.5rem; height:1.5rem; font-size:0.625rem; }
      .adm-card select.ac-role { font-weight:600; border-color:transparent; }
      .adm-card select.ac-role.r-admin { background-color:var(--navy); color:#fff; }
      .adm-card select.ac-role.r-full_access { background-color:#dcecf1; color:#17586c; }
      .adm-card select.ac-role.r-restricted { background-color:#e4eaf5; color:#33507f; }
      .adm-card select.ac-role.r-none { color:var(--muted); border:1px dashed #c3cad8; }
      .ac-type-wrap { display:inline-flex; align-items:center; gap:0.1875rem; }
      .ac-type-wrap i { width:0.5rem; height:0.5rem; border-radius:2px; flex:none; }
      .ac-ms { border:1px solid transparent; border-radius:0.5rem; }
      .ac-ms[open] { border-color:var(--border); background:var(--bg); }
      .ac-ms summary { list-style:none; cursor:pointer; display:flex; flex-wrap:wrap; align-items:center; gap:0.25rem; padding:0.1875rem 0.3125rem; border-radius:0.4375rem; }
      .ac-ms summary:hover { background:var(--border-light); }
      .ac-ms summary::-webkit-details-marker { display:none; }
      .ac-ms-word { font-size:0.65625rem; font-weight:700; letter-spacing:.04em; text-transform:uppercase; color:var(--muted); min-width:2.5rem; }
      .ac-ms-list { max-height:10rem; overflow:auto; padding:0.25rem 0.5rem; border-top:1px solid var(--border); }
      .ac-chip { display:inline-flex; align-items:center; font-size:0.6875rem; font-weight:600; line-height:1rem; padding:1px 0.5rem; border-radius:0.375rem; white-space:nowrap;
        background:var(--border-light); color:var(--text-secondary); }
      .ac-chip.is-tab { background:#f3f6fb; box-shadow:inset 0 0 0 1px #b9c7df; color:var(--accent-deep); }
      .ac-chip.is-any { background:transparent; box-shadow:inset 0 0 0 1px var(--border); color:var(--muted); font-weight:500; }
      .ac-actions { display:flex; align-items:center; justify-content:flex-end; gap:0.5rem; white-space:nowrap; }
      .ac-inv { font-size:0.6875rem; font-weight:500; color:var(--muted); }
      .ac-inv.is-sent { color:#1E7590; font-weight:600; }
      .ac-inv.is-wait { color:var(--orange); }
      .ac-del { background:none; border:1px solid transparent; color:var(--red); font-size:0.6875rem; font-weight:600; padding:0.25rem 0.5rem; border-radius:0.375rem; cursor:pointer; }
      .ac-del:hover { background:var(--red); color:#fff; border-color:var(--red); }
      .adm-card select.cfg-pod { font-weight:600; border-color:transparent; }
      .adm-card select.cfg-pod.pod-sales { background-color:#e4eaf5; color:#33507f; }
      .adm-card select.cfg-pod.pod-smeus { background-color:#d6eaf0; color:#17586c; }
      .adm-card select.cfg-pod.pod-smein { background-color:#dcefeb; color:#2b6b62; }
      .adm-card select.cfg-pod.pod-lateral { background-color:#fbefe3; color:#9a5b1e; }
      .adm-card select.cfg-pod.pod-others { background-color:#eceef3; color:#4a5578; }
      .adm-card select.cfg-pod.pod-none { background-color:var(--orange-light); color:var(--orange); border:1px dashed #d9b36a; }
      .adm-card select.cfg-utype.is-agency { color:#9a5b1e; font-weight:600; }
      .adm-cap { display:inline-flex; align-items:center; gap:0.5rem; }
      .adm-card .adm-cap input { width:4.75rem; text-align:right; font-weight:600; font-variant-numeric:tabular-nums; }
      .adm-capbar { width:3.5rem; height:0.3125rem; border-radius:0.1875rem; background:var(--border-light); overflow:hidden; }
      .adm-capbar span { display:block; height:100%; background:#9fb3d6; }
      .adm-inq { display:inline-flex; font-size:0.6875rem; font-weight:600; padding:2px 0.5rem; border-radius:0.375rem; white-space:nowrap; background:#eef2f8; color:var(--accent-deep); }
      .adm-inq.is-joined { background:#e3f1f4; color:#17586c; }
      .adm-inq.is-left { background:var(--orange-light); color:var(--orange); }
      .adm-inq.is-out { background:var(--border-light); color:var(--muted); }
      .adm-acct { display:inline-flex; align-items:center; gap:0.375rem; font-size:0.75rem; font-weight:600; white-space:nowrap; }
      .adm-acct::before { content:""; width:0.4375rem; height:0.4375rem; border-radius:50%; background:currentColor; }
      .adm-acct.is-on { color:var(--green); }
      .adm-acct.is-off { color:var(--red); }
      .adm-acct.is-unk { color:var(--orange); }
      .adm-podchip { display:inline-flex; align-items:center; font-size:0.71875rem; font-weight:600; padding:0.1875rem 0.5625rem; border-radius:0.375rem; white-space:nowrap; }
      .adm-podchip.pl-pod-none { background:var(--orange-light); color:var(--orange); }
      .adm-check { display:inline-flex; align-items:center; gap:0.5rem; cursor:pointer; font-size:0.75rem; color:var(--text-secondary); }
      .adm-check input { appearance:none; -webkit-appearance:none; width:1.75rem; height:1rem; margin:0; border-radius:62.4375rem; background:#c9d3e5; position:relative; cursor:pointer; transition:background .15s; }
      .adm-check input::after { content:""; position:absolute; top:2px; left:2px; width:0.75rem; height:0.75rem; border-radius:50%; background:#fff; transition:left .15s; }
      .adm-check input:checked { background:var(--navy-sub); }
      .adm-check input:checked::after { left:0.875rem; }
      .adm-check input:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
      .adm-teams { display:flex; flex-wrap:wrap; gap:0.4375rem 0.375rem; }
      /* ===== #142 (Jerin, 17 Sep 2026 — option C of the mock-up): room to breathe, quieter controls, grouped =====
         Measured before: ~7px above and below a 25px control, team chips 3.6px apart. Scoped to the two grouped tables (.adm-roomy) so
         Scoring's grid and Department → Family keep their look. Every control, value and handler is unchanged — only how they sit. */
      .ac-table.adm-roomy th { padding:0.625rem 0.75rem; }
      .ac-table.adm-roomy td { padding:0.875rem 0.75rem; }
      .ac-table.adm-roomy tbody tr.grp-row td, .ac-table.adm-roomy tbody tr.grp-row:hover td { padding:0.5rem 0.75rem; background:#f7f9fc; border-top:1px solid var(--border); }
      .ac-table.adm-roomy tbody tr.grp-row:first-child td { border-top:0; }
      .adm-grp { display:inline-flex; align-items:center; gap:0.5rem; white-space:nowrap; }
      .adm-grp i { width:0.5rem; height:0.5rem; border-radius:2px; flex:none; }
      .adm-grp b { font-size:0.75rem; font-weight:700; color:var(--navy); }
      .adm-grp .adm-grp-n { font-size:0.71875rem; color:var(--muted); font-variant-numeric:tabular-nums; }
      .adm-grp .adm-grp-n b { font-size:inherit; font-weight:600; color:var(--text-secondary); }
      .adm-card .adm-roomy select.ac-role, .adm-card .adm-roomy select.cfg-pod { height:1.625rem; border-radius:62.4375rem; padding:0 1.5rem 0 0.75rem; border-color:transparent; }
      .adm-card .adm-roomy select.ac-role:hover, .adm-card .adm-roomy select.cfg-pod:hover { border-color:#9db2d6; }
      .adm-card .adm-roomy select.adm-quiet { background-size:0 0; }
      .adm-card .adm-roomy tr:hover select.adm-quiet, .adm-card .adm-roomy select.adm-quiet:focus { background-size:auto; }
      .adm-card .adm-roomy .adm-cap input { width:3.75rem; height:1.625rem; border-color:transparent; background-color:#f3f6fb; }
      .adm-card .adm-roomy .adm-cap input:hover, .adm-card .adm-roomy .adm-cap input:focus { border-color:#9db2d6; background-color:var(--card); }
      .adm-roomy .adm-capbar { width:5rem; height:0.375rem; }
      .adm-date { display:inline-grid; min-width:6.25rem; }
      .adm-date > * { grid-area:1 / 1; }
      .adm-card .adm-date input.cfg-date { opacity:0; width:100%; height:100%; min-height:1.5rem; border:0; padding:0; cursor:pointer; }
      .adm-date-face { display:inline-flex; align-items:center; justify-self:start; height:1.5rem; padding:0 0.5rem; border:1px solid transparent; border-radius:0.375rem; font-size:0.75rem; color:#b3bccd; pointer-events:none; white-space:nowrap; }
      .adm-date.is-set .adm-date-face { background:#eef2f8; color:var(--accent-deep); font-weight:600; font-size:0.71875rem; }
      .adm-date:hover .adm-date-face { border-color:#9db2d6; }
      .adm-date:focus-within .adm-date-face { outline:2px solid var(--accent); outline-offset:1px; }
      .adm-roomy .ac-actions .btn { border-color:transparent; background:none; box-shadow:none; color:var(--accent-deep); }
      .adm-roomy .ac-actions .btn:hover { background:var(--accent-light); }
      .adm-roomy .ac-actions .ac-del { color:var(--muted); font-weight:500; }
      .adm-roomy .ac-actions .ac-del:hover { color:var(--red); background:#f7edf0; }
      @media (hover:hover) {   /* quiet until the row is in use; without hover (a phone) the actions simply stay visible */
        .adm-roomy .ac-actions > .btn { opacity:.45; transition:opacity .12s; }
        .adm-roomy tr:hover .ac-actions > .btn, .adm-roomy tr:focus-within .ac-actions > .btn { opacity:1; }
      }
      @media (prefers-reduced-motion: reduce) { .adm-roomy .ac-actions > .btn { transition:none; } }
      .adm-dgrid { display:grid; grid-template-columns:repeat(auto-fill, minmax(19rem, 1fr)); gap:0.75rem; padding:0.875rem; }
      .adm-dcard { border:1px solid var(--border-light); border-radius:0.625rem; padding:0.75rem 0.875rem; display:grid; gap:0.5rem; align-content:start; }
      .adm-dcard.is-empty { background:#fafbfd; }
      .adm-dcard header { display:flex; align-items:baseline; justify-content:space-between; gap:0.5rem; }
      .adm-dcard header b { font-weight:600; color:var(--text); }
      .adm-dcard header span { font-size:0.71875rem; color:var(--muted); font-variant-numeric:tabular-nums; white-space:nowrap; }
      .adm-team { font-size:0.6875rem; font-weight:500; line-height:1rem; padding:2px 0.5rem; border-radius:0.375rem; background:var(--border-light); color:var(--text-secondary); white-space:nowrap; }
      /* Scoring's side list — the look Jerin picked from mock-up 2 (15 Sep 2026): the chosen row lifts, with a navy edge and a count badge. */
      .adm-split { display:grid; grid-template-columns:16.25rem minmax(0,1fr); gap:0.875rem; align-items:start; }
      .adm-rail { background:var(--card); border:1px solid var(--border); border-radius:0.75rem; padding:0.5rem; display:grid; gap:0.25rem; }
      .adm-row { appearance:none; width:100%; text-align:left; cursor:pointer; font-family:inherit; background:transparent; border:1px solid transparent;
        border-radius:0.5625rem; padding:0.625rem 0.75rem; display:grid; grid-template-columns:minmax(0,1fr) auto; gap:0.1875rem 0.5rem; align-items:center;
        transition:background-color .14s, border-color .14s; }
      .adm-row:hover { background:#f3f6fb; }
      .adm-row[aria-selected="true"] { background:var(--accent-light); border-color:#c9d3e5; box-shadow:inset 0.1875rem 0 0 var(--navy-sub); }
      .adm-row:focus-visible { outline:2px solid var(--accent); outline-offset:1px; }
      .adm-row b { font-size:0.8125rem; font-weight:600; color:var(--text); }
      .adm-row small { grid-column:1 / -1; font-size:0.71875rem; color:var(--muted); }
      .adm-row em { font-style:normal; font-size:0.6875rem; font-weight:700; color:var(--accent-deep); background:#e4eaf5; border-radius:0.3125rem; padding:1px 0.4375rem; font-variant-numeric:tabular-nums; }
      .adm-main { min-width:0; }
      .cfg-grid th, .cfg-grid td { text-align:center; white-space:nowrap; }
      .cfg-grid th:first-child, .cfg-grid td:first-child { text-align:left; min-width:13.125rem; white-space:normal; }
      .cfg-grid th .tier-name { display:block; margin-bottom:0.3125rem; }
      .cfg-grid tbody tr.fam-sep td { background:var(--border-light); font-weight:700; font-size:0.6875rem; text-transform:uppercase; letter-spacing:.04em; color:var(--navy); text-align:left; padding:0.375rem 0.75rem; }
      .adm-card .cfg-grid input.tier-pts { width:3.375rem; height:1.5rem; padding:0 0.25rem; text-align:center; font-size:0.6875rem; font-weight:700; }
      .grid-cell { position:relative; display:inline-grid; place-items:center; min-width:2.875rem; height:1.625rem; cursor:pointer; }
      .grid-cell input { position:absolute; inset:0; width:100%; height:100%; margin:0; opacity:0; cursor:pointer; }
      .grid-pick { width:0.8125rem; height:0.8125rem; border-radius:50%; border:1.5px solid #c3cad8; background:#fff; font-size:0; box-sizing:border-box; }
      .grid-cell:hover .grid-pick { border-color:var(--accent); }
      .grid-cell input:checked + .grid-pick { width:auto; min-width:2.625rem; height:1.375rem; padding:0 0.5rem; border:0; border-radius:0.375rem; display:inline-grid; place-items:center;
        font-size:0.6875rem; font-weight:700; font-variant-numeric:tabular-nums; }
      .grid-cell input:focus-visible + .grid-pick { outline:2px solid var(--accent); outline-offset:2px; }
      .grid-cell input:checked + .gt-1 { background:#eef1f7; color:#4a5578; }
      .grid-cell input:checked + .gt-2 { background:#e4eaf5; color:#33507f; }
      .grid-cell input:checked + .gt-3 { background:#ddebf0; color:#2a5f7a; }
      .grid-cell input:checked + .gt-4 { background:#cfe4eb; color:#17586c; }
      .grid-cell input:checked + .gt-5 { background:#a9d0da; color:#0f4c5e; }
      .grid-cell input:checked + .gt-6 { background:#3f8aa0; color:#fff; }
      .grid-cell input:checked + .gt-7 { background:#1E7590; color:#fff; }
      .adm-card select.cfg-fam.is-exclude { color:var(--muted); border-style:dashed; }
      .cfg-ref { display:grid; grid-template-columns:repeat(auto-fit,minmax(13.75rem,1fr)); gap:0.875rem; padding:0.875rem; }
      .cfg-ref table { width:100%; font-size:0.75rem; }
      .cfg-ref th { text-align:left; color:var(--muted); font-size:0.6875rem; text-transform:uppercase; letter-spacing:.04em; }
      .cfg-scroll { overflow-x:auto; }
      @media (max-width:48.375rem) { .adm-split { grid-template-columns:1fr; } }
      /* .adm-subtabs is the recessed .subtab-band and .adm-subtab inherits .subtab-chip — see style.css */
    </style>

    <div class="adm-subtabs subtab-band">
      <button class="adm-subtab subtab-chip active" data-atab="access">Access Management</button>
      <button class="adm-subtab subtab-chip" data-atab="pods">Pod &amp; Capacity</button>
      <button class="adm-subtab subtab-chip" data-atab="depts">Departments &amp; Teams</button>
      <button class="adm-subtab subtab-chip" data-atab="scoring">Scoring</button>
    </div>

    <div class="adm-panel" data-apanel="access">
      <div class="adm-strip">
        <span id="acStatus" class="adm-sync"></span>
        <span id="acProvenance" class="adm-prov"></span>
        <span class="adm-grow"></span>
        <label class="adm-field"><span class="lbl">Default access</span>
          <select id="default-role">
            <option value="none">None (denied)</option>
            <option value="full_access">Full Access</option>
            <option value="restricted">Restricted</option>
          </select></label>
        <span class="adm-vr"></span>
        <button id="acPublishBtn" class="btn btn-primary">Publish access</button>
        <button id="acDownloadBtn" class="btn btn-secondary" title="Download access.json — fallback if publish is unavailable">Download</button>
      </div>

      <div class="adm-card">
        <div class="adm-toolbar">
          <span class="adm-title">Users</span>
          <input type="email" id="new-email" placeholder="name@interviewkickstart.com" aria-label="Email of the person to add">
          <select id="new-role" aria-label="Role for the person to add">
            <option value="restricted">Restricted</option>
            <option value="full_access">Full Access</option>
            <option value="admin">Admin</option>
            <option value="none">None (denied)</option>
          </select>
          <button class="btn btn-primary" id="add-user-btn">Add user</button>
          <span class="adm-grow"></span>
          <label class="adm-field"><span class="lbl">User type</span>
            <select id="acFilterType"><option value="">All</option><option>Hiring Manager</option><option>Recruitment Team</option><option>Admin</option><option>Others</option></select></label>
          <label class="adm-field"><span class="lbl">Invite status</span>
            <select id="acFilterInvite"><option value="">All</option><option value="invited">Invited</option><option value="not-invited">Not invited</option><option value="unpublished">Not published yet</option></select></label>
          <span id="acFilterCount" class="adm-count"></span>
        </div>
        <div class="cfg-scroll"><table class="ac-table adm-roomy">
          <thead><tr>
            <th style="min-width:16.25rem">Email</th>
            <th style="width:9.375rem">Role</th>
            <th style="width:11.25rem">User type</th>
            <th>Restricted access (tabs + scope)</th>
            <th style="width:15.625rem"></th>
          </tr></thead>
          <tbody id="users-table-body"></tbody>
        </table></div>
      </div>

      ${defsBlock('admin-access')}
    </div><!-- /access panel -->

    <div class="adm-strip" id="mcStrip" style="display:none">
      <span id="mcStatus" class="adm-sync"></span>
      <span id="mcProvenance" class="adm-prov"></span>
      <span class="adm-grow"></span>
      <span id="cfgQuarterField" class="adm-field"><label class="adm-field"><span class="lbl">Quarter</span><select id="cfgQuarter"></select></label><span class="adm-vr"></span></span>
      <button id="mcPublishBtn" class="btn btn-primary" title="Publishes Pod &amp; Capacity and Scoring together — they are one team config">Publish to team</button>
      <button id="mcDownloadBtn" class="btn btn-secondary" title="Download metric_config.json — fallback if publish is unavailable">Download</button>
    </div>

    <div class="adm-panel" data-apanel="pods" style="display:none">
      <div class="adm-card">
        <div class="adm-toolbar">
          <span class="adm-title">Recruiter → Pod &amp; Capacity</span>
          <span id="cfgPodSummary" style="display:inline-flex;flex-wrap:wrap;gap:0.375rem;align-items:center"></span>
          <span class="adm-grow"></span>
          <label class="adm-check"><input type="checkbox" id="cfgShowPast"> Show recruiters who weren't here this quarter <span id="cfgPastCount" class="adm-count"></span></label>
        </div>
        <div class="cfg-scroll"><table class="ac-table adm-roomy">
          <thead><tr><th style="min-width:14.375rem">Recruiter</th><th style="width:9.375rem">Pod</th><th style="width:10.625rem">Capacity (Score)</th><th style="width:8.75rem">Type</th><th style="width:9.375rem">Started on</th><th style="width:9.375rem">Left on</th><th style="width:14.375rem">In quarter</th><th style="width:7.5rem">Ashby account</th></tr></thead>
          <tbody id="cfgPodBody"></tbody>
        </table></div>
      </div>
      ${defsBlock('admin-pods')}
    </div>

    <div class="adm-panel" data-apanel="depts" style="display:none">
      <div class="adm-card">
        <div class="adm-toolbar">
          <span class="adm-title">Departments &amp; Teams</span>
          <span class="adm-count">${deptNames.length} departments · ${teamCount} teams · a read-only copy of Ashby's tree</span>
        </div>
        <div class="adm-dgrid">
          ${deptNames.map(dept => { const t = DEPT_TREE[dept]; return `<article class="adm-dcard${t.length ? '' : ' is-empty'}">
            <header><b>${dept}</b><span>${t.length ? t.length + (t.length === 1 ? ' team' : ' teams') : 'No teams'}</span></header>
            ${t.length ? `<div class="adm-teams">${t.map(x => `<span class="adm-team">${x}</span>`).join('')}</div>` : ''}
          </article>`; }).join('')}
        </div>
      </div>
      ${defsBlock('admin-depts')}
    </div>

    <div class="adm-panel" data-apanel="scoring" style="display:none">
      <div class="adm-split">
        <div class="adm-rail" role="tablist" aria-label="Scoring">
          <button type="button" class="adm-row" role="tab" data-ssec="grid" aria-selected="true"><b>Role Score Grid</b><em>${CLASSIFICATIONS.length}</em><small>roles across ${SCORE_TIERS.length} tiers</small></button>
          <button type="button" class="adm-row" role="tab" data-ssec="family" aria-selected="false"><b>Department → Family</b><em>${DEPT_FAMILY_DEFAULT.length}</em><small>departments mapped</small></button>
          <button type="button" class="adm-row" role="tab" data-ssec="levels" aria-selected="false"><b>Levels &amp; overrides</b><small>Level bands · complexity · leadership</small></button>
        </div>
        <div class="adm-main">
          <div class="adm-ssec" data-ssec="grid">
            <div class="adm-card">
              <div class="adm-toolbar"><span class="adm-title">Role Score Grid</span><span id="cfgGridNote" class="adm-count"></span></div>
              <div class="cfg-scroll"><table class="ac-table cfg-grid"><thead id="cfgGridHead"></thead><tbody id="cfgGridBody"></tbody></table></div>
            </div>
            ${defsBlock('admin-grid')}
          </div>
          <div class="adm-ssec" data-ssec="family" style="display:none">
            <div class="adm-card">
              <div class="adm-toolbar"><span class="adm-title">Department → Family</span></div>
              <div class="cfg-scroll"><table class="ac-table">
                <thead><tr><th style="min-width:12.5rem">Ashby Department</th><th style="width:10.625rem">Family</th><th>Note</th></tr></thead>
                <tbody id="cfgDeptBody"></tbody>
              </table></div>
            </div>
            ${defsBlock('admin-family')}
          </div>
          <div class="adm-ssec" data-ssec="levels" style="display:none">
            <div class="adm-card">
              <div class="adm-toolbar"><span class="adm-title">Level → Band · Complexity · Leadership override</span></div>
              <div id="cfgRefBlock"></div>
            </div>
            ${defsBlock('admin-levels')}
          </div>
        </div>
      </div>
    </div><!-- /scoring panel -->
  `;
}

// ===== Access Management (functional; edits a working copy, publishes access.json team-wide) =====
const AC_ROLE_OPTS = [['admin', 'Admin'], ['full_access', 'Full Access'], ['restricted', 'Restricted'], ['none', 'None (denied)']];
const AC_DIRTY_LS = 'ik_access_dirty';
const AC_WORK_LS = 'ik_access_work';   // #120d: the unpublished working copy itself, so a reload keeps it
const acEsc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// #120b (14 Sep 2026): the department choices are the departments jobs actually carry (`job.department`), which is what the
// restriction is matched against. The old list came from DEPT_TREE, which lacked Founder's Office and offered four departments
// no job has. Teams are gone: Jerin — "we moved away from the Team construct long back".
let AC_DEPTS = Object.keys(DEPT_TREE).sort();
function acDeptsFrom(data, users) {
  const s = new Set();
  Object.values((data && data.jobIndex) || {}).forEach(j => j.department && s.add(j.department));
  ((data && data.jobs) || []).forEach(j => j.department && s.add(j.department));
  Object.values((data && data.openingBuckets) || {}).forEach(b => b.department && s.add(b.department));
  // A department already saved on someone stays offered, so opening this page never silently drops it.
  (users || []).forEach(u => (u.departments || []).forEach(d => s.add(d)));
  return [...s].sort((a, b) => a.localeCompare(b));
}
// Tabs a restricted user can be granted (Overview is always on; Admin is admin-only, never offered here).
const AC_TABS = [['hm-report', 'Hiring Manager'], ['recruiter', 'Recruiter Efficiency'], ['efficiency', 'Overall Efficiency']];
// #118 (Jerin, 14 Sep 2026): a User type label per person. It moves no access — role, tabs and departments still decide what they
// see — it only groups people and drives the User type filter. A person with no saved label shows the one their role suggests.
const AC_USER_TYPES = ['Hiring Manager', 'Recruitment Team', 'Admin', 'Others'];   // Others: Jerin, 14 Sep 2026
const acUserType = (u) => u.userType || (u.role === 'admin' ? 'Admin' : u.role === 'restricted' ? 'Hiring Manager' : 'Recruitment Team');
// Compact multi-select (native <details> + checkboxes). options = array of strings OR [value, label] pairs.
// #137b: closed, it reads as labels — one per granted tab, one per department — instead of "Tabs: a, b".
function acMsSummary(word, labels, isTab) {
  return `<span class="ac-ms-word">${word}</span>` + (labels.length
    ? labels.map(l => `<span class="ac-chip${isTab ? ' is-tab' : ''}">${acEsc(l)}</span>`).join('')
    : '<span class="ac-chip is-any">Any</span>');
}
function acMs(cls, i, selected, options, labelWord) {
  const opts = options.map(o => Array.isArray(o) ? o : [o, o]);
  const sel = new Set(selected || []);
  const selLabels = opts.filter(([v]) => sel.has(v)).map(([, l]) => l);
  return `<details class="ac-ms">
    <summary title="Click to change">${acMsSummary(labelWord, selLabels, cls === 'ac-tabs')}</summary>
    <div class="ac-ms-list">
      ${opts.map(([v, l]) => `<label style="display:flex;align-items:center;gap:0.375rem;font-size:0.6875rem;padding:2px 0;white-space:nowrap"><input type="checkbox" class="${cls}" data-i="${i}" value="${acEsc(v)}"${sel.has(v) ? ' checked' : ''}> ${acEsc(l)}</label>`).join('')}
    </div>
  </details>`;
}
// #137b: the email cell leads with initials, then the name part in bold and the domain in grey.
const acWho = (email) => {
  const [local, dom] = String(email || '').split('@');
  return `<span class="adm-who">${avatar(local.replace(/[._-]+/g, ' '))}<span><b>${acEsc(local)}</b><span class="dom">${dom ? '@' + acEsc(dom) : ''}</span></span></span>`;
};
const AC_TYPE_COL = { 'Hiring Manager': '#4E6BA6', 'Recruitment Team': '#1E7590', 'Admin': '#22344f', 'Others': '#9aa3b8' };
const admWhen = (iso) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

// app.js calls this alongside initAdminMetricConfig. accessConfig = the loaded data/access.json.
export function initAdminAccess(accessConfig, data) {
  const work = JSON.parse(JSON.stringify(accessConfig || { defaultRole: 'none', users: [] }));
  if (!Array.isArray(work.users)) work.users = [];
  if (data) AC_DEPTS = acDeptsFrom(data, work.users);
  if (!work.defaultRole) work.defaultRole = 'none';
  // Migrate legacy restricted users (old isRecruiter flag) to the explicit per-user Tabs model.
  work.users.forEach(u => { if (u.role === 'restricted' && !Array.isArray(u.tabs)) { u.tabs = ['hm-report']; if (u.isRecruiter) u.tabs.push('recruiter'); } });

  // 🚨 #120d (14 Sep 2026): the "unpublished" flag was kept in the browser but the edits were not, so a reload showed
  // "Unpublished access changes" over a list that had silently gone back to the published one. The working copy is now
  // saved beside the flag and restored, but only if it was saved AFTER the access file was last published. If someone
  // published since, the copy is stale: it is dropped (and the status line says so) rather than published over them.
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } };
  const publishedAt = (accessConfig && accessConfig.updatedAt) || '';
  let droppedNote = '';
  if (lsGet(AC_DIRTY_LS) === '1') {
    let saved = null; try { saved = JSON.parse(lsGet(AC_WORK_LS) || 'null'); } catch (e) { saved = null; }
    if (saved && Array.isArray(saved.users) && (!publishedAt || (saved.savedAt || '') > publishedAt)) {
      work.users = saved.users; work.defaultRole = saved.defaultRole || work.defaultRole;
    } else {
      if (saved) droppedNote = 'Unpublished changes from this browser were dropped: the team’s access was published after them.';
      lsSet(AC_DIRTY_LS, null); lsSet(AC_WORK_LS, null);
    }
  }

  const isDirtyAc = () => lsGet(AC_DIRTY_LS) === '1';
  const setDirtyAc = (v) => {
    droppedNote = '';
    if (v) { lsSet(AC_DIRTY_LS, '1'); lsSet(AC_WORK_LS, JSON.stringify({ savedAt: new Date().toISOString(), defaultRole: work.defaultRole, users: work.users })); }
    else { lsSet(AC_DIRTY_LS, null); lsSet(AC_WORK_LS, null); }
    refreshUI();
  };

  // #137b: the status is a pill — teal in sync, amber with unpublished edits, grey while working, rose on an error.
  const say = (el, text, state) => { if (!el) return; el.textContent = text; el.className = 'adm-sync' + (state ? ' is-' + state : ''); };
  function refreshUI() {
    const st = document.getElementById('acStatus'), pv = document.getElementById('acProvenance');
    const dirty = isDirtyAc();
    say(st, dirty ? 'Unpublished access changes on this browser' : (droppedNote || 'In sync with the team'), (dirty || droppedNote) ? 'dirty' : '');
    if (pv) pv.innerHTML = (accessConfig && accessConfig.updatedAt)
      ? `Access published ${admWhen(accessConfig.updatedAt)}${accessConfig.updatedBy ? ' · by ' + acEsc(accessConfig.updatedBy) : ''}`
      : 'Live access config — publish to update the shared file.';
  }

  const dr = document.getElementById('default-role');
  if (dr) { dr.value = work.defaultRole; dr.addEventListener('change', () => { work.defaultRole = dr.value; setDirtyAc(true); }); }

  // #118 (Jerin, 14 Sep 2026): Send invite asks the web app to write and SEND the email (after the admin confirms; never
  // automatic). It goes only to someone whose access is PUBLISHED exactly as shown — otherwise they could not sign in yet.
  // `invites` = who was sent one and when ({email: {at, by, count}}), read from data/access_invites.json.
  let invites = {};
  const sameList = (a, b) => JSON.stringify((a || []).slice().sort()) === JSON.stringify((b || []).slice().sort());
  const isPublished = (u) => ((accessConfig && accessConfig.users) || []).some(p => (p.email || '').toLowerCase() === (u.email || '').toLowerCase()
    && p.role === u.role && (u.role !== 'restricted' || (sameList(p.tabs, u.tabs) && sameList(p.departments, u.departments))));
  const inviteCell = (u, i) => {
    if (u.role === 'none') return '';
    if (!isPublished(u)) return `<button class="btn btn-secondary btn-sm" disabled title="Publish access first: this access is not live yet, so they could not sign in.">Send invite</button>`;
    const prev = invites[(u.email || '').toLowerCase()];
    return `<button class="btn btn-secondary btn-sm ac-invite" data-i="${i}" title="Sends the invite email now, after you confirm.">${prev ? 'Resend invite' : 'Send invite'}</button>`;
  };
  // #137b: the invite state is a label beside the button; who sent it is in the hover.
  const inviteState = (u) => {
    if (u.role === 'none') return '';
    if (!isPublished(u)) return '<span class="ac-inv is-wait">Not published yet</span>';
    const prev = invites[(u.email || '').toLowerCase()];
    if (!prev) return '<span class="ac-inv">Not invited</span>';
    const d = prev.at ? new Date(prev.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
    return `<span class="ac-inv is-sent" title="Invited${d ? ' ' + d : ''}${prev.by ? ' by ' + acEsc(prev.by) : ''}">✓ Invited${d ? ' ' + d : ''}</span>`;
  };
  // #118: Invite status for the filter — invited (a send is recorded) · not-invited (published, never sent) · unpublished
  // (the access shown here is not live yet, so no invite can go). Role None is none of these.
  const inviteStatus = (u) => u.role === 'none' ? 'no-access' : !isPublished(u) ? 'unpublished'
    : (invites[(u.email || '').toLowerCase()] ? 'invited' : 'not-invited');
  const passesFilters = (u) => {
    const t = (document.getElementById('acFilterType') || {}).value || '', s = (document.getElementById('acFilterInvite') || {}).value || '';
    return (!t || acUserType(u) === t) && (!s || inviteStatus(u) === s);
  };
  function renderRows() {
    const body = document.getElementById('users-table-body'); if (!body) return;
    const cnt = document.getElementById('acFilterCount');
    if (!work.users.length) { if (cnt) cnt.textContent = ''; body.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:0.875rem">No users configured</td></tr>'; return; }
    const shown = work.users.map((u, i) => [u, i]).filter(([u]) => passesFilters(u));
    if (cnt) cnt.textContent = `${shown.length} of ${work.users.length} people`;
    if (!shown.length) { body.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:0.875rem">No users match these filters</td></tr>'; return; }
    const rowHtml = (u, i) => {
      const restricted = u.role === 'restricted', type = acUserType(u);
      return `<tr>
        <td>${acWho(u.email)}</td>
        <td><select class="ac-role r-${u.role}" data-i="${i}" aria-label="Role for ${acEsc(u.email)}">${AC_ROLE_OPTS.map(([v, l]) => `<option value="${v}"${u.role === v ? ' selected' : ''}>${l}</option>`).join('')}</select></td>
        <td><span class="ac-type-wrap"><i style="background:${AC_TYPE_COL[type] || '#9aa3b8'}"></i><select class="ac-type adm-quiet" data-i="${i}" aria-label="User type for ${acEsc(u.email)}">${AC_USER_TYPES.map(t => `<option${type === t ? ' selected' : ''}>${t}</option>`).join('')}</select></span></td>
        <td>${restricted ? `<div style="display:flex;flex-direction:column;gap:0.1875rem;max-width:25rem">
              ${acMs('ac-tabs', i, u.tabs, AC_TABS, 'Tabs')}
              ${acMs('ac-depts', i, u.departments, AC_DEPTS, 'Depts')}
            </div>` : `<span class="adm-count">${u.role === 'none' ? 'No access' : u.role === 'admin' ? 'All tabs + Admin' : 'All tabs'}</span>`}</td>
        <td><div class="ac-actions">${inviteState(u)}${inviteCell(u, i)}<button class="btn btn-danger btn-sm ac-del" data-i="${i}">Remove</button></div></td>
      </tr>`;
    };
    // #142 (Jerin, 17 Sep — option C): grouped under a heading per user type. Rows still edit by their place in work.users (data-i) and
    // every change redraws, so a new user type moves the person into that group. Sorting a column sorts within each group (table-sort.js).
    const byType = new Map(['Admin', 'Recruitment Team', 'Hiring Manager', 'Others'].map(g => [g, []]));
    shown.forEach(([u, i]) => { const t = acUserType(u); if (!byType.has(t)) byType.set(t, []); byType.get(t).push([u, i]); });
    body.innerHTML = [...byType].filter(([, rows]) => rows.length).map(([g, rows]) => {
      const sent = rows.filter(([u]) => invites[(u.email || '').toLowerCase()]).length;
      return `<tr class="grp-row"><td colspan="5"><span class="adm-grp"><i style="background:${AC_TYPE_COL[g] || '#9aa3b8'}"></i><b>${acEsc(g)}</b>`
        + `<span class="adm-grp-n">${rows.length} ${rows.length === 1 ? 'person' : 'people'} · ${sent} invited</span></span></td></tr>`
        + rows.map(([u, i]) => rowHtml(u, i)).join('');
    }).join('');
    body.querySelectorAll('.ac-role').forEach(s => s.addEventListener('change', () => { work.users[+s.dataset.i].role = s.value; setDirtyAc(true); renderRows(); }));
    body.querySelectorAll('.ac-type').forEach(s => s.addEventListener('change', () => { work.users[+s.dataset.i].userType = s.value; setDirtyAc(true); renderRows(); }));
    const wireMs = (cls, key, word, opts) => body.querySelectorAll('.' + cls).forEach(cb => cb.addEventListener('change', () => {
      const i = +cb.dataset.i;
      const vals = [...body.querySelectorAll('.' + cls + '[data-i="' + i + '"]:checked')].map(x => x.value);
      work.users[i][key] = vals;
      const lm = new Map((opts || []).map(o => Array.isArray(o) ? o : [o, o]));
      const disp = vals.map(v => lm.get(v) || v);
      const sum = cb.closest('details').querySelector('summary');
      if (sum) sum.innerHTML = acMsSummary(word, disp, cls === 'ac-tabs');
      setDirtyAc(true);
    }));
    wireMs('ac-tabs', 'tabs', 'Tabs', AC_TABS);
    wireMs('ac-depts', 'departments', 'Depts', AC_DEPTS);
    body.querySelectorAll('.ac-del').forEach(b => b.addEventListener('click', () => { work.users.splice(+b.dataset.i, 1); setDirtyAc(true); renderRows(); }));
    body.querySelectorAll('.ac-invite').forEach(b => b.addEventListener('click', async () => {
      const u = work.users[+b.dataset.i]; const prev = invites[(u.email || '').toLowerCase()];
      if (!window.confirm((prev ? 'Resend' : 'Send') + ' the dashboard invite email to ' + u.email + ' now?')) return;
      const st = document.getElementById('acStatus');
      b.disabled = true; b.textContent = 'Sending…';
      say(st, 'A window opens and says "Invite sent" — this row updates when it is recorded.', 'busy');
      const res = await sendInvite(u.email);
      if (res.ok) { invites[u.email.toLowerCase()] = { at: res.at, by: res.by }; say(st, 'Invite sent to ' + u.email, ''); }
      else say(st, res.reason, 'error');
      renderRows();
    }));
  }
  renderRows();
  fetchInvites().then(m => { invites = m || {}; renderRows(); });   // #118
  ['acFilterType', 'acFilterInvite'].forEach(id => document.getElementById(id)?.addEventListener('change', renderRows));   // #118 filters

  const addBtn = document.getElementById('add-user-btn');
  if (addBtn) addBtn.addEventListener('click', () => {
    const emailEl = document.getElementById('new-email'), roleEl = document.getElementById('new-role');
    const email = (emailEl.value || '').trim().toLowerCase(), role = roleEl.value;
    if (!email || email.indexOf('@') < 0) { emailEl.focus(); emailEl.style.borderColor = 'var(--red)'; return; }
    if (work.users.some(u => (u.email || '').toLowerCase() === email)) { emailEl.style.borderColor = 'var(--red)'; return; }
    const u = { email, role }; if (role === 'restricted') { u.tabs = ['hm-report']; u.departments = []; }
    u.userType = acUserType(u);   // #118: saved explicitly, so the label never shifts if the role changes later
    work.users.push(u); emailEl.value = ''; emailEl.style.borderColor = ''; setDirtyAc(true); renderRows();
  });

  const pubBtn = document.getElementById('acPublishBtn');
  if (pubBtn) pubBtn.addEventListener('click', async () => {
    const st = document.getElementById('acStatus');
    pubBtn.disabled = true; const lbl = pubBtn.textContent; pubBtn.textContent = 'Publishing…';
    say(st, 'A sign-in popup will open — approve it, then this verifies automatically…', 'busy');
    const payload = { schemaVersion: 1, defaultRole: work.defaultRole, users: work.users };
    let res; try { res = await publishAccess(payload); } catch (e) { res = { ok: false, reason: e.message }; }
    pubBtn.textContent = lbl; pubBtn.disabled = false;
    if (res.ok) { setDirtyAc(false); say(st, 'Published — access is live for the whole team', ''); }
    else say(st, res.reason, 'error');
  });
  const dlBtn = document.getElementById('acDownloadBtn');
  if (dlBtn) dlBtn.addEventListener('click', () => {
    const user = getCurrentUser();
    const blob = new Blob([accessFileText({ schemaVersion: 1, defaultRole: work.defaultRole, users: work.users }, user && user.email)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'access.json'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
  });

  refreshUI();
}

// ===== Metric Configuration interactivity (called by app.js after renderAdmin) =====
export function initAdminMetricConfig(data) {
  // #11b: agencies, freelancers and other sourcer-only people must be configurable here too — that is where
  // their pod and capacity get set. Same shared helper the Recruiter tab uses, so the two rosters agree.
  const recs = ((data && data.recruiters) || []).concat(
    sourcerOnlyNames(data).map(name => ({ name, userId: null, isActive: true, activeKnown: false, sourcerOnly: true })));
  const cfgQ = () => document.getElementById('cfgQuarter')?.value || currentQuarter();

  // ===== Admin sub-tabs (Access Management | Metric Configuration) =====
  // #137b: Pod & Capacity and Scoring share the team-config strip; Quarter shows only where it changes something (Rule 13).
  const showMetricStrip = () => {
    const tab = document.querySelector('.adm-subtab.active')?.dataset.atab;
    const sec = document.querySelector('.adm-row[aria-selected="true"]')?.dataset.ssec;
    const strip = document.getElementById('mcStrip'); if (strip) strip.style.display = (tab === 'pods' || tab === 'scoring') ? '' : 'none';
    const qf = document.getElementById('cfgQuarterField'); if (qf) qf.style.display = (tab === 'pods' || (tab === 'scoring' && sec === 'grid')) ? '' : 'none';
  };
  document.querySelectorAll('.adm-subtab').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.adm-subtab').forEach(b => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.adm-panel').forEach(p => { p.style.display = p.dataset.apanel === btn.dataset.atab ? '' : 'none'; });
    showMetricStrip();
  }));
  // Scoring's side list: it lands on the Grid, and one section shows at a time.
  document.querySelectorAll('.adm-row').forEach(row => row.addEventListener('click', () => {
    document.querySelectorAll('.adm-row').forEach(r => r.setAttribute('aria-selected', String(r === row)));
    document.querySelectorAll('.adm-ssec').forEach(x => { x.style.display = x.dataset.ssec === row.dataset.ssec ? '' : 'none'; });
    showMetricStrip();
  }));

  function updatePodSummary() {
    const el = document.getElementById('cfgPodSummary'); if (!el) return;
    const q = cfgQ(); const counts = {};
    const showPast = !!document.getElementById('cfgShowPast')?.checked;
    // Count what is actually listed, so pod sizes read as current headcount rather than an all-time tally.
    const here = (r) => recruiterInQuarter(r.name, q, r.isActive).in;   // #111: dates, else today's Ashby account
    const shown = recs.filter(r => r.name !== 'Unassigned' && (showPast || here(r)));
    shown.forEach(r => { const p = podOf(r.name, q); counts[p] = (counts[p] || 0) + 1; });
    const hidden = showPast ? 0 : recs.filter(r => r.name !== 'Unassigned' && !here(r)).length;
    // #137b: one chip per pod, in the pod's colour and in pod order.
    const order = [...POD_OPTIONS, 'Unassigned'];
    el.innerHTML = Object.entries(counts).sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
      .map(([p, c]) => `<span class="adm-podchip pl-pod-${podClass(p)}">${p} ${c}</span>`).join('')
      + (hidden ? `<span class="adm-count">${hidden} not here this quarter, hidden</span>` : '');
  }
  function renderPodCapacity() {
    const body = document.getElementById('cfgPodBody'); if (!body) return;
    const q = cfgQ();
    // This table is for CONFIGURING current staff, so past recruiters are hidden by default. It is a display
    // filter only — their saved Pod/Capacity is untouched and still published, and the reports still show
    // their historical work (Recruiter Efficiency defaults to including them, deliberately).
    const showPast = !!document.getElementById('cfgShowPast')?.checked;
    const all = [...recs].filter(r => r.name && r.name !== 'Unassigned').sort((a, b) => a.name.localeCompare(b.name));
    const here = (r) => recruiterInQuarter(r.name, q, r.isActive);   // #111
    const pastCount = all.filter(r => !here(r).in).length;
    const pc = document.getElementById('cfgPastCount');
    if (pc) pc.textContent = pastCount ? `(${pastCount})` : '';
    const sorted = showPast ? all : all.filter(r => here(r).in);
    const dates = getRecruiterDates();
    const podOpts = [...POD_OPTIONS, 'Unassigned'];
    // #11b, WIDENED 10 Sep 2026 (Jerin): the type is now editable for EVERY recruiter, not only accounts Ashby
    // flags as `External Recruiter`. The flag was never a reliable gate — a genuine external can hold an
    // Elevated Access seat (Sangha) and be stuck reading Internal with no way to correct it.
    // 🚨 The render gate here and `userTypeOf` in metric-config.js MUST agree: that function used to hard-return
    // 'Internal' for non-externals, so opening this dropdown alone would have set a value the score ignored.
    // The Ashby flag still supplies the DEFAULT (external -> Freelancer, ours -> Internal); it no longer decides
    // who may be edited.
    // #108 (13 Sep 2026): the type no longer moves ANY number — every type follows the same credit rule. It stays as
    // a label (who is an agency), which is why the dropdown remains.
    // 🚨 It is NOT a clean agency signal: of the four accounts carrying the role today, two are duplicate
    // accounts of IK's own recruiters and one is a test user. That is exactly why `Internal` is one of the
    // three options — so those false positives can be cleared rather than silently halving a real
    // recruiter's SME credit under the Freelancer default.
    const ext = new Set((data && data.externalUsers) || []);
    // #137b: initials in the pod's colour, a tinted pod box, a capacity bar against the largest capacity listed, and labels for In quarter
    // and the Ashby account. The inputs, their values and what each change writes are exactly as before.
    const capMax = Math.max(1, ...sorted.map(r => +capacityOf(r.name, q) || 0));
    const capPct = (v) => Math.min(100, Math.round((+v || 0) / capMax * 100));
    // #142: a quiet face over the real date box — "15 Jul 2026" when set, "—" when not. The input underneath keeps its class, data
    // attributes, value and change handler; clicking anywhere on the face opens its picker.
    const fmtDay = (d) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || ''); return m ? `${+m[3]} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m[2] - 1]} ${m[1]}` : ''; };
    const dateBox = (name, f, label) => { const v = (dates[name] || {})[f] || '';
      return `<span class="adm-date${v ? ' is-set' : ''}"><input type="date" class="cfg-date${v ? '' : ' is-empty'}" data-name="${name}" data-f="${f}" value="${v}" aria-label="${label} for ${name}"><span class="adm-date-face" aria-hidden="true">${v ? fmtDay(v) : '—'}</span></span>`; };
    const fmtCap = (n) => (+n || 0).toLocaleString('en-IN');
    const rowHtml = (r) => { const name = r.name; const off = r.isActive === false; const unk = r.activeKnown === false;
      const pod = podOf(name, q), cap = capacityOf(name, q), ut = userTypeOf(name, ext); return `<tr data-pod="${pod}">
      <td><span class="adm-who">${avatar(name, pod)}<b>${name}</b></span></td>
      <td><select class="cfg-pod pod-${podClass(pod)}" data-name="${name}" aria-label="Pod for ${name}">${podOpts.map(p => `<option value="${p}"${p === pod ? ' selected' : ''}>${p}</option>`).join('')}</select></td>
      <td><span class="adm-cap"><input type="number" min="0" class="cfg-cap" data-name="${name}" value="${cap}" aria-label="Capacity for ${name}"><span class="adm-capbar"><span style="width:${capPct(cap)}%"></span></span></span></td>
      <td><select class="cfg-utype adm-quiet${ut === 'Agency' ? ' is-agency' : ''}" data-name="${name}" title="${ext.has(name)
        ? 'Ashby marks this account as an External Recruiter.'
        : 'Ashby does not mark this account as an External Recruiter.'}">${USER_TYPES.map(t => `<option value="${t}"${t === ut ? ' selected' : ''}>${t}</option>`).join('')}</select></td>
      <td>${dateBox(name, 'start', 'Started on')}</td>
      <td>${dateBox(name, 'end', 'Left on')}</td>
      <td>${(() => { const s = here(r); const q0 = String(q).replace(/^(\d{4})-(Q\d)$/, '$2 $1');
        const txt = !s.in ? (s.note ? 'Not here · ' + s.note : 'Not here') : (s.note ? 'Yes · ' + s.note : (s.basis === 'account' ? 'Yes · no dates set' : 'Yes'));
        const cls = !s.in ? ' is-out' : (/left/.test(s.note) ? ' is-left' : (/joined/.test(s.note) ? ' is-joined' : ''));
        return `<span class="adm-inq${cls}" title="${s.basis === 'account' ? 'No Started on / Left on dates yet, so the Ashby account decides for ' + q0 + '.' : 'Decided by the dates for ' + q0 + '.'}">${txt}</span>`; })()}</td>
      <td><span class="adm-acct ${unk ? 'is-unk' : (off ? 'is-off' : 'is-on')}">${unk ? 'Unknown' : (off ? 'Disabled' : 'Enabled')}</span></td></tr>`; };
    // #142 (Jerin, 17 Sep — option C): grouped under each pod, in pod order, with its recruiters and their capacity for the quarter.
    const podsListed = [...podOpts, ...new Set(sorted.map(r => podOf(r.name, q)).filter(p => !podOpts.includes(p)))];
    body.innerHTML = podsListed.map(p => [p, sorted.filter(r => podOf(r.name, q) === p)]).filter(([, rs]) => rs.length).map(([p, rs]) =>
      `<tr class="grp-row" data-pod="${p}"><td colspan="8"><span class="adm-grp"><span class="adm-podchip pl-pod-${podClass(p)}">${p}</span>`
      + `<span class="adm-grp-n">${rs.length} ${rs.length === 1 ? 'recruiter' : 'recruiters'} · capacity <b class="grp-cap">${fmtCap(rs.reduce((t, r) => t + (+capacityOf(r.name, q) || 0), 0))}</b></span></span></td></tr>`
      + rs.map(rowHtml).join('')).join('')
      || `<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:1rem">${pastCount && !showPast ? 'Nobody here this quarter — switch on “Show recruiters who weren\'t here this quarter” to see the ' + pastCount + ' others.' : 'No recruiters in the data yet.'}</td></tr>`;
    // #142: redraw on a pod change so the recruiter moves into that pod's group and both headings' totals follow.
    body.querySelectorAll('.cfg-pod').forEach(sel => sel.addEventListener('change', () => { setPod(sel.dataset.name, sel.value, cfgQ()); touched(); renderPodCapacity(); }));
    body.querySelectorAll('.cfg-cap').forEach(inp => inp.addEventListener('input', () => {
      setCapacity(inp.dataset.name, inp.value, cfgQ()); touched();
      const bar = inp.closest('.adm-cap')?.querySelector('.adm-capbar span'); if (bar) bar.style.width = capPct(inp.value) + '%';
      // #142: the group heading's capacity total follows as you type (a redraw here would take the cursor out of the box).
      const pod = inp.closest('tr')?.dataset.pod, head = pod != null && [...body.querySelectorAll('tr.grp-row')].find(t => t.dataset.pod === pod);
      if (head) head.querySelector('.grp-cap').textContent = fmtCap([...body.querySelectorAll('tr:not(.grp-row)')].filter(t => t.dataset.pod === pod).reduce((t, tr) => t + (+tr.querySelector('.cfg-cap')?.value || 0), 0));
    }));
    body.querySelectorAll('.adm-date input.cfg-date').forEach(inp => {
      const open = () => { try { inp.showPicker(); } catch (e) { /* not supported: the box still takes typed dates */ } };
      inp.addEventListener('click', open);
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); open(); } });
    });
    body.querySelectorAll('.cfg-utype').forEach(sel => sel.addEventListener('change', () => { setUserType(sel.dataset.name, sel.value); touched(); sel.classList.toggle('is-agency', sel.value === 'Agency'); }));   // #11b
    // #111: dates are per person, not per quarter. Re-render on change so 'In quarter' and the list follow at once.
    body.querySelectorAll('.cfg-date').forEach(inp => inp.addEventListener('change', () => { inp.classList.toggle('is-empty', !inp.value); setRecruiterDate(inp.dataset.name, inp.dataset.f, inp.value); touched(); renderPodCapacity(); }));
    updatePodSummary();
  }
  function renderScoreGrid() {
    const head = document.getElementById('cfgGridHead'); if (!head) return;
    const q = cfgQ();
    const grid = gridForQuarter(q);
    head.innerHTML = `<tr><th>Role Classification</th>${SCORE_TIERS.map(([n]) => `<th><span class="tier-name">${n}</span><input type="number" class="tier-pts" data-tier="${n}" value="${grid.tierPoints[n]}" aria-label="Points for ${n}"></th>`).join('')}</tr>`;
    let html = '', lastFam = null;
    CLASSIFICATIONS.forEach(([fam, cls]) => {
      if (fam !== lastFam) { html += `<tr class="fam-sep"><td colspan="${SCORE_TIERS.length + 1}">${fam}</td></tr>`; lastFam = fam; }
      const rname = 'grid_' + cls.replace(/[^a-z0-9]/gi, '_');
      // #137b: the chosen tier fills in with its points (deeper = more points); the radio underneath is still what saves.
      html += `<tr><td>${cls}</td>${SCORE_TIERS.map(([n], k) => `<td><label class="grid-cell" title="${cls} → ${n}"><input type="radio" name="${rname}" class="grid-radio" data-cls="${cls}" data-tier="${n}"${n === grid.rowTier[cls] ? ' checked' : ''}><span class="grid-pick gt-${k + 1}" data-tier="${n}">${grid.tierPoints[n]}</span></label></td>`).join('')}</tr>`;
    });
    document.getElementById('cfgGridBody').innerHTML = html;
    document.querySelectorAll('#cfgGridBody .grid-radio').forEach(r => r.addEventListener('change', () => { if (r.checked) { setGridTier(cfgQ(), r.dataset.cls, r.dataset.tier); touched(); } }));
    document.querySelectorAll('#cfgGridHead .tier-pts').forEach(inp => inp.addEventListener('input', () => {
      setGridPoints(cfgQ(), inp.dataset.tier, parseInt(inp.value, 10) || 0); touched();
      document.querySelectorAll('#cfgGridBody .grid-pick').forEach(x => { if (x.dataset.tier === inp.dataset.tier) x.textContent = parseInt(inp.value, 10) || 0; });
    }));
    const note = document.getElementById('cfgGridNote');
    if (note) note.textContent = loadGridStore()[q] ? 'Edited for ' + q.replace('-', ' ') : 'Inherited from an earlier quarter (copy-forward)';
  }
  function renderDeptFamily() {
    const body = document.getElementById('cfgDeptBody'); if (!body) return;
    body.innerHTML = DEPT_FAMILY_DEFAULT.map(([dept, , note]) => `<tr>
      <td><b style="font-weight:600;color:var(--text)">${dept}</b></td>
      <td><select class="cfg-fam${familyOf(dept) === 'Exclude' ? ' is-exclude' : ''}" data-dept="${dept}" aria-label="Family for ${dept}">${FAMILY_OPTIONS.map(f => `<option value="${f}"${f === familyOf(dept) ? ' selected' : ''}>${f}</option>`).join('')}</select></td>
      <td class="adm-count" style="font-size:0.71875rem">${note || ''}</td></tr>`).join('');
    body.querySelectorAll('.cfg-fam').forEach(s => s.addEventListener('change', () => { const o = loadDeptFamily(); o[s.dataset.dept] = s.value; saveDeptFamily(o); touched(); s.classList.toggle('is-exclude', s.value === 'Exclude'); }));
  }
  function renderRefBlock() {
    const el = document.getElementById('cfgRefBlock'); if (!el) return;
    el.innerHTML = `<div class="cfg-ref">
      <table><thead><tr><th>Level band</th><th>Ashby L-scale</th></tr></thead><tbody>${LEVEL_BANDS.map(([b, l]) => `<tr><td>${b}</td><td style="color:var(--muted)">${l}</td></tr>`).join('')}</tbody></table>
      <table><thead><tr><th>Complexity (Ashby)</th></tr></thead><tbody><tr><td>Normal</td></tr><tr><td>Complex</td></tr><tr><td>Uber Complex</td></tr></tbody></table>
      <table><thead><tr><th>Leadership override</th></tr></thead><tbody><tr><td>L7–L8 → Leadership (60)</td></tr><tr><td>L9 &amp; above → Senior Leadership (120)</td></tr><tr><td style="color:var(--muted);font-size:0.6875rem">Any family; overrides Family/Complexity by level.</td></tr></tbody></table>
    </div>`;
  }

  // ===== team-wide publish (antifragile: dirty tracking + confirm-by-read + download fallback) =====
  function touched() { markDirty(); refreshPublishUI(); }
  function refreshPublishUI() {
    const status = document.getElementById('mcStatus'), prov = document.getElementById('mcProvenance');
    if (!status) return;
    const dirty = isDirty(), meta = getMeta();
    status.textContent = dirty ? 'Unpublished changes on this browser' : 'In sync with the team';
    status.className = 'adm-sync' + (dirty ? ' is-dirty' : '');   // #137b: a pill, like Access Management's
    prov.innerHTML = (meta && meta.updatedAt)
      ? `Team config published ${admWhen(meta.updatedAt)}${meta.updatedBy ? ' · by ' + meta.updatedBy : ''}`
      : 'No team config published yet — Publish to set the shared baseline.';
  }
  const pubBtn = document.getElementById('mcPublishBtn');
  if (pubBtn) pubBtn.addEventListener('click', async () => {
    const status = document.getElementById('mcStatus');
    pubBtn.disabled = true; const label = pubBtn.textContent; pubBtn.textContent = 'Publishing…';
    status.textContent = 'A sign-in popup will open — approve it, then this verifies automatically…'; status.className = 'adm-sync is-busy';
    let res; try { res = await publishConfig(buildEffectiveConfig(data)); } catch (e) { res = { ok: false, reason: e.message }; }
    pubBtn.textContent = label; pubBtn.disabled = false;
    if (res.ok) { status.textContent = 'Published — the whole team now sees this config'; status.className = 'adm-sync'; refreshPublishUI(); }
    else { status.textContent = res.reason; status.className = 'adm-sync is-error'; }
  });
  const dlBtn = document.getElementById('mcDownloadBtn');
  if (dlBtn) dlBtn.addEventListener('click', () => {
    const user = getCurrentUser();
    const blob = new Blob([configFileText(user && user.email)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'metric_config.json'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
  });

  const qSel = document.getElementById('cfgQuarter');
  if (qSel) {
    const cy = new Date().getFullYear(); const qs = [];
    for (let y = Math.max(cy, 2026); y >= 2026; y--) for (let q = 4; q >= 1; q--) qs.push(qKey(y, q));
    qSel.innerHTML = qs.map(q => `<option value="${q}">${q.replace('-', ' ')}</option>`).join('');
    qSel.value = currentQuarter();
    qSel.addEventListener('change', () => { renderPodCapacity(); renderScoreGrid(); });
    document.getElementById('cfgShowPast')?.addEventListener('change', renderPodCapacity);
  }
  renderPodCapacity(); renderScoreGrid(); renderDeptFamily(); renderRefBlock(); refreshPublishUI(); showMetricStrip();
  // #137b: an old link or a remembered route to the retired Metric Configuration tab lands on Pod & Capacity.
  if (/^#\/?admin\/metric$/.test(location.hash)) location.hash = 'admin/pods';
}
