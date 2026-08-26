// ===== Definitions — plain-English explanation of every table, column and chart =====
//
// WHY THIS FILE EXISTS. In one week this dashboard showed three different Joining Pending figures, a Gap
// bar that filled with coverage while its number counted the shortfall, and a chart on a different time
// basis from the table under it. None of those were hard to spot once written down in words — they were
// hard to spot because nowhere said, in English, what the column was supposed to mean.
//
// TWO RULES FOR EDITING THIS FILE
// 1. The definition and the code that computes it change TOGETHER. If you change a formula and not the
//    words here, you have re-created exactly the failure this file exists to prevent.
// 2. `confirmed` is who settled the rule and when — not when the text was last touched. Leave it alone
//    unless the RULE changed and the person named agreed to the change.
//
// Everything is data, so all the stated definitions can be read (and diffed against the code) in one pass.

export const DEFINITIONS = {

  'hm-positions': {
    summary: 'How these numbers are worked out',
    intro: 'Everything on this page is built from Ashby <strong>openings</strong> (the positions being filled) and <strong>offers</strong> (the people). Those two are counted differently, which is the single most common source of confusion here — see <em>Worth knowing</em> at the bottom.',
    confirmed: 'Definitions confirmed with Jerin · 24 Aug 2026',
    groups: [
      {
        heading: 'The six cards at the top',
        items: [
          ['Total Positions', 'How many <strong>positions</strong> were opened in the period you have selected. Each opening counts once, in the quarter it was opened — so a role opened in Q2 keeps counting toward Q2 for as long as it stays open. Positions marked <em>On Hold</em> or <em>Shelved</em>, and positions with no opening date recorded in Ashby, are left out.'],
          ['Joined', 'Positions from that set that have since been closed as <em>hired</em>.'],
          ['Open', 'Positions from that set still to fill.'],
          ['Missed', 'Positions closed with the reason <em>carry forward</em> — the hire did not happen in that quarter and moved to the next one.'],
          ['Joining Pending', 'Counts <strong>people</strong>, not positions: everyone sitting in <em>Ref Check</em>, <em>Documentation</em> or <em>Offer</em> right now, minus anyone whose opening was raised in an earlier quarter. It is a <strong>live</strong> figure — changing the date filter does not change it.'],
          ['Dropped', 'Someone who moved to <em>Ref Check</em>, <em>Documentation</em> or <em>Offer</em> and was then <strong>archived</strong> — they declined, they withdrew, or we closed it with the offer still open. Counted in the quarter they <strong>first reached those stages</strong> (earliest of the three), not the quarter the record was closed. Each person counts <strong>once</strong>, however many times they moved in and out of a stage. The small print underneath is Dropped ÷ (Joined + Joining Pending + Dropped).'],
        ]
      },
      {
        heading: 'Department Summary — the columns',
        items: [
          ['Department', "Ashby's top-level department. Click the row to open the individual roles inside it."],
          ['Total Openings', 'Positions opened in the period, as above.'],
          ['Joined', 'Positions closed as hired.'],
          ['Joining Pending', 'People currently in Ref Check, Documentation or Offer — same rule as the card.'],
          ['Dropped', 'As above — reached Ref Check, Documentation or Offer, then archived — with their share of all outcomes underneath.'],
          ['Delta', 'Total Openings − Joined − Joining Pending. <strong>This can be negative, and that is allowed.</strong> A negative number means more people are in closing than there are positions recorded — which happens when an offer was never linked to an opening in Ashby. It shrinks as those links get fixed. The bar beside it fills with the shortfall, so the bar and the number always point the same way.'],
          ['Missed', 'Positions carried forward to the next quarter.'],
        ]
      },
      {
        heading: 'The chart',
        items: [
          ['One bar per department', 'The bar length is the positions opened in the period, split into <strong>Joined</strong>, <strong>Open</strong> and <strong>Missed</strong> — the three states every position is in, so they always add up to Total Openings.'],
          ['Why Joining Pending and Dropped are not on it', 'Those two count people. Stacking them onto a bar made of positions would produce a total that means nothing.'],
        ]
      },
      {
        heading: 'Joining Pending — Cases',
        items: [
          ['What the list is', 'One row per person currently in Ref Check, Documentation or Offer. Same people as the card, without the subtraction — so this list is slightly longer than the card figure.'],
          ['Opening Quarter', 'The quarter of the opening their offer is linked to. Most read <em>Not linked</em>, because linking an offer to an opening only became routine on 25 Jul 2026.'],
          ['Its own date filter', 'The DOJ month and date boxes above the list filter the list only. They do not touch anything else on the page.'],
        ]
      },
    ],
    warnings: [
      ['Positions and people are different units', 'Total Openings, Open and Missed count <strong>positions</strong>. Joining Pending and Dropped count <strong>people</strong>. One position can have several people in closing against it, so never read across the row as if it were one running total.'],
      ['Drop includes people who never had an offer raised', 'Until 26 Aug it did not — Drop required an offer record, which silently excluded anyone archived out of Ref Check or Documentation before anyone raised one. Every archived application was checked: <strong>17 such people</strong> were invisible, and 2026-Q2 went from 20 drops to 30.'],
      ['Joining Pending ignores the date filter', 'It always shows where things stand today. Everything else on this page follows the period you picked.'],
      ['A role only appears if it belongs here', 'It shows up when it had an opening in the period, or when someone is in closing on it. Roles with neither are not this period’s work and are left out.'],
    ]
  },

  'hm-throughput': {
    summary: 'How these numbers are worked out',
    intro: 'Built from <strong>real stage transitions</strong> in Ashby — every time a candidate entered or left a stage — not from a snapshot of where people sit today. That is what lets it follow the period you selected.',
    confirmed: 'Definitions confirmed with Jerin · 24 Aug 2026',
    groups: [
      {
        heading: 'The heat table',
        items: [
          ['One column per stage', 'The <strong>number</strong> is how many candidates <em>entered</em> that stage during the selected period. The <strong>shade</strong> behind it is what share of them then <em>moved past</em> it: pale under 50%, mid 50–70%, strong over 70%.'],
          ['Rows', 'Department, then the individual roles inside it. Click a department to open it.'],
          ['Overall', 'Doc Submission entries ÷ R1 entries — how much of what reaches the first interview makes it to paperwork.'],
          ['“Stage not used”', 'The grey cell means this workspace has never put a candidate in that stage — it is not a zero, it is a stage nobody uses. It is a guard against reading a naming problem as a business fact.'],
          ['Stage tick-boxes and Hide zero-pipeline', 'The tick-boxes choose which stage columns appear. <em>Hide zero-pipeline</em> drops roles with no movement at all in the period.'],
        ]
      },
      {
        heading: 'The two charts',
        items: [
          ['Stage Throughput (In vs Out)', '<strong>In</strong> = candidates who entered the stage, <strong>Out</strong> = candidates who moved past it, added up across every role matching the filters.'],
          ['Pipeline Funnel — Total', 'How many candidates reached each stage, across the same roles. The bars are centred so the shape reads as a funnel; the number on each is the count that reached it.'],
        ]
      },
    ],
    warnings: [
      ['A role with no movement reads zero, not its history', 'If a role had no transitions in the selected period it shows zeros. It used to fall back to its all-time numbers, which made long-closed roles look busy — an all-time number under a quarter heading is impossible to spot by eye.'],
      ['Not the same as the Pipeline tab', 'This counts movement <em>during</em> a period. Pipeline counts people <em>sitting</em> somewhere today. The two will never tie out, and are not meant to.'],
    ]
  },

  'hm-pipeline': {
    summary: 'How these numbers are worked out',
    intro: 'This is a <strong>live snapshot</strong>: where candidates stand right now. It is the one table on this page whose numbers the date filter does not change.',
    confirmed: 'Definitions confirmed with Jerin · 24 Aug 2026',
    groups: [
      {
        heading: 'Reading the table',
        items: [
          ['The numbers', 'How many candidates are sitting in that stage <strong>today</strong>. Nothing here is historical.'],
          ['What the date filter does do', 'It decides <strong>which roles are listed</strong> — only those with an opening in the selected period. It does not touch the counts.'],
          ['Rows', 'Department, then the roles inside it. Click to open.'],
          ['Stage tick-boxes and Hide zero-pipeline', 'The tick-boxes choose which stage columns appear. <em>Hide zero-pipeline</em> drops roles with nobody in them.'],
        ]
      },
    ],
    warnings: [
      ['Do not add it to the Throughput numbers', 'That table counts movement during a period; this one counts people standing still today. Different questions, different totals.'],
      ['Online Assessment is thin, not empty', 'It is genuinely used — 182 candidates have reached it, 83 of them this quarter — but the volumes are small next to App Review and R1, so read a single role’s OA numbers with care.'],
    ]
  },

  'hm-panelists': {
    summary: 'How these numbers are worked out',
    intro: 'Interview load per person, from the interviews actually scheduled in Ashby.',
    confirmed: 'Definitions confirmed with Jerin · 24 Aug 2026',
    groups: [
      {
        heading: 'The columns',
        items: [
          ['Department / panelist', 'The department row totals its people; open it to see each panelist, with the role they interviewed for beside their name.'],
          ['Interview Count', 'Interviews in the selected period. A panel of two people counts once for each of them — this is interviewing <em>load</em>, not a count of interviews held.'],
          ['Avg Time for Feedback', 'Average gap between an interview ending and that person submitting their feedback form. Shown in hours under a day, days above it.'],
        ]
      },
    ],
    warnings: [
      ['Avg Time for Feedback is all-time', 'It has no quarter breakdown in the data, so it does <strong>not</strong> follow the period selector even though the count beside it does.'],
      ['These totals are bigger than Overview’s interview count', 'Overview counts interview <em>events</em>; this counts <em>places on panels</em>. A two-person panel is one event and two places. Never compare the two directly.'],
    ]
  },

  'rec-fulfilment': {
    summary: 'How these numbers are worked out',
    intro: 'Two tables, same shape. <strong>Non-Sales</strong> is measured on <strong>Joined + Joining Pending</strong>; <strong>Sales</strong> on <strong>Joined</strong>. Everything follows the Year/Quarter selector at the top.',
    confirmed: 'Definitions confirmed with Jerin · 24 Aug 2026',
    groups: [
      {
        heading: 'The two number types in every column',
        items: [
          ['HC', 'Headcount — a count of people (or of positions, for Goal).'],
          ['Score', 'The same thing weighted by how hard the role is: each role scores points from its Family, Level and Complexity, set in <strong>Admin → Metric Configuration</strong>. A senior niche hire is worth many times a vanilla one.'],
        ]
      },
      {
        heading: 'The columns',
        items: [
          ['Goal — Joiners', 'The <strong>positions opened in the selected quarter</strong> on the roles this recruiter works — not every role they have ever touched. Where several recruiters work the same role, its positions are <strong>split equally</strong> between them, which is why some Goals show a decimal.'],
          ['Capacity', 'What this recruiter is expected to carry in the quarter, set by hand in <strong>Admin → Metric Configuration</strong>. Blank until somebody sets it.'],
          ['Joined', 'Candidates whose <strong>start date</strong> falls in the quarter, taken from the individual offer records — so it follows the quarter properly.'],
          ['JP Total', 'People currently in Ref Check, Documentation or Offer. It is always <strong>exactly the two columns beside it added together</strong> — never counted separately.'],
          ['JP — Current Qtr <span class="defs-tag">Non-Sales</span>', 'Everyone in closing, minus anyone on an earlier quarter’s opening, minus anyone joining next quarter.'],
          ['JP — Upcoming Qtr <span class="defs-tag">Non-Sales</span>', 'Their opening was raised this quarter but they join next quarter. Reads 0 today because offers only started carrying an opening link on 25 Jul 2026.'],
          ['JP — Prev Qtr Openings <span class="defs-tag">Sales</span>', 'Opening raised last quarter, candidate joining this quarter — last quarter’s work landing now.'],
          ['JP — Current Qtr Openings <span class="defs-tag">Sales</span>', 'Everyone else in closing.'],
          ['Drop', 'Someone who moved to <em>Ref Check</em>, <em>Documentation</em> or <em>Offer</em> and was then <strong>archived</strong> — they declined, they withdrew, or we closed it with the offer still open. Counted in the quarter they <strong>first reached those stages</strong> (earliest of the three), not the quarter the record was closed. Each person counts <strong>once</strong>, however many times they moved in and out of a stage. The small print is Drop ÷ (Joined + JP + Drop).'],
          ['Delta', 'Goal minus what was achieved, so it is the shortfall. The bar fills with that shortfall, so the bar and the number always agree. Never shown below zero.'],
          ['Capacity Utilisation', 'Achieved ÷ Capacity. <strong>The colour runs the opposite way to Delta on purpose</strong>: over 100% is over-delivery and reads well, under 70% is under-use and is the thing worth acting on.'],
        ]
      },
      {
        heading: 'The chart and the Cases list',
        items: [
          ['Chart', 'One bar per recruiter, its full length their Capacity for the quarter: the solid part is what they achieved, the amber part the gap to capacity. Only recruiters with a capacity set appear. It reads off exactly the same figures as the table.'],
          ['Joining Pending — Cases', 'Every person in closing, one row each, grouped Pod → Recruiter → Candidate. A <strong>live</strong> list, so the quarter selector does not apply. Anyone with no recruiter tagged, or whose recruiter this tab hides by default, appears in the <em>No recruiter in this view</em> group at the bottom with the reason beside their name — so the list always accounts for everybody.'],
        ]
      },
    ],
    warnings: [
      ['Recruiters with no pod set are left out entirely', 'Out of every row, total and chart on this tab. Their numbers are in <strong>Data Hygiene → Pod Not Set</strong> — worth a look, one of them carries real volume.'],
      ['Drop includes people who never had an offer raised', 'Until 26 Aug it did not — Drop required an offer record, which silently excluded anyone archived out of Ref Check or Documentation before anyone raised one. Every archived application was checked: <strong>17 such people</strong> were invisible, and 2026-Q2 went from 20 drops to 30.'],
      ['Past recruiters are hidden by default', 'Their history still counts in the data; tick <em>Include past recruiters</em> to see them.'],
      ['Shared positions are split by convention, not measurement', 'The data cannot say who owns which position of a role several recruiters work, so the positions are divided equally. Treat a Goal on an evergreen role as approximate.'],
      ['Roles with no Level or Complexity in Ashby score nothing', 'They still count in HC, but contribute 0 to Score — so Score understates the work until those fields are filled in. The list is in <strong>Data Hygiene → Roles Missing Score Inputs</strong>.'],
    ]
  },

  'rec-momentum': {
    summary: 'How these numbers are worked out',
    intro: 'Momentum is the <strong>pace of work</strong> — how many candidates a recruiter pushed into each stage, day by day.',
    confirmed: 'Definitions confirmed with Jerin · 24 Aug 2026',
    groups: [
      {
        heading: 'Reading it',
        items: [
          ['The numbers', 'How many candidates <strong>entered</strong> that stage on that day, taken from the real stage-change history — so a bulk tidy-up in Ashby does not show up as a spike of work.'],
          ['Which stages', 'The three that recruiters actually drive: HM Screening, Online Assessment and R1.'],
          ['Rows and columns', 'Pod → Recruiter → Stage down the side, the last 30 days of the selected range across the top. Open a recruiter to see the individual roles behind their numbers.'],
          ['The From / To boxes', 'Momentum is the one panel driven by the <strong>From</strong> and <strong>To</strong> dates rather than the quarter selector.'],
          ['Chart', 'Three bars per recruiter, one per stage, stacked by week so you can see whether the pace is holding up.'],
        ]
      },
    ],
    warnings: [
      ['An orange line naming a stage means no data anywhere', 'Not a quiet week — that stage has no events in the whole history. It checks everything on file, not just the visible window.'],
    ]
  },

  'rec-screening': {
    summary: 'How these numbers are worked out',
    intro: 'How much of what arrives at a stage actually moves on, from real stage transitions, scoped to the selected quarter.',
    confirmed: 'Definitions confirmed with Jerin · 24 Aug 2026',
    groups: [
      {
        heading: 'The columns',
        items: [
          ['Added', 'Candidates who <strong>entered</strong> the stage in the period.'],
          ['Cleared', 'Candidates who <strong>left</strong> it — reached the next stage.'],
          ['%', 'Cleared ÷ Added. What share of the queue got moved on.'],
          ['Rows', 'Pod → Recruiter → the individual roles behind each recruiter’s numbers.'],
        ]
      },
    ],
    warnings: [
      ['Added and Cleared can belong to different people', 'Someone entering the stage in March and clearing it in April is counted in whichever quarter each event happened. Over a short window the percentage can exceed 100%.'],
      ['Online Assessment volumes are small', 'Real but thin — 182 candidates have reached it in total. Percentages on a single recruiter’s OA column can swing on one or two people.'],
    ]
  },

  'rec-joining': {
    summary: 'How these numbers are worked out',
    intro: 'A <strong>cohort</strong> view: take the offers raised in the selected quarter, then follow what became of those same people. Every row closes — Offered = Joined + Dropped + still in flight.',
    confirmed: 'Definitions confirmed with Jerin · 26 Aug 2026',
    groups: [
      {
        heading: 'The columns',
        items: [
          ['Offered', 'Offers <strong>raised in the selected quarter</strong>. This fixes the group of people the rest of the row is about.'],
          ['Dropped', 'Of those same offers, how many ended <strong>archived</strong> — the candidate declined, they withdrew, or we closed it with the offer still open.'],
          ['Joined', 'Of those same offers, how many became hires.'],
          ['Joining Conversion', 'Joined ÷ Offered, with a bar so it reads at a glance. The caption underneath shows the split, including anyone <strong>still in flight</strong>.'],
          ['The chart', 'One bar per recruiter: <strong>Joined</strong> and <strong>Dropped</strong> stacked, with the cohort total — <strong>Offered</strong> — printed at the end of the bar. The bar stops short of that number whenever people are still in flight; the pale segment is that remainder, drawn so the number at the end is honest rather than unexplained.'],
        ]
      },
    ],
    warnings: [
      ['The newest quarter always reads low, and it is not a performance signal', 'Conversion is Joined ÷ <strong>Offered</strong>, so candidates who have accepted but not yet started sit in the denominator. A quarter climbs as its people start. Compare a finished quarter with a finished quarter.'],
      ['Dropped here is narrower than Drop on Fulfilment', 'This table is built from offers, so someone archived after reaching Ref Check or Documentation with <em>no offer ever raised</em> cannot appear on it. Same definition of a drop, smaller population — the two will not tie.'],
      ['Recruiters with no pod set are missing entirely', 'As everywhere on this tab. That currently hides a large share of the quarter\u2019s offers — see <strong>Data Hygiene → Pod Not Set</strong>.'],
    ]
  },

  'rec-sourcing': {
    summary: 'How these numbers are worked out',
    intro: 'Where each recruiter’s candidates come from.',
    confirmed: 'Definitions confirmed with Jerin · 24 Aug 2026',
    groups: [
      {
        heading: 'Reading it',
        items: [
          ['Four levels', 'Pod → Recruiter → Source type (e.g. <em>Job Board</em>) → the specific source (e.g. <em>Indeed Listing</em>, <em>LinkedIn</em>, <em>Employee Referral</em>).'],
          ['Count', 'Candidates credited to that recruiter from that source.'],
          ['%', 'Share of the level above it — a source’s share of its type, a type’s share of the recruiter, a recruiter’s share of the pod.'],
        ]
      },
    ],
    warnings: [
      ['Counted by when the candidate APPLIED', 'Someone sourced in June counts in Q2 even if they are still in process now. Org-wide totals by department and role are on <strong>Overall Efficiency → Sourcing Mix</strong>.'],
    ]
  },

  'rec-tis': {
    summary: 'How these numbers are worked out',
    intro: 'How long candidates sit waiting at each step — the number is the <strong>median days</strong>, so one stuck candidate cannot drag a whole column.',
    confirmed: 'Definitions confirmed with Jerin · 24 Aug 2026',
    groups: [
      {
        heading: 'Reading it',
        items: [
          ['The numbers', 'Median days a candidate was parked in that stage. Hover a cell for the average and how many candidates it is based on.'],
          ['Red', 'Above 5 days. Colour only — nothing is filtered out.'],
          ['Rows', 'Pod → Recruiter → Job. Job rows cover everyone on that role, not only this recruiter.'],
          ['TA Screen → Offer', 'Measured from real stage history: when they entered the stage to when they left it, for candidates who entered during the selected period.'],
          ['App Review <span class="defs-tag">live</span>', 'Different from the rest: it measures everyone <strong>currently sitting</strong> in App Review, today minus the date they applied. There is no history behind it, so it cannot be split by quarter and keeps its live value whatever period you pick. It is marked with an orange asterisk.'],
        ]
      },
    ],
    warnings: [
      ['One column on this table is not on the same clock as the others', 'App Review is live; every other stage follows the period. That is why it carries the asterisk — do not read across the row as a single candidate’s journey.'],
    ]
  },

  'rec-hygiene': {
    summary: 'What each of these lists is',
    intro: 'The compliance view: candidates and roles the pipeline could not attribute cleanly. These get fixed <strong>in Ashby</strong>, and the rows disappear at the next refresh. Every list downloads as CSV, and none of them are affected by the filters at the top of the tab — that is deliberate.',
    confirmed: 'Definitions confirmed with Jerin · 24 Aug 2026',
    groups: [
      {
        heading: 'The lists',
        items: [
          ['Unassigned', 'Candidates in active screening with no Recruiter tagged on the hiring team. The actionable backlog — nobody is credited for this work. Candidates still in App Review are left out, since nobody has worked them yet.'],
          ['Multiple Recruiters', 'More than one person tagged as Recruiter on one application. Scoring credits the first, so the team should leave a single Recruiter of record.'],
          ['Multiple Sourcers', 'An application should never have more than one Sourcer. Anything here is a straight data error.'],
          ['Recruiter Roster', 'Everyone the pipeline knows about, and whether Ashby still shows them holding a recruiter licence. <em>Past recruiter</em> means the licence is gone but their history still counts.'],
          ['Pod Not Set', 'Real recruiters with real numbers who have no pod for the selected quarter. <strong>They are excluded from every table and chart on this tab</strong> — this list is where their work is visible until somebody assigns them a pod.'],
          ['Offers Missing Opening Link', 'Offers with no opening attached that are <strong>still in play</strong>. Without the link the offer cannot be tied to a position, which is why Delta on the HM tab goes negative.'],
          ['Hired Missing Opening Link', 'The same gap on people already hired or archived. Reference only — too late to fix usefully.'],
          ['Roles Missing Score Inputs', 'Roles with no Level or Complexity set in Ashby. They score zero, so they add headcount but no Score anywhere on the dashboard.'],
          ['Capacity Not Set', 'Recruiters with candidates attributed to them but no capacity for the quarter, so they have no target and no utilisation figure.'],
          ['Other Anomalies', 'One-off attribution problems, including any Ashby stage name the pipeline does not recognise — the guard that catches a stage being renamed and silently dropped.'],
        ]
      },
    ],
    warnings: [
      ['Two entries in Other Anomalies are there by design', '<em>Hired</em> and <em>Archived</em> are not pipeline stages, so they always show as unmapped. They are listed as a footnote, not an alert — an alert list topped by non-problems is one people stop reading.'],
    ]
  },

  'eff-fulfilment': {
    summary: 'How these numbers are worked out',
    intro: 'The same picture as the Hiring Manager tab, cut <strong>Department → Job</strong> and with a <strong>Score</strong> beside every count. Everything follows the Year/Quarter selector except Joining Pending, which is live.',
    confirmed: 'Definitions confirmed with Jerin · 25 Aug 2026',
    groups: [
      {
        heading: 'The columns',
        items: [
          ['Total Positions', 'Distinct openings raised in the selected quarter, counted once each in the quarter they were opened.'],
          ['Joined', 'Those positions that have been filled.'],
          ['Joining Pending', 'Everyone parked in <em>Ref Check</em>, <em>Documentation</em> or <em>Offer</em>, minus anyone whose opening belongs to an earlier quarter. Counts <strong>people</strong>. Live — the quarter selector does not change it.'],
          ['Drop', 'Someone who moved to <em>Ref Check</em>, <em>Documentation</em> or <em>Offer</em> and was then <strong>archived</strong> — they declined, they withdrew, or we closed it with the offer still open. Counted in the quarter they <strong>first reached those stages</strong> (earliest of the three), not the quarter the record was closed. Each person counts <strong>once</strong>, however many times they moved in and out of a stage. The small print is Drop ÷ (Joined + Joining Pending + Drop).'],
          ['Delta', 'Total Positions − Joined − Joining Pending. <strong>It can be negative, and that is allowed</strong> — it means more people are in closing than there are positions recorded, which happens when an offer was never linked to an opening. The bar fills with the shortfall, so bar and number always agree.'],
          ['Missed', 'Positions closed as <em>carry forward</em> to the next quarter.'],
          ['HC and Score', '<strong>HC</strong> is the count. <strong>Score</strong> weights it by how hard the role is (Family + Level + Complexity, from <strong>Admin → Metric Configuration</strong>). A role with no Level or Complexity in Ashby is marked <em>unscored</em>: it still counts in HC but adds nothing to Score.'],
        ]
      },
      {
        heading: 'Charts and the Cases list',
        items: [
          ['One chart per department', 'Bars are the roles inside it, stacked Joined / Joining Pending / Delta, with the total on the end — the same three numbers as the table. The <em>All departments</em> chart does the same one level up, and hides itself when you filter to a single department.'],
          ['A negative Delta on a chart', 'A bar cannot be drawn backwards, so the Delta segment stops at zero while the table keeps the negative number. The table is the honest version.'],
          ['Joining Pending — Cases', 'Every person with an offer in play, scoped to the Department and Job filters. <strong>Unlinked</strong> means no opening is attached in Ashby, so that person is invisible to the position counts above. Those are the ones to fix first.'],
        ]
      },
    ],
    warnings: [
      ['Drop includes people who never had an offer raised', 'Until 26 Aug it did not — Drop required an offer record, which silently excluded anyone archived out of Ref Check or Documentation before anyone raised one. Every archived application was checked: <strong>17 such people</strong> were invisible, and 2026-Q2 went from 20 drops to 30.'],
      ['Positions and people in the same row', 'Total Positions, Joined and Missed count <strong>positions</strong>. Joining Pending and Drop count <strong>people</strong>. One position can hold several people in closing, which is exactly why Delta is allowed to go negative.'],
      ['This table should now agree with HM → Department Summary', 'Same definitions, same rules about which roles appear. The differences that remain are presentation: this one adds Score to every column and drills to the job with a chart per department.'],
      ['The Cases list is slightly longer than the column', 'The column subtracts people sitting on an earlier quarter’s opening; the list shows everyone, so nobody is lost.'],
    ]
  },

  'eff-momentum': {
    summary: 'How these numbers are worked out',
    intro: 'The pace of work across the whole org: how many candidates were pushed into each stage, day by day, <strong>Department → Job → Stage</strong>.',
    confirmed: 'Definitions confirmed with Jerin · 24 Aug 2026',
    groups: [
      {
        heading: 'Reading it',
        items: [
          ['The numbers', 'Candidates who <strong>entered</strong> that stage on that day, from real stage-change history — so a bulk update in Ashby is not mistaken for a burst of work.'],
          ['Which stages', 'HM Screening, Online Assessment and R1 — the three that get actively driven.'],
          ['Columns', 'The last 30 days of the selected date range.'],
          ['Charts', 'One per department, with the three stages stacked.'],
        ]
      },
    ],
    warnings: [
      ['An orange line naming a stage means no data at all', 'It checks the whole history, not just the visible window, so a quiet week is never mislabelled as an unused stage.'],
    ]
  },

  'eff-screening': {
    summary: 'How these numbers are worked out',
    intro: 'How much of what arrives at each screening stage moves on, <strong>Department → Job</strong>, from real stage transitions.',
    confirmed: 'Definitions confirmed with Jerin · 24 Aug 2026',
    groups: [
      {
        heading: 'The columns',
        items: [
          ['Added', 'Candidates who entered the stage in the period.'],
          ['Cleared', 'Candidates who left it — reached the next stage.'],
          ['%', 'Cleared ÷ Added.'],
          ['Charts', 'One per department, Added against Cleared for each stage.'],
        ]
      },
    ],
    warnings: [
      ['Added and Cleared can be different people', 'Each event is counted in the quarter it happened, so someone can be added in one quarter and clear in the next.'],
    ]
  },

  'eff-throughput': {
    summary: 'How these numbers are worked out',
    intro: 'The full funnel, stage by stage, <strong>Department → Job</strong>.',
    confirmed: 'Definitions confirmed with Jerin · 24 Aug 2026',
    groups: [
      {
        heading: 'The columns',
        items: [
          ['In', 'Candidates who entered the stage during the period.'],
          ['Out', 'Candidates who moved past it.'],
          ['Throughput %', 'Out ÷ In — what share of the queue got moved on.'],
        ]
      },
    ],
    warnings: [
      ['Online Assessment carries small numbers', 'Used, but thinly: 182 candidates in total (Q1 159, Q2 75, Q3 83 reached it). Treat a single role’s OA conversion as indicative, not solid.'],
    ]
  },

  'eff-tis': {
    summary: 'How these numbers are worked out',
    intro: 'How long candidates sit waiting at each step, <strong>Department → Job</strong>. The number is the <strong>median days</strong>, so a handful of stuck candidates cannot drag the whole column.',
    confirmed: 'Definitions confirmed with Jerin · 24 Aug 2026',
    groups: [
      {
        heading: 'Reading it',
        items: [
          ['The numbers', 'Median days parked in that stage. Hover for the average and the number of candidates behind it.'],
          ['Red', 'Above 5 days. Colour only — nothing is hidden.'],
          ['TA Screen → Offer', 'From real stage history: entered to left, for candidates who entered during the selected period.'],
          ['App Review <span class="defs-tag">live</span>', 'Everyone <strong>currently sitting</strong> in App Review, measured as today minus their application date. There is no history behind it, so it cannot be split by quarter and keeps its live value whatever period you choose. Marked with an orange asterisk.'],
        ]
      },
    ],
    warnings: [
      ['One column is not on the same clock as the others', 'App Review is live; every other stage follows the period. Do not read across a row as one candidate’s journey.'],
    ]
  },

  'eff-joining': {
    summary: 'How these numbers are worked out',
    intro: 'Offered → Hired, <strong>Department → Job</strong>.',
    confirmed: 'Definitions confirmed with Jerin · 24 Aug 2026',
    groups: [
      {
        heading: 'The columns',
        items: [
          ['Offered', 'Offers made on that role.'],
          ['Hired', 'How many of those offers ended in a hire.'],
          ['Conversion %', 'Hired ÷ Offered.'],
        ]
      },
    ],
    warnings: [
      ['An offer counts in the quarter it was DECIDED, not raised', 'So every offer in the denominator has actually been answered, and the rate is not dragged down by offers still awaiting a reply.'],
    ]
  },

  'eff-sourcing': {
    summary: 'How these numbers are worked out',
    intro: 'Where candidates come from, <strong>Department → Job → Source type → Source</strong>.',
    confirmed: 'Definitions confirmed with Jerin · 24 Aug 2026',
    groups: [
      {
        heading: 'Reading it',
        items: [
          ['Count', 'Candidates credited to that source for that role, who applied in the selected quarter.'],
          ['%', 'Share of the level above — a source’s share of its type, a type’s share of the role, and so on.'],
          ['Why it can be filtered by department and job', 'Sources are recorded per candidate and per role, so the tree can follow the role while the credit follows the recruiter who worked it.'],
        ]
      },
    ],
    warnings: [
      ['Counted by when the candidate APPLIED', 'Someone sourced in June counts in Q2 even if they are still in process now.'],
    ]
  },

  'interviewer': {
    summary: 'How these numbers are worked out',
    intro: 'Interview load and feedback per panelist, built from the interviews actually scheduled in Ashby and the feedback forms submitted against them.',
    confirmed: 'Definitions confirmed with Jerin · 24 Aug 2026',
    groups: [
      {
        heading: 'The columns',
        items: [
          ['Interviews', 'Interviews this panelist sat on during the selected period.'],
          ['Feedback Coverage', 'Interviews that have feedback attached, as a share of that panelist’s interviews. Shown on <strong>panelist rows only</strong> — see below.'],
          ['Awaiting Feedback', 'Interviews still with no feedback attached. All-time, per person.'],
          ['Avg Turnaround', 'Average time from an interview ending to the feedback being submitted. All-time.'],
          ['Interview Feedback', 'Feedback forms matched to one of that panelist’s <em>scheduled interviews</em>. The number in brackets is <strong>every</strong> form they submitted, including application review and screening feedback.'],
          ['Rows', 'Department → Panelist → the roles they interviewed for.'],
          ['Chart', 'One bar per panelist for the top interviewers, stacked by month.'],
        ]
      },
    ],
    warnings: [
      ['Three columns are blank on department and job rows on purpose', 'Feedback Coverage, Awaiting Feedback and Avg Turnaround are recorded <strong>per person across the whole org</strong>, not per role. Adding them up a tree that splits one person across several roles would count them twice, so they only appear where they mean something.'],
      ['The bracketed feedback figure is not a completion rate', 'It counts every form a person submitted, which can easily exceed their interview count — one panelist has 440 forms against 2 interviews. That is why it is shown as a raw number and never as a percentage. Use <strong>Feedback Coverage</strong> for the rate.'],
      ['Avg Turnaround does not follow the period', 'It has no quarter breakdown in the data, unlike the interview count beside it.'],
    ]
  },

  'overview': {
    summary: 'How these numbers are worked out',
    intro: 'The one-page summary. Everything follows the Year/Quarter selector unless it says otherwise.',
    confirmed: 'Definitions confirmed with Jerin · 24 Aug 2026',
    groups: [
      {
        heading: 'The five cards',
        items: [
          ['Total Positions', 'Positions opened in the selected period, counted once each in the quarter they were opened. The line underneath splits them into joined, open and — where there are any — missed.'],
          ['Applications', 'Candidates who applied in the period.'],
          ['Candidates Interviewed', 'Distinct <strong>people</strong> we assessed in the period. Someone counts once whether they sat one interview or five. It includes candidates who took an <strong>online assessment</strong> (HeyMilo, Trifle, HackerEarth) as well as those who met a panel — the two are combined by person, not added, because plenty of candidates do both. The line underneath splits them.'],
          ['Total Hired', 'Hires in the period, with the conversion from applications underneath.'],
          ['Fill Rate', 'Positions joined ÷ positions opened, for the period.'],
        ]
      },
      {
        heading: 'The rest of the page',
        items: [
          ['Pipeline bar', 'Applied → Screened → Interviewed → Offered → Hired for the period. Each band is how many candidates reached that point, so the bands step down.'],
          ['Positions by Department', 'The same positions as the Total Positions card, broken out by department.'],
          ['Top Jobs by Hired / by Applications', 'The busiest roles in the period, by outcome and by inflow.'],
          ['Top Panelists by Interview Count', 'Who carried the interviewing load in the period.'],
        ]
      },
    ],
    warnings: [
      ['This card counts people; the interview tabs count interviews', 'Candidates Interviewed counts a person once. The Hiring Manager → Panelists table and the Interviewer Efficiency tab count <strong>places on panels</strong> — a candidate seen three times by two people each is 1 here and 6 there. Both are right; they answer different questions, so never compare them directly.'],
    ]
  },

};

// Renders one definitions block. Collapsed by default — it is reference material, not something to read
// every visit. Unknown id renders nothing rather than throwing, so a half-finished rollout cannot break a page.
export function defsBlock(id) {
  const d = DEFINITIONS[id];
  if (!d) return '';
  const rows = (items) => items.map(([term, text]) =>
    `<div class="defs-row"><div class="defs-term">${term}</div><div class="defs-text">${text}</div></div>`).join('');
  const groups = (d.groups || []).map(g =>
    `<div class="defs-group"><h5>${g.heading}</h5>${rows(g.items)}</div>`).join('');
  const warn = (d.warnings || []).length
    ? `<div class="defs-group defs-warn"><h5>Worth knowing</h5>${rows(d.warnings)}</div>`
    : '';
  return `<details class="defs defs-full">
    <summary>${d.summary}</summary>
    <div class="defs-body">
      ${d.intro ? `<p class="defs-intro">${d.intro}</p>` : ''}
      ${groups}${warn}
      ${d.confirmed ? `<p class="defs-confirmed">${d.confirmed}</p>` : ''}
    </div>
  </details>`;
}
