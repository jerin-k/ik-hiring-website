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
          ['Dropped', 'Someone who reached <em>Ref Check</em>, <em>Documentation</em> or <em>Offer</em> and was then <strong>archived</strong> \u2014 declined, withdrew, or closed with the offer still open. Counted in the quarter they first got there, <strong>once</strong> per person. The small print is Dropped \u00f7 Offered.'],
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
          ['Delta', 'Total Openings \u2212 Joined \u2212 Joining Pending. <strong>It can go negative, and that is allowed</strong> \u2014 it means more people are in closing than positions recorded, which happens when an offer was never linked to an opening. It shrinks as those links get fixed.'],
          ['Missed', 'Positions carried forward to the next quarter.'],
        ]
      },
      {
        heading: 'The chart',
        items: [
          ['One bar per department', 'Bar length is the positions opened in the period, split into <strong>Joined</strong>, <strong>Open</strong> and <strong>Missed</strong> \u2014 the three states every position is in, so they add up to Total Openings. Each section is split into the <strong>roles</strong> behind it &mdash; hover one to list them.'],
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
    intro: 'Of the people <strong>assessed</strong> at a stage, how many <strong>progressed</strong> to a later one. Built from real events in Ashby — interviews held, assignments triggered, feedback submitted — not from a snapshot of where people sit today.',
    confirmed: 'Definition rebuilt with Jerin · 30 Aug 2026',
    groups: [
      {
        heading: 'The heat table',
        items: [
          ['One column per stage', 'The <strong>number</strong> is how many candidates were <em>assessed</em> at that stage during the period — an interview actually held there, an assignment triggered there, or a feedback form (a select or reject) where no interview exists, with the share who then reached a <em>later</em> stage below it.'],
          ['What the colour means', 'The <strong>shade is how many people that square lost</strong> \u2014 assessed there, then never reached a later stage. Darkest is 100 or more. <strong>The number in the square is still the throughput percentage.</strong> Colour ranks what to fix; the number tells you the rate.'],
          ['Rows', 'Department, then the individual roles inside it. Click a department to open it.'],
          ['Overall', 'One span per candidate: assessed at <strong>R1 or Online Assessment</strong>, whichever came first, through to <strong>Ref Check, Documentation or Offer</strong>, whichever they reached first. It is counted per person, never one stage column divided by another — see the warning below.'],
          ['A blank cell', 'A dot or a dash means <strong>nobody was assessed</strong> at that stage in the period — several stages here carry very little traffic, and plenty of roles skip a round entirely. It is not a zero rate, and it is not missing data.'],
          ['Stage tick-boxes and Hide zero-pipeline', 'The tick-boxes choose which stage columns appear. <em>Hide zero-pipeline</em> drops roles with no movement at all in the period.'],
        ]
      },
      {
        heading: 'The chart',
        items: [
          ['The chart', 'Department down the side, <strong>stage across the top</strong>. Each cell reads <strong>assessed \u2192 progressed</strong> with the rate below it, shaded by how many people it lost. The last column is the <strong>R1/OA \u2192 late stage</strong> span. A dot means nobody was assessed there. Hover for the counts, the rate and the loss.'],
        ]
      },
    ],
    warnings: [
      ['This measure changed on 30 August 2026, and the numbers fell', 'It used to count anyone who <em>left</em> a stage as having got through it, so a rejection counted like a promotion. It now counts only people who reached a later stage. Lower numbers are the correction, and figures from before 30 Aug 2026 are not comparable.'],
      ['The columns are not a funnel — do not read them left to right', 'Each stage is measured on its own. One column’s <em>progressed</em> will not equal the next column’s <em>assessed</em>, and often will not come close. Three reasons, all real: candidates skip stages (most roles never use Hello Christy or HM Review), <em>progressed</em> means reaching <em>any</em> later stage rather than the next one, and each figure is dated by when the assessment happened — so somebody screened in June and interviewed in July lands in two different quarters. Compare a stage to itself over time, not to its neighbour.'],
      ['Offer shows a count and no rate', 'Offer is the last stage in the ladder, so there is nothing after it to progress to. Showing 0% there would read as everyone falling out at the final step. The number of people assessed at Offer is still shown.'],
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
          ['Joined', 'Candidates whose <strong>start date</strong> falls in the quarter, from the individual offer records. On <strong>Non-Sales</strong> it also excludes anyone linked to an <strong>earlier quarter\u2019s opening</strong> — last quarter\u2019s work landing now. <strong>Sales takes no such subtraction</strong>, deliberately: its goal is joiners whenever the opening was raised.'],
          ['JP Total', 'People currently in Ref Check, Documentation or Offer. It is always <strong>exactly the two columns beside it added together</strong> — never counted separately.'],
          ['JP — Current Qtr <span class="defs-tag">Non-Sales</span>', 'Everyone in closing, minus anyone on an earlier quarter’s opening, minus anyone joining next quarter.'],
          ['JP — Upcoming Qtr <span class="defs-tag">Non-Sales</span>', 'Their opening was raised this quarter but they join next quarter. Reads 0 today because offers only started carrying an opening link on 25 Jul 2026.'],
          ['JP — Prev Qtr Openings <span class="defs-tag">Sales</span>', 'Opening raised last quarter, candidate joining this quarter — last quarter’s work landing now.'],
          ['JP — Current Qtr Openings <span class="defs-tag">Sales</span>', 'Everyone else in closing.'],
          ['Drop', 'Someone who reached <em>Ref Check</em>, <em>Documentation</em> or <em>Offer</em> and was then <strong>archived</strong> \u2014 declined, withdrew, or closed with the offer still open. Counted in the quarter they first got there, <strong>once</strong> per person. The small print is Drop \u00f7 (Joined + JP + Drop).'],
          ['Delta', 'Goal minus what was achieved, so it is the shortfall. The bar fills with that shortfall, so the bar and the number always agree. Never shown below zero.'],
          ['Capacity Utilisation', 'Achieved ÷ Capacity. <strong>The colour runs the opposite way to Delta on purpose</strong>: over 100% is over-delivery and reads well, under 70% is under-use and is the thing worth acting on.'],
        ]
      },
      {
        heading: 'The chart and the Cases list',
        items: [
          ['Chart', 'One bar per recruiter \u2014 the bar is what they <strong>achieved</strong>. A solid line marks their <strong>Goal</strong>, a dashed line their <strong>Capacity</strong>, and amber fills any shortfall to Goal. Same figures as the table. Each section is split into the <strong>roles</strong> behind it &mdash; hover one to list them. <em>Short of Goal</em> is not split \u2014 it belongs to no single role.'],
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
    intro: 'How many candidates were <strong>added to the top of the funnel</strong> on each day — one row per person, not one per stage.',
    confirmed: 'Definitions confirmed with Jerin \u00b7 26 Aug 2026',
    groups: [
      {
        heading: 'What counts as being added',
        items: [
          ['Whichever of these comes first', 'The candidate <strong>enters HM Screening</strong>, or an <strong>assessment is triggered</strong> while they are sitting in the Online Assessment stage, or an <strong>R1 interview is booked</strong>. The first of the three is the day they were added.'],
          ['R1 is dated when the interview was BOOKED', 'Not the day it is held \u2014 booking is the piece of work, and the interview itself can be a week later.'],
          ['Counted once per role', 'Once somebody is logged as added, they are not counted again for that role. Moving them on afterwards does not add to the number \u2014 that is the point: this counts <em>people arriving</em>, not steps taken.'],
          ['The count resets each quarter', 'Somebody who arrives again in a later quarter counts again in that quarter. So the quarters do not add up to a year.'],
          ['Cancelled does not count', 'A cancelled interview booking or a cancelled assessment is removed. If that was the only thing that put someone in, the day they were on ticks back down.'],
        ]
      },
      {
        heading: 'Reading it',
        items: [
          ['Rows and columns', 'Pod \u2192 Recruiter \u2192 Job \u2192 the day columns. Open a recruiter to see the roles behind their numbers. The last 30 days of the selected range run across the top, most recent first.'],
          ['Total \u00b7 30d', 'Everything in the 30 columns beside it added up \u2014 the row\u2019s arrivals for that window, not for the whole quarter.'],
          ['The From / To boxes', 'Momentum is the one panel driven by the <strong>From</strong> and <strong>To</strong> dates rather than the quarter selector. It always shows the last 30 days of that range.'],
          ['The heatmap', 'One row per <strong>recruiter</strong>, one square per <strong>day</strong>; darker means more people added, and the count is in the square. <strong>Hover a square</strong> to list the roles behind it. Weekends are shaded. The right-hand column is the 30-day total, the bottom row each day\u2019s total.'],
          ['Weekends', 'Saturday and Sunday dates are printed in a soft maroon, on the chart and underlined in the table. An empty bar on a Sunday is a weekend, not a bad day.'],
          ['The small maroon mark under a bar', 'A <strong>weekday</strong> with no arrivals at all. Weekends do not get one \u2014 nothing happening on a Saturday is not news.'],
        ]
      },
    ],
    warnings: [
      ['This will not match Screening Efficiency', 'That tab counts <em>arrivals at each stage</em> and counts a person again every time they re-enter one. This counts <em>people</em>, once. Two different questions \u2014 the numbers are not supposed to agree.'],
      ['Assessments start on 8 July 2026', 'That is when the team began sending assessments through Ashby \u2014 confirmed by Jerin. Before that date a candidate could only be added by HM Screening or an R1 booking, because there were no assessments to see. Nothing is missing from Q1 and Q2; that is simply how the process ran.'],
    ]
  },
  'rec-screening': {
    summary: 'How these numbers are worked out',
    intro: 'What happens to candidates once they reach <strong>R1</strong> \u2014 how many were put into an R1 round, and how many went further.',
    confirmed: 'Definitions confirmed with Jerin \u00b7 29 Aug 2026',
    groups: [
      {
        heading: 'The columns',
        items: [
          ['Added at R1', 'The candidate was <strong>actioned at R1</strong>, by either route: an <strong>interview was scheduled</strong> at R1, or an <strong>assignment was triggered</strong> while they were sitting at R1. Either one counts; somebody with both counts once. Dated by when the interview was booked, or when the assignment went out.'],
          ['Progressed', 'Of those, the ones who reached <strong>R2 or beyond</strong> \u2014 any later round, Reference Check, Documentation or Offer \u2014 on or after that day.'],
          ['%', 'Progressed \u00f7 Added at R1.'],
          ['Rows', 'Pod \u2192 Recruiter \u2192 Role. Only roles that actually saw R1 activity in the period are listed \u2014 a recruiter\u2019s older roles are not shown as a row of zeros.'],
          ['Counted once', 'One count per candidate per role per quarter, however many times they were booked or re-booked. Cancelled interviews and cancelled assignments do not count at all.'],
          ['Chart', 'A <strong>dumbbell</strong>: hollow dot = <strong>added at R1</strong>, solid dot = <strong>progressed past it</strong>, and the line between them is the drop-off. <strong>The axis runs down left to right on purpose</strong>, so it reads added \u2192 progressed. The rate sits in its own column on the right. Hover a row to list its roles.'],
        ]
      },
    ],
    warnings: [
      ['This will not match the old per-stage numbers', 'The panel used to show HM Screening, Online Assessment and R1 side by side, counting stage ENTRIES \u2014 which counted a candidate again every time they came back round. This counts people once, off the action taken. The figures are not comparable.'],
      ['It will not match Momentum\u2019s R1 either', 'Momentum only credits R1 when it was the candidate\u2019s <em>first</em> signal into the funnel. Here every R1 action counts, including candidates who arrived through HM Screening earlier. Momentum\u2019s R1 is a subset of this one.'],
      ['HM Screening and Online Assessment are not on this panel', 'By design \u2014 this one is about R1. Both still count towards <strong>Momentum</strong>, where they are two of the three ways a candidate enters the funnel.'],
    ]
  },
  'rec-joining': {
    summary: 'How these numbers are worked out',
    intro: 'Everyone who reached an offer, and what became of them. <strong>Offered = Joined + Joining Pending + Dropped</strong>, so the row always closes.',
    confirmed: 'Definitions confirmed with Jerin · 26 Aug 2026',
    groups: [
      {
        heading: 'The columns',
        items: [
          ['Offered', 'Joined + Joining Pending + Dropped — everyone who got as far as an offer.'],
          ['Joined', 'People whose <strong>start date</strong> falls in the quarter, minus anyone whose offer is linked to an <strong>earlier quarter\u2019s opening</strong> — that was last quarter\u2019s work landing now.'],
          ['Joining Pending', 'Everyone in <em>Ref Check</em>, <em>Documentation</em> or <em>Offer</em>, minus earlier-quarter openings. Exactly the rule the Hiring Manager Positions card uses.'],
          ['Dropped', 'Reached Ref Check, Documentation or Offer and was then archived. The same list HM and both Fulfilment tables use.'],
          ['Joining Conversion', '(Joined + Joining Pending) ÷ Offered — the share of everyone who reached an offer who has <strong>not</strong> fallen out. The bar shows it at a glance.'],
          ['The chart', 'One bar per recruiter, stacking <strong>Joined</strong>, <strong>Joining Pending</strong> and <strong>Dropped</strong>, with <strong>Offered</strong> (their sum) at the end and <strong>Joining conversion</strong> in its own column on the right. Each section is split into the <strong>roles</strong> behind it &mdash; hover one to list them.'],
        ]
      },
    ],
    warnings: [
      ['This measures drop-out, not joining', 'Joined and Joining Pending appear on both sides of the fraction, so they cancel: it is really <strong>1 \u2212 Dropped \u00f7 Offered</strong>. It sits near 96% and moves only when people fall out. That is the intended question \u2014 <em>who have we lost?</em>'],
      ['Joining Pending is live; its neighbours are quarterly', 'It shows who is in Ref Check, Documentation or Offer <strong>today</strong>, so the same people sit inside every quarter\u2019s Offered. Kept that way on purpose, so this column matches the HM Positions card instead of inventing a fifth definition.'],
      ['Recruiters with no pod set are missing entirely', 'As everywhere on this tab — see <strong>Data Hygiene → Pod Not Set</strong>.'],
    ]
  },

  'rec-sourcing': {
    summary: 'How these numbers are worked out',
    intro: 'Where the people who actually <strong>joined</strong> came from.',
    confirmed: 'Definitions confirmed with Jerin · 29 Aug 2026',
    groups: [
      {
        heading: 'Reading it',
        items: [
          ['Four levels', 'Pod → Recruiter → Source type (e.g. <em>Job Portal</em>) → the specific source (e.g. <em>Naukri</em>, <em>LinkedIn</em>, <em>Employee Referral</em>).'],
          ['Joiners', 'People who accepted an offer and whose <strong>start date</strong> falls in the selected period, credited to that recruiter, counted against the source on their application. Leave Quarter on <em>All</em> and you get the whole year — the line above the table names the period being shown.'],
          ['%', 'Share of the level above it — a source’s share of its type, a type’s share of the recruiter, a recruiter’s share of the pod.'],
          ['(source not recorded)', 'A joiner whose application carries no source. They are kept here rather than dropped, so the panel still adds up to the number of joiners. About 1 in 20 today.'],
        ]
      },
    ],
    warnings: [
      ['This counts joiners, not applications', 'Deliberate (Jerin, 29 Aug 2026): a channel can bring tens of thousands of applications and produce almost no one who starts. Company marketing brought 25,810 applications in 2026 and 2 joiners; Job Portal brought far fewer and 44. The old application view made the loudest channel look like the best one.'],
      ['It will not match the number of applications anywhere else', 'Nothing on this panel is comparable to the application counts on Momentum, Screening Efficiency or the Overview — different unit, on purpose. Org-wide totals by department and role are on <strong>Overall Efficiency → Sourcing Mix</strong>.'],
    ]
  },

  'rec-tis': {
    summary: 'How these numbers are worked out',
    intro: 'How long each step actually takes. Every cell holds two things: the <strong>median days for candidates who finished the stage</strong>, and underneath in amber, <strong>how many are still sitting there</strong> and how long they have waited.',
    confirmed: 'Definitions confirmed with Jerin · 30 Aug 2026',
    groups: [
      {
        heading: 'Reading it',
        items: [
          ['The number on top', 'Median days for candidates who <strong>left</strong> the stage — how long that step actually took. This is the only figure on the table you can compare between quarters. Hover a cell for the average and how many candidates it is based on.'],
          ['The two amber lines below', 'The people <strong>still sitting</strong> in that stage: how many, and on the second line the median days they have waited so far. Their clock is still running, so read it as a backlog to clear, not as how long the step takes.'],
          ['A dash instead of a number', 'Nobody has finished that stage in the selected period. If there is an amber figure under it, everyone who arrived is still there.'],
          ['Red', 'Median above 5 days. Colour only — nothing is filtered out.'],
          ['Rows', 'Pod → Recruiter → Job. Job rows cover everyone on that role, not only this recruiter.'],
          ['Hello Christy', 'The bot route into screening — an alternative to TA Screen, not a step before it. Low volume, so its column is often empty.'],
          ['TA Screen → Offer', 'Measured from real stage history — entered the stage to left the stage — for candidates who <strong>arrived</strong> during the selected period.'],
          ['App Review <span class="defs-tag">live</span>', 'Entirely a waiting pile: everyone <strong>currently sitting</strong> in App Review, measured as today minus their application date. Nobody in it has finished, so it always shows a dash over an amber figure, and it cannot be split by quarter. Marked with an orange asterisk.'],
        ]
      },
    ],
    warnings: [
      ['Why the two figures are kept apart', 'Pooled into one median the number measured the calendar, not the process: anyone who never left the stage counted as \u201ctoday minus the day they applied\u201d, so an older quarter always read higher just for being older.'],
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
          ['Openings Missing Opened Date', 'Openings with no <strong>opened date</strong> in Ashby. They are <strong>left out of Total Openings entirely</strong> \u2014 on Hiring Manager Positions and on Overall Efficiency \u2014 so they are invisible rather than merely undated. One row per opening. Set the date on the opening in Ashby.'],
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
          ['Drop', 'Someone who reached <em>Ref Check</em>, <em>Documentation</em> or <em>Offer</em> and was then <strong>archived</strong> \u2014 declined, withdrew, or closed with the offer still open. Counted in the quarter they first got there, <strong>once</strong> per person. The small print is Drop \u00f7 (Joined + Joining Pending + Drop).'],
          ['Delta', 'Total Positions − Joined − Joining Pending. <strong>It can be negative, and that is allowed</strong> — it means more people are in closing than there are positions recorded, which happens when an offer was never linked to an opening. The bar fills with the shortfall, so bar and number always agree.'],
          ['Missed', 'Positions closed as <em>carry forward</em> to the next quarter.'],
          ['HC and Score', '<strong>HC</strong> is the count. <strong>Score</strong> weights it by how hard the role is (Family + Level + Complexity, from <strong>Admin → Metric Configuration</strong>). A role with no Level or Complexity in Ashby is marked <em>unscored</em>: it still counts in HC but adds nothing to Score.'],
        ]
      },
      {
        heading: 'Charts and the Cases list',
        items: [
          ['The chart', 'One bar per department, stacked Joined / Joining Pending / Delta with the total on the end — the same three numbers as the table. Each section is split into the <strong>roles</strong> behind it &mdash; hover one to list them. The legend is at metric level — clicking one toggles that whole colour.'],
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
    intro: 'How many candidates were <strong>added to the top of the funnel</strong> each day, across the whole org \u2014 one row per person, not one per stage.',
    confirmed: 'Definitions confirmed with Jerin \u00b7 29 Aug 2026',
    groups: [
      {
        heading: 'What counts as being added',
        items: [
          ['Whichever of these comes first', 'The candidate <strong>enters HM Screening</strong>, or an <strong>assessment is triggered</strong> while they are sitting in the Online Assessment stage, or an <strong>R1 interview is booked</strong>.'],
          ['R1 is dated when the interview was BOOKED', 'Not the day it is held.'],
          ['Counted once per role, per quarter', 'Somebody already added is not counted again for that role in the same quarter. The count resets each quarter, so quarters do not add up to a year.'],
          ['Cancelled does not count', 'A cancelled interview booking or assessment is removed, which can take a count back off a past day.'],
        ]
      },
      {
        heading: 'Reading it',
        items: [
          ['Rows and columns', 'Department \u2192 Role down the side, the last 30 days of the selected date range across the top.'],
          ['Total \u00b7 30d', 'The 30 columns beside it added up.'],
          ['Chart', 'One bar per <strong>day</strong>, stacked by department and shaded by <strong>role</strong> within it \u2014 darkest block is that department\u2019s busiest role in the window. The legend is per department; clicking one hides all of its roles.'],
          ['Weekends', 'Saturday and Sunday dates are printed in a soft maroon, on the chart and underlined in the table.'],
          ['The small maroon mark under a bar', 'A <strong>weekday</strong> with no arrivals at all. Weekends do not get one.'],
        ]
      },
    ],
    warnings: [
      ['This will not match Screening Efficiency', 'That panel counts what happened at R1 specifically. This counts everyone entering the funnel, by whichever of the three signals came first.'],
      ['Assessments start on 8 July 2026', 'That is when the team began sending assessments through Ashby. Before that date a candidate could only be added by HM Screening or an R1 booking \u2014 nothing is missing from Q1 and Q2.'],
    ]
  },
  'eff-screening': {
    summary: 'How these numbers are worked out',
    intro: 'What happens to candidates once they reach <strong>R1</strong>, by department \u2014 how many were put into an R1 round, and how many went further.',
    confirmed: 'Definitions confirmed with Jerin \u00b7 29 Aug 2026',
    groups: [
      {
        heading: 'The columns',
        items: [
          ['Added at R1', 'The candidate was <strong>actioned at R1</strong>: an <strong>interview was scheduled</strong> at R1, or an <strong>assignment was triggered</strong> while they sat at R1. Either counts; somebody with both counts once.'],
          ['Progressed', 'Of those, the ones who reached <strong>R2 or beyond</strong> \u2014 any later round, Reference Check, Documentation or Offer \u2014 on or after that day.'],
          ['%', 'Progressed \u00f7 Added at R1.'],
          ['Rows', 'Department \u2192 Role. Only roles that saw R1 activity in the period are listed.'],
          ['Counted once', 'One count per candidate per role per quarter. Cancelled interviews and cancelled assignments do not count at all.'],
          ['Chart', 'A <strong>dumbbell</strong>: hollow dot = <strong>added at R1</strong>, solid dot = <strong>progressed past it</strong>, and the line between them is the drop-off. <strong>The axis runs down left to right on purpose</strong>, so it reads added \u2192 progressed. The rate sits in its own column on the right. Hover a row to list its roles.'],
        ]
      },
    ],
    warnings: [
      ['This will not match the old per-stage numbers', 'The panel used to show HM Screening, Online Assessment and R1 side by side, counting stage ENTRIES \u2014 which counted a candidate again every time they came back round. The figures are not comparable.'],
      ['HM Screening and Online Assessment are not on this panel', 'By design \u2014 this one is about R1. Both still count towards <strong>Momentum</strong>, where they are two of the three ways a candidate enters the funnel.'],
    ]
  },
  'eff-throughput': {
    summary: 'How these numbers are worked out',
    intro: 'The full funnel, stage by stage, <strong>Department → Job</strong>. Of the people <strong>assessed</strong> at each stage, how many <strong>progressed</strong> to a later one.',
    confirmed: 'Definitions confirmed with Jerin · 30 Aug 2026',
    groups: [
      {
        heading: 'The columns',
        items: [
          ['Assessed', 'Candidates <strong>assessed</strong> at the stage during the period — an interview actually held there, an assignment triggered there, or a feedback form (a select or reject) where no interview exists. Someone who only sat in the queue does not count.'],
          ['Progressed', 'Of those, the ones who then reached a <strong>later stage</strong>. Being rejected or withdrawing does not count.'],
          ['%', 'Progressed ÷ Assessed — of the people actually assessed here, the share who moved forward. It cannot exceed 100%, because Progressed is a subset of Assessed.'],
          ['The chart', 'Department down the side, <strong>stage across the top</strong>. Each cell reads <strong>assessed \u2192 progressed</strong> with the rate below it, shaded by how many people it lost. The last column is the <strong>R1/OA \u2192 late stage</strong> span. A dot means nobody was assessed there. Hover for the counts, the rate and the loss.'],
          ['What the colour means', 'The <strong>shade is how many people that square lost</strong> \u2014 assessed there, then never reached a later stage. Darkest is 100 or more. <strong>The number in the square is still the throughput percentage.</strong> Colour ranks what to fix; the number tells you the rate.'],
        ]
      },
    ],
    warnings: [
      ['Do not add the stage columns together', 'One person assessed at R1, R2 and R3 appears in all three, so a total across stages counts them three times. Each column is only comparable to its own assessed figure. That is also why the Overall column is a single per-candidate span rather than a sum.'],
      ['This measure changed on 30 August 2026, and the numbers fell', 'It used to count anyone who <em>left</em> a stage as having got through it, so a rejection counted like a promotion. It now counts only people who reached a later stage. Lower numbers are the correction, and figures from before 30 Aug 2026 are not comparable.'],
      ['The columns are not a funnel — do not read them left to right', 'Each stage is measured on its own. One column’s <em>progressed</em> will not equal the next column’s <em>assessed</em>, and often will not come close. Three reasons, all real: candidates skip stages (most roles never use Hello Christy or HM Review), <em>progressed</em> means reaching <em>any</em> later stage rather than the next one, and each figure is dated by when the assessment happened — so somebody screened in June and interviewed in July lands in two different quarters. Compare a stage to itself over time, not to its neighbour.'],
      ['Offer shows a count and no rate', 'Offer is the last stage in the ladder, so there is nothing after it to progress to. Showing 0% there would read as everyone falling out at the final step. The number of people assessed at Offer is still shown.'],
      ['Online Assessment carries small numbers', 'Used, but thinly: 182 candidates in total (Q1 159, Q2 75, Q3 83 reached it). Treat a single role’s OA conversion as indicative, not solid.'],
    ]
  },

  'eff-tis': {
    summary: 'How these numbers are worked out',
    intro: 'How long each step actually takes, <strong>Department → Job</strong>. Every cell holds two things: the <strong>median days for candidates who finished the stage</strong>, and underneath in amber, <strong>how many are still sitting there</strong> and how long they have waited.',
    confirmed: 'Definitions confirmed with Jerin · 30 Aug 2026',
    groups: [
      {
        heading: 'Reading it',
        items: [
          ['The number on top', 'Median days for candidates who <strong>left</strong> the stage — how long that step actually took. This is the only figure on the table you can compare between quarters. Hover a cell for the average and how many candidates it is based on.'],
          ['The two amber lines below', 'The people <strong>still sitting</strong> in that stage: how many, and on the second line the median days they have waited so far. Their clock is still running, so read it as a backlog to clear, not as how long the step takes.'],
          ['A dash instead of a number', 'Nobody has finished that stage in the selected period. If there is an amber figure under it, everyone who arrived is still there.'],
          ['Red', 'Median above 5 days. Colour only — nothing is filtered out.'],
          ['Rows', 'Department → Job. Click a department to drill into its roles.'],
          ['Hello Christy', 'The bot route into screening — an alternative to TA Screen, not a step before it. Low volume, so its column is often empty.'],
          ['TA Screen → Offer', 'From real stage history — entered the stage to left the stage — for candidates who <strong>arrived</strong> during the selected period.'],
          ['App Review <span class="defs-tag">live</span>', 'Entirely a waiting pile: everyone <strong>currently sitting</strong> in App Review, measured as today minus their application date. Nobody in it has finished, so it always shows a dash over an amber figure, and it cannot be split by quarter. Marked with an orange asterisk.'],
        ]
      },
    ],
    warnings: [
      ['Why the two figures are kept apart', 'Pooled into one median the number measured the calendar, not the process: anyone who never left the stage counted as \u201ctoday minus the day they applied\u201d, so an older quarter always read higher just for being older.'],
      ['One column is not on the same clock as the others', 'App Review is live; every other stage follows the period. Do not read across a row as one candidate’s journey.'],
    ]
  },

  'eff-joining': {
    summary: 'How these numbers are worked out',
    intro: 'Everyone who reached an offer, by department, and what became of them. <strong>Offered = Joined + Joining Pending + Dropped</strong>, so the row always closes.',
    confirmed: 'Definitions confirmed with Jerin \u00b7 29 Aug 2026',
    groups: [
      {
        heading: 'The columns',
        items: [
          ['Offered', 'Joined + Joining Pending + Dropped \u2014 everyone who got as far as an offer.'],
          ['Joined', 'People whose <strong>start date</strong> falls in the quarter, minus anyone whose offer is linked to an <strong>earlier quarter\u2019s opening</strong>.'],
          ['Joining Pending', 'Everyone in <em>Ref Check</em>, <em>Documentation</em> or <em>Offer</em>, minus earlier-quarter openings. The same rule the Hiring Manager Positions card uses.'],
          ['Dropped', 'Reached Ref Check, Documentation or Offer and was then archived. The same list HM and the Recruiter tab use.'],
          ['Joining Conversion', '(Joined + Joining Pending) \u00f7 Offered \u2014 the share of everyone who reached an offer who has <strong>not</strong> fallen out.'],
          ['Chart', 'One bar per department, stacking Joined, Joining Pending and Dropped, with <strong>Offered</strong> at the end of the bar and the <strong>Joining conversion</strong> in its own labelled column down the right-hand edge. Each section is split into the <strong>roles</strong> behind it &mdash; hover one to list them.'],
        ]
      },
    ],
    warnings: [
      ['This measures drop-out, not joining', 'Joined and Joining Pending sit on <em>both</em> sides of the fraction, so they cancel: the figure is arithmetically <strong>1 \u2212 Dropped \u00f7 Offered</strong>. That is the intended question \u2014 <em>who have we lost?</em>'],
      ['Joining Pending is live; its neighbours are quarterly', 'It shows who is in closing <strong>today</strong>, so the same people sit inside every quarter\u2019s Offered \u2014 kept that way so the column matches the HM Positions card.'],
      ['One deliberate difference from the Recruiter tab', 'There, the <em>Sales</em> pod\u2019s Joined takes no earlier-quarter subtraction. Sales is a pod, and pods do not exist on this tab, so the subtraction is applied to every department here.'],
    ]
  },
  'eff-sourcing': {
    summary: 'How these numbers are worked out',
    intro: 'Where the people who actually <strong>joined</strong> came from, <strong>Department → Job → Source type → Source</strong>.',
    confirmed: 'Definitions confirmed with Jerin · 29 Aug 2026',
    groups: [
      {
        heading: 'Reading it',
        items: [
          ['Joiners', 'People who accepted an offer for that role and whose <strong>start date</strong> falls in the selected quarter, counted against the source on their application.'],
          ['%', 'Share of the level above — a source’s share of its type, a type’s share of the role, and so on.'],
          ['(source not recorded)', 'A joiner whose application carries no source. They are kept here rather than dropped, so the panel still adds up to the number of joiners. About 1 in 20 today.'],
          ['Chart', 'One bar per source type, split into the individual sources inside it. It reads the same rows as the table, so the two can never disagree.'],
        ]
      },
    ],
    warnings: [
      ['This counts joiners, not applications', 'Deliberate (Jerin, 29 Aug 2026): a channel can bring tens of thousands of applications and produce almost no one who starts. Company marketing brought 25,810 applications in 2026 and 2 joiners; Job Portal brought far fewer and 44.'],
      ['Counted by START DATE, like Joined everywhere else', 'Someone who accepted in June and starts in September counts in Q3, not Q2 — the same rule the Fulfilment tab uses, so the two panels count the same people.'],
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

  'admin-metric': {
    summary: 'How these numbers are worked out',
    intro: 'The scoring and capacity model behind <strong>Recruiter Efficiency</strong> and <strong>Overall Efficiency</strong>. Everything here is stored <strong>per quarter</strong> and copies forward until someone changes it.',
    confirmed: 'Definitions confirmed with Jerin \u00b7 30 Aug 2026',
    groups: [
      {
        heading: 'Reading it',
        items: [
          ['A role\u2019s Score', '<strong>Family + Level + Complexity</strong> \u2192 the grid \u2192 points. Level and Complexity come from the job in Ashby; Family is derived from the department and job title.'],
          ['Pod', 'Groups recruiters on the Recruiter Efficiency tab. \u26a0 A recruiter with <strong>no pod for the selected quarter is excluded from every row and total</strong> on that tab \u2014 they are listed under Data Hygiene \u2192 Pod Not Set.'],
          ['Capacity', 'A Score, not a headcount \u2014 the ideal Fulfilment target for that recruiter in that quarter.'],
          ['Status', '<strong>Read from the Ashby seat, not editable here.</strong> Active means the person holds an elevated recruiter seat. Remove the seat in Ashby and they show as Inactive at the next refresh; their past offers and hires still score.'],
          ['Per quarter, copy-forward', 'A quarter with no explicit setting inherits the nearest earlier one. Editing a quarter only changes that quarter.'],
        ]
      },
    ],
    warnings: [
      ['Edits are local until you publish', 'Changes apply in <strong>this browser</strong> immediately, and to nobody else. <strong>Publish to team</strong> writes the shared config everyone sees. The amber line above the buttons tells you when you have unpublished changes.'],
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
