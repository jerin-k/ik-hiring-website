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
    confirmed: 'Definitions confirmed with Jerin · 24 Aug 2026 · Joined = someone moved to Hired into the position 14 Sep 2026 · From / To narrows every panel to the day (#129) 15 Sep 2026 \u00b7 Pipeline hides From / To (#141d) 17 Sep 2026',
    groups: [
      {
        heading: 'The six cards at the top',
        items: [
          ['Total Positions', 'How many <strong>positions</strong> were opened in the period you have selected — on a day between the <strong>From</strong> and <strong>To</strong> dates. Each opening counts once, in the quarter it was opened — so a role opened in Q2 keeps counting toward Q2 for as long as it stays open. Positions marked <em>On Hold</em> or <em>Shelved</em>, and positions with no opening date recorded in Ashby, are left out.'],
          ['Joined', 'Positions from that set that someone has been <strong>moved to Hired</strong> into \u2014 Ashby then marks the opening <em>Filled</em>.'],
          ['Open', 'Positions from that set still to fill.'],
          ['Missed', 'Positions closed with the reason <em>carry forward</em> — the hire did not happen in that quarter and moved to the next one.'],
          ['Joining Pending', 'Counts <strong>people</strong>, not positions: everyone sitting in <em>Ref Check</em>, <em>Documentation</em> or <em>Offer</em> right now, minus anyone whose opening was raised in a quarter before the period you picked. It is a <strong>live</strong> figure: it shows who is in closing today, and the period only decides which openings count as earlier.'],
          ['Dropped', 'Someone who reached <em>Ref Check</em>, <em>Documentation</em> or <em>Offer</em> and was then <strong>archived</strong> \u2014 declined, withdrew, or closed with the offer still open. Counted on the day they first got there, <strong>once</strong> per person, when that day is between the <strong>From</strong> and <strong>To</strong> dates. The small print is its share of outcomes: Dropped \u00f7 (Joined + Joining Pending + Dropped).'],
        ]
      },
      {
        heading: 'The filters at the top',
        items: [
          ['Department and Job', 'Narrow every panel on this tab to the chosen department and roles.'],
          ['From / To, Year and Quarter', 'The period. Year and Quarter fill in the From and To dates; you can also pick your own dates, but only <strong>inside the selected Year/Quarter period</strong> — any other day is greyed out, and a date typed outside it snaps back to the nearest edge. Every panel follows the dates <strong>to the day</strong>: positions count when they were opened on a day inside From–To, drops when the person first reached Ref Check, Documentation or Offer on one, and Throughput and Panelists count what happened on those days. <strong>Joining Pending</strong> and the <strong>Pipeline</strong> counts stay live; on the <strong>Joining Pending</strong> sub-tab these boxes give way to DOJ Month, DOJ From and DOJ To, and on the <strong>Pipeline</strong> sub-tab From and To are hidden, since they would change nothing there. Which roles are listed follows the quarters the dates touch. With Year and Quarter both on <em>All</em>, the dates run from 1 July 2026 to the end of the current quarter. <strong>Nothing before Q3 2026 is offered</strong>, because nothing earlier was cleaned up; a new quarter appears on its first day.'],
        ]
      },
      {
        heading: 'Department Summary — the columns',
        items: [
          ['Department', "Ashby's top-level department. Click the row to open the individual roles inside it."],
          ['Total openings', 'Positions opened in the period, as above.'],
          ['Joined', 'Positions someone has been moved to Hired into (Ashby marks the opening <em>Filled</em>).'],
          ['Joining pending', 'People currently in Ref Check, Documentation or Offer — same rule as the card.'],
          ['Dropped', 'As above — reached Ref Check, Documentation or Offer, then archived — with their share of all outcomes underneath.'],
          ['Delta', 'Total Openings \u2212 Joined \u2212 Joining Pending. <strong>It can go negative, and that is allowed</strong> \u2014 it means more people are in closing than positions recorded, which happens when an offer was never linked to an opening. It shrinks as those links get fixed.'],
          ['Missed', 'Positions carried forward to the next quarter.'],
          ['Who is joining', 'The people behind the <strong>Joining Pending</strong> number on the same row, with the date they are due to start and the stage they are at. It is counted the same way, so the names always add up to that number. Like it, the list is <strong>live</strong> — the From and To dates do not change it. Long lists collapse; <em>+N more</em> opens them.'],
          ['Remarks', 'A note your team writes against the <strong>role</strong>, not a candidate — it stays until somebody edits it, and everybody sees the same note. Anyone who can open this tab can write one. 🚨 It is saved to a file that <strong>anyone with the link can read</strong>, so it must never hold candidate names, salaries, phone numbers or email addresses; an email address or a long number is refused. Saving opens a small window that signs you in and closes itself; a note normally lands in about five seconds. It is signed by the Google account this <strong>browser</strong> is signed into, which is not always the account you signed into the dashboard with — if the two differ the dashboard tells you as you save, so a remark never quietly carries the wrong name. Amber means the note is in your browser only and the server has not confirmed it yet — it clears itself next time you open the page, once the saved copy agrees.'],
        ]
      },
      {
        heading: 'The chart',
        items: [
          ['One bar per department', 'Bar length is the positions opened in the period, split into <strong>Joined</strong>, <strong>Open</strong> and <strong>Missed</strong> \u2014 the three states every position is in, so they add up to Total Openings. Each section is split into the <strong>roles</strong> behind it &mdash; hover one to list them.'],
          ['Why Joining Pending and Dropped are not on it', 'Those two count people. Stacking them onto a bar made of positions would produce a total that means nothing.'],
        ]
      },
    ],
    warnings: [
      ['Positions and people are different units', 'Total Openings, Open and Missed count <strong>positions</strong>. Joining Pending and Dropped count <strong>people</strong>. One position can have several people in closing against it, so never read across the row as if it were one running total.'],
      ['Drop does not need an offer', 'Someone archived out of Ref Check or Documentation counts as a drop even if no offer was ever raised for them.'],
      ['Joining Pending is live', 'It always shows who is in closing today; the period you pick only decides which openings count as earlier-quarter ones. Everything else on Position Fulfilment follows the period. The people behind it are listed on the <strong>Joining Pending</strong> sub-tab.'],
      ['A role only appears if it belongs here', 'It shows up when it had an opening in the period, or when someone is in closing on it. Roles with neither are not this period’s work and are left out.'],
    ]
  },

  'hm-joiningpending': {
    summary: 'How this list is worked out',
    intro: 'One row per person currently in <em>Ref Check</em>, <em>Documentation</em> or <em>Offer</em> — the people behind the Joining Pending card on <strong>Position Fulfilment</strong>. It is a <strong>live</strong> list: it shows who is in closing today, so on this sub-tab <strong>Year</strong>, <strong>Quarter</strong>, <strong>From</strong> and <strong>To</strong> give way to <strong>DOJ Month</strong>, <strong>DOJ From</strong> and <strong>DOJ To</strong>. The <strong>Department</strong> and <strong>Job</strong> filters narrow it too.',
    confirmed: 'Definitions confirmed with Jerin · 24 Aug 2026 · on its own sub-tab (#130) 15 Sep 2026 · the opening Ashby shows them tied to (#132) 15 Sep 2026 · DOJ boxes replace the period boxes (#133) 15 Sep 2026 · badges and date labels (#137) 15 Sep 2026',
    groups: [
      {
        heading: 'The columns',
        items: [
          ['Opening Quarter', 'The quarter of the opening they are tied to in Ashby: the one named on their offer or, when there is none, the opening Ashby’s Openings screen shows them against. A peach label marks an opening from a quarter before the one we are in. It reads <em>Not linked</em> when neither exists — offers in that state are listed in <strong>Recruiter Efficiency → Data Hygiene → Offers Missing Opening Link</strong>.'],
          ['Month and DOJ', 'The candidate’s date of joining, and its month. Under the date: how far away it is — in rose once the date has passed and they are still not moved to Hired. <em>Not set</em> when there is no DOJ yet.'],
          ['Sub-Stage', 'Which of Ref Check, Documentation or Offer they are in now. The badge fills in one step at a time — Ref Check, Documentation, Offer Created, Offer Sent, Offer Accepted — so it darkens as they get closer to joining.'],
          ['Department, Job, Candidate, Recruiter', 'The role, the person, and the Recruiter on their hiring team in Ashby, with their initials in their pod’s colour. <em>No recruiter</em> means none is tagged in Ashby.'],
          ['DOJ Month, DOJ From and DOJ To', 'In the filter row, on this sub-tab only, in place of Year, Quarter, From and To. They narrow the list by <strong>date of joining</strong>: pick a month, a range, or both, and either end of the range can be left empty. Anyone with <strong>no DOJ yet</strong> drops out while any of them is set; with all three empty, everyone in closing is listed.'],
        ]
      },
    ],
    warnings: [
      ['Slightly longer than the Joining Pending card', 'The same people as the card on Position Fulfilment, without its subtraction: the card leaves out anyone whose opening was raised in a quarter before the period you picked. This list shows everyone, so nobody is lost.'],
    ]
  },

  'hm-joiners': {
    summary: 'How this list is worked out',
    intro: 'One row per <strong>person</strong> who joined: moved to the <em>Hired</em> stage — an accepted offer alone does not count — with a <strong>start date</strong> between the <strong>From</strong> and <strong>To</strong> dates, most recent first. The <strong>Department</strong> and <strong>Job</strong> filters narrow it.',
    confirmed: 'Added with Jerin · 15 Sep 2026 (#130) · the opening read from the hire (#131) 15 Sep 2026 · badges and date labels (#137) 15 Sep 2026',
    groups: [
      {
        heading: 'The columns',
        items: [
          ['Opening Quarter', 'The quarter of the opening they were <strong>hired into</strong>: the one named on their offer or, when the offer names none, the one picked when they were moved to Hired, read from Ashby’s Openings screen. A peach label marks an opening from a quarter before the one they started in. It reads <em>Not linked</em> only when neither is known.'],
          ['Month and DOJ', 'The day they started (their date of joining), with its weekday under it, and its month.'],
          ['Department, Job, Candidate, Recruiter', 'The role, the person, and the Recruiter on their hiring team in Ashby, with their initials in their pod’s colour for the quarter they started in. <em>No recruiter</em> means none is tagged in Ashby.'],
        ]
      },
    ],
    warnings: [
      ['Not the same number as Joined on Position Fulfilment', 'That column counts <strong>positions</strong> filled, in the quarter each opening was opened. This list counts <strong>people</strong>, on the day they started. Someone who starts now on a position opened in an earlier quarter is listed here, but counts in that earlier quarter’s Joined. Both are right.'],
      ['Everyone who joined is listed', 'Including people filling a position opened in an earlier quarter — the <strong>Opening Quarter</strong> column shows who they are. There is no Sub-Stage column, because Hired is a single stage.'],
    ]
  },

  'hm-throughput': {
    summary: 'How these numbers are worked out',
    intro: 'Of the people <strong>assessed</strong> at a stage, how many <strong>progressed</strong> to a later one. Built from real events in Ashby — interviews held, assignments triggered, feedback submitted — not from a snapshot of where people sit today.',
    confirmed: 'Definition rebuilt with Jerin \u00b7 30 Aug 2026 \u00b7 one section, departments open into job rows (#122) 15 Sep 2026 \u00b7 department rows on a slate band, job squares soft apricot (#136) 15 Sep 2026 \u00b7 only jobs with an opening opened in the period (#125) 15 Sep 2026 \u00b7 From / To narrows it to the day (#129) 15 Sep 2026',
    groups: [
      {
        heading: 'Reading the squares',
        items: [
          ['One column per stage', 'Each cell reads <strong>assessed → progressed</strong>, with the throughput percentage below it. <strong>Assessed</strong> means seen at that stage during the period — an interview actually held there, an assignment triggered there, or a feedback form (a select or reject) where no interview exists. <strong>Progressed</strong> means they then reached a <em>later</em> stage. <strong>Ref Check, Documentation and Offer are counted differently</strong>: nobody is assessed at an administrative stage, so those three count the candidates <strong>added</strong> to the stage \u2014 the day they entered it. For Offer, progressed means they went on to be <strong>hired</strong>.'],
          ['Rows', 'Each department is a row. Click it, or its arrow, to open the <strong>jobs</strong> inside it, listed underneath. <em>Expand all</em> opens every department, and a department opens by itself when it is the only one showing. With more than one department, <strong>Total</strong> is the last row.'],
          ['Which jobs are listed', 'Only jobs with an <strong>opening opened in a quarter the From and To dates touch</strong> \u2014 the team does not work jobs whose opening was opened in an earlier quarter \u2014 the same rule the Pipeline tab uses. The squares themselves count only what happened <strong>between the two dates</strong>: an assessment on a day inside them, and for Ref Check, Documentation and Offer a candidate added on one. An opening with no opened date does not count; those are listed in <strong>Recruiter Efficiency \u2192 Data Hygiene \u2192 Openings Missing Opened Date</strong>, and Open jobs worked without an opening in <strong>Jobs Recruiting Without an Opening</strong>.'],
          ['What the colour means', 'The shade is <strong>how many people that square lost</strong> \u2014 assessed there, then never reached a later stage \u2014 on five steps from the palest (0\u20139) to the darkest (100 or more). <strong>Department</strong> and <strong>Total</strong> squares are blue, and each department row sits on a darker band; <strong>job</strong> squares use the same five steps in a lighter <strong>apricot</strong>, so a job reads as a job at a glance. The number in the square is still the rate: colour ranks what to fix, the number tells you the rate.'],
          ['R1/OA \u2192 late', 'One span per candidate: assessed at <strong>R1 or Online Assessment</strong>, whichever came first, through to <strong>Ref Check, Documentation or Offer</strong>, whichever they reached first. It is counted per person, never one stage column divided by another — see the warning below.'],
          ['A dot', 'A dot means <strong>nobody was assessed</strong> at that stage in the period — several stages here carry very little traffic, and plenty of roles skip a round entirely. It is not a zero rate, and it is not missing data.'],
          ['Hover', 'Hover a square for its counts, its rate and how many people it lost.'],
          ['Stages and Hide zero-pipeline', 'The <strong>Stages</strong> dropdown chooses which stage columns appear \u2014 with nothing picked, every stage shows. <em>Hide zero-pipeline</em> drops jobs with no movement at all in the period.'],
        ]
      },
    ],
    warnings: [
      ['Rejections do not count as progress', 'Only people who reached a later stage count as progressed. Someone rejected or withdrawn at a stage counts as assessed there and not progressed.'],
      ['The columns are not a funnel — do not read them left to right', 'Each stage is measured on its own. One column’s <em>progressed</em> will not equal the next column’s <em>assessed</em>, and often will not come close. Three reasons, all real: candidates skip stages (most roles never use Hello Christy or HM Review), <em>progressed</em> means reaching <em>any</em> later stage rather than the next one, and each figure is dated by when the assessment happened — so somebody screened in June and interviewed in July lands in two different quarters. Compare a stage to itself over time, not to its neighbour.'],
      ['A role with no movement reads empty, not its history', 'If a role had no activity in the selected period it shows dots rather than its all-time numbers. That includes a period with no stage history at all, such as a quarter that has not started.'],
      ['Not the same as the Pipeline tab', 'This counts movement <em>during</em> a period. Pipeline counts people <em>sitting</em> somewhere today. The two will never tie out, and are not meant to.'],
    ]
  },

  'hm-pipeline': {
    summary: 'How these numbers are worked out',
    intro: 'This is a <strong>live snapshot</strong>: where candidates stand right now. It is the one table on this page whose numbers the period does not change, so From and To are hidden on this sub-tab. Shading: a deeper teal behind a number means more people, compared within that stage’s column (departments with departments, jobs with jobs); zeros stay grey.',
    confirmed: 'Definitions confirmed with Jerin · 24 Aug 2026 \u00b7 shading (#137c) 15 Sep 2026 \u00b7 From / To hidden here (#141d) 17 Sep 2026',
    groups: [
      {
        heading: 'Reading the table',
        items: [
          ['The numbers', 'How many candidates are in that stage <strong>today</strong>; archived candidates are left out. <strong>Hired</strong> is everyone hired on the role so far, because a hired candidate stays at Hired.'],
          ['Total', 'Every application on the role, archived ones included — so it is bigger than the stage columns added up.'],
          ['What Year and Quarter do', 'They decide <strong>which roles are listed</strong> — only those with an opening in the selected period — so department and total rows change with it. With Year and Quarter both on <em>All</em>, the period starts on 1 July 2026. Each role’s own counts do not.'],
          ['Rows', 'Department, then the roles inside it. Click to open.'],
          ['Stages and Hide zero-pipeline', 'The <strong>Stages</strong> dropdown chooses which stage columns appear; with nothing picked every stage shows, the same as on Throughput. <em>Hide zero-pipeline</em> drops roles with nobody in the stages shown.'],
        ]
      },
    ],
    warnings: [
      ['Do not add it to the Throughput numbers', 'Throughput counts movement during a period; this one counts people standing still today. Different questions, different totals.'],
      ['Online Assessment is thin, not empty', 'It is genuinely used, but its volumes are small next to App Review and R1, so read a single role’s OA numbers with care.'],
    ]
  },

  'rec-fulfilment': {
    summary: 'How these numbers are worked out',
    intro: 'Three tables, same shape. <strong>Non-Sales</strong> is measured on <strong>Joined + Joining Pending</strong>; <strong>Sales</strong> and <strong>Others</strong> on <strong>Joined</strong>. Everything follows the Year/Quarter selector at the top, and the <strong>From</strong> and <strong>To</strong> dates inside that quarter narrow it to the day \u2014 only Joining Pending stays live. There is no <em>All</em> on this tab: goals, pods and capacity belong to a quarter, and people move between Sales and Non-Sales, so quarters are never added together. The <strong>Job</strong> filter narrows every number to the chosen jobs. While it is on, or your access is limited to certain departments, <strong>Capacity</strong> and <strong>Capacity Utilisation</strong> read a dash.',
    confirmed: 'Definitions confirmed with Jerin · 24 Aug 2026 · no Quarter: All on this tab 15 Sep 2026 · Goal basis updated 6 Sep 2026 · Joined split on Sales and Others added 7 Sep 2026 · recruiter/sourcer credit rule replaced and the +N sourced line added 13 Sep 2026 · Goal counts filled openings and leaves out archived ones 14 Sep 2026 · the Job filter narrows every number, and Capacity reads a dash while it does, 14 Sep 2026 · JP \u2014 Prev Qtr Openings takes any earlier quarter 15 Sep 2026 \u00b7 From / To narrows every column to the day and scales Capacity by days (#129) 15 Sep 2026',
    groups: [
      {
        heading: 'The two number types in every column',
        items: [
          ['HC', 'Headcount — a count of people (or of positions, for Goal). It always counts on the <strong>recruiter’s</strong> row. Anything a person <strong>sourced</strong> for someone else shows as a small <strong>+N sourced</strong> line underneath instead, so the main figure still adds up to the real number of people.'],
          ['Score', 'The same thing weighted by how hard the role is: each role scores points from its Family, Level and Complexity, set in <strong>Admin → Scoring</strong>. A senior niche hire is worth many times a vanilla one. <strong>Where a candidate has a Sourcer, the points for Joined, Joining Pending and Drop are shared half and half</strong> — see <em>How credit is shared with a Sourcer</em> below. The Goal is never shared.'],
        ]
      },
      {
        heading: 'The columns',
        items: [
          ['Goal', 'The <strong>openings you own</strong> that were opened in the selected quarter, on a day between the <strong>From</strong> and <strong>To</strong> dates \u2014 the positions where you are the <strong>Recruiter on the opening</strong> in Ashby, not every role you have ever touched. Each opening scores from its role’s Family, Level and Complexity. <strong>The Goal is never shared</strong>: even where an opening also has a Sourcer, the recruiter keeps its full points. Openings a person is tagged on as <strong>Sourcer</strong> show underneath as <strong>+N sourced</strong>, with no points attached. Openings still open, already filled or carried forward all count; <strong>archived</strong> openings do not.'],
          ['Capacity', 'What this recruiter is expected to carry in the quarter, as a <strong>Score</strong>, set by hand in <strong>Admin → Pod &amp; Capacity</strong>. It reads 0 until somebody sets it. When the From and To dates cover only part of the quarter, Capacity is <strong>that share of it by days</strong> \u2014 1 to 31 August is 31 of Q3\u2019s 92 days. It is not the Goal — the Goal comes from the openings the recruiter owns. Role rows show a dash, because capacity is set per recruiter — and every row does while the <strong>Job</strong> filter or a department restriction narrows the numbers, because capacity cannot be split by job or department.'],
          ['Joined', 'Candidates <strong>moved to the Hired stage</strong>, dated by their <strong>start date</strong>, from the individual offer records — an accepted offer alone is not counted. On <strong>Non-Sales</strong> it also excludes anyone linked — by their offer, or by the opening they were hired into — to an <strong>earlier quarter\u2019s opening</strong> — last quarter\u2019s work landing now. <strong>Sales and Others take no such subtraction</strong>, deliberately: their goal is joiners whenever the opening was raised. On <strong>Sales</strong> and <strong>Others</strong> this appears as <strong>Joined Total</strong>, split across the two columns beside it.'],
          ['Joined — Prev Qtr Openings <span class="defs-tag">Sales · Others</span>', 'Of the people who joined this quarter, those filling an opening raised in an <strong>earlier</strong> quarter — carried-over demand finally landing. Needs an opening link: the one on the offer or, when the offer names none, the opening they were hired into.'],
          ['Joined — Current Qtr Openings <span class="defs-tag">Sales · Others</span>', 'Everyone else who joined — <strong>Joined Total minus the column beside it</strong>, so the two always add up. Because it is a subtraction it also holds <strong>every joiner with no known opening</strong> (none on the offer, and none found on the hire); that count is printed under the number as <em>unlinked</em>. So this column means <em>“not known to be earlier”</em>, not <em>“raised this quarter”</em>.'],
          ['JP Total', 'Always <strong>exactly the two columns beside it added together</strong> — never counted separately. On <strong>Sales</strong> and <strong>Others</strong> that is everyone currently in Ref Check, Documentation or Offer. On <strong>Non-Sales</strong> it leaves out anyone on an earlier quarter’s opening, and anyone joining next quarter on an opening that is not this quarter’s.'],
          ['JP — Current Qtr <span class="defs-tag">Non-Sales</span>', 'Everyone in closing, minus anyone on an earlier quarter’s opening, minus anyone joining next quarter.'],
          ['JP — Upcoming Qtr <span class="defs-tag">Non-Sales</span>', 'Their opening was raised this quarter but they join next quarter. Needs the offer to carry an opening link.'],
          ['JP — Prev Qtr Openings <span class="defs-tag">Sales · Others</span>', 'People in Joining Pending whose opening was raised in an <strong>earlier</strong> quarter, whatever their joining date — earlier work still landing. The same test as <em>Joined — Prev Qtr Openings</em>. Needs the offer to carry an opening link.'],
          ['JP — Current Qtr Openings <span class="defs-tag">Sales · Others</span>', 'Everyone else in closing.'],
          ['Drop', 'Someone who reached <em>Ref Check</em>, <em>Documentation</em> or <em>Offer</em> and was then <strong>archived</strong> \u2014 declined, withdrew, or closed with the offer still open. Counted on the day they first got there, <strong>once</strong> per person, when that day is between the <strong>From</strong> and <strong>To</strong> dates. The small print is Drop \u00f7 (Joined + JP + Drop).'],
          ['Delta', 'Goal minus what was achieved (Joined + Joining Pending on Non-Sales, Joined on Sales and Others), so it is the shortfall. Never shown below zero. On the Score side the bar fills with the shortfall, and the line under it reads how much of the Goal is covered — for example <em>40 of 50 · 80%</em>, <em>goal met</em>, or <em>no goal set</em>. The <strong>+N sourced</strong> line underneath is the same sum for what the person sourced: the openings they are tagged on as Sourcer, minus the sourced people counted as achieved — also never below zero.'],
          ['Capacity Utilisation', 'Achieved ÷ Capacity, both as Score; a dash when no capacity is set, and while the <strong>Job</strong> filter or a department restriction narrows the numbers — part of someone’s work set against all of their capacity would read falsely low. <strong>The colour runs the opposite way to Delta on purpose</strong>: over 100% is over-delivery and reads well, under 70% is under-use and is the thing worth acting on.'],
        ]
      },
      {
        heading: 'How credit is shared with a Sourcer',
        items: [
          ['The short version', 'If somebody is tagged as the <strong>Sourcer</strong> on a candidate, the points for <strong>Joined</strong>, <strong>Joining Pending</strong> and <strong>Drop</strong> are split <strong>half and half</strong> with the recruiter. It is the same in every department, whoever the sourcer is.'],
          ['No sourcer tagged', 'The recruiter keeps the full score. This is the normal case today.'],
          ['The Goal is never split', 'The recruiter keeps the <strong>full Goal</strong> even when an opening has a Sourcer, while what they achieve on a sourced role is half — so a shared role leaves a shortfall the recruiter closes by landing more people. A sourcer earns <strong>no Goal points</strong> \u2014 with one exception: an opening that has a Sourcer but <strong>no Recruiter</strong> gives its Goal to the sourcer, so its points are not lost.'],
          ['The headcount always stays with the recruiter', 'Only the <strong>Score</strong> divides. The <strong>HC</strong> — the person — always counts on the <strong>recruiter’s</strong> row, so every HC column adds up to the real number of people.'],
          ['+N sourced', 'The small line under <strong>Goal</strong>, <strong>Joined</strong>, <strong>Joining Pending</strong>, <strong>Drop</strong> and <strong>Delta</strong> counts what that person <strong>sourced for someone else</strong>. It is never added to the figure above it. An agency’s billing count reads from here.'],
          ['Why the Goal and Joined lines can disagree', 'They come from two different tags in Ashby. Under <strong>Goal</strong> and <strong>Delta</strong> it is the Sourcer on the <strong>opening</strong> — who was briefed on the position. Under <strong>Joined</strong>, <strong>Joining Pending</strong> and <strong>Drop</strong> it is the Sourcer on the <strong>candidate</strong> — who actually found the person. Someone can be tagged on openings and not have delivered anyone yet, or find people for openings they were never tagged on. Both are correct.'],
          ['Same person as Recruiter and Sourcer', 'They get the full score and one head, and no +N sourced line for their own work.'],
          ['Agency, freelancer or internal makes no difference', 'Everyone follows the same rule, as recruiter or as sourcer. The <strong>Agency</strong> / <strong>Freelancer</strong> / <strong>Internal</strong> setting in <strong>Admin → Pod &amp; Capacity</strong> is kept as a label only.'],
          ['Agencies and freelancers appear under <span class="defs-tag">Others</span>', 'They join the list the moment they own an opening, are tagged as Sourcer on one, or have a joiner attributed to them, and sit in <strong>Others</strong> until a pod is set for them in <strong>Admin → Pod &amp; Capacity</strong>. Without that their share of the credit would leave the recruiter and show up nowhere.'],
          ['Where the source of the candidate comes into it', '<strong>It does not.</strong> Whether someone came from an agency, a job board or a referral has <strong>no effect on the score</strong>. Only the tagged Sourcer moves credit.'],
          ['Nothing is created or lost', 'On Joined, Joining Pending and Drop the two halves always add back to the whole — whatever leaves the recruiter turns up on the sourcer’s row. The Goal is not shared, so each opening is counted once, on its recruiter.'],
        ]
      },
      {
        heading: 'The chart',
        items: [
          ['Chart', 'One bar per recruiter \u2014 the bar is what they <strong>achieved</strong>. A solid line marks their <strong>Goal</strong>, a dashed line their <strong>Capacity</strong> (not drawn while the Job filter or a department restriction narrows the numbers), and a pale band labelled <em>Short of Goal</em> fills any shortfall. Everything is in Score. Same figures as the table. Each section is split into the <strong>roles</strong> behind it &mdash; hover one to list them. <em>Short of Goal</em> is not split \u2014 it belongs to no single role. The bar is always exactly the table\u2019s Achieved: any credit that no role row under the recruiter carries shows as its own band, <em>credit not tied to a listed role</em>. Hovering a bar shows the Goal.'],
        ]
      },
    ],
    warnings: [
      ['Position Fulfilment — Others', 'A third table for recruiters in the <strong>Others</strong> pod — people who work across pods rather than inside one. It uses the <strong>Sales counting rule</strong>: joiners count regardless of which quarter raised the opening, because that work is billed per joiner. Nobody appears in more than one table, so no total or chart double-counts.'],
          ['Recruiters with no pod set are left out entirely', 'Out of every row, total and chart on this tab. Their numbers are in <strong>Data Hygiene → Pod Not Set</strong>. Someone who genuinely works across pods should be given the <strong>Others</strong> pod, which appears here like any other.'],
      ['Drop does not need an offer', 'Someone archived out of Ref Check or Documentation counts as a drop even if no offer was ever raised for them.'],
      ['Recruiters who weren\u2019t here this quarter are left out', 'A recruiter counts from their <strong>Started on</strong> date to their <strong>Left on</strong> date, set in <strong>Admin \u2192 Pod &amp; Capacity</strong> \u2014 someone who left mid-quarter still counts for that quarter. Until a recruiter\u2019s dates are entered, a disabled Ashby account decides. Anyone not here is out of every row, total and chart on this tab for that quarter. People in closing who are still tagged to them are listed under <em>No recruiter in this view</em> on the <strong>Joining Pending</strong> sub-tab.'],
      ['Joining Pending here is lower than on the Hiring Manager tab', 'These tables count a person only when their <strong>Recruiter has a row on this tab</strong>. Anyone with <strong>no Recruiter tagged</strong> in Ashby, or tagged to a recruiter who was <strong>not here this quarter</strong>, is left out, so the Joining Pending total here is lower than the Hiring Manager card. Nobody is lost: the <strong>Joining Pending</strong> sub-tab lists them all under <em>No recruiter in this view</em>, with the count on that group and the reason beside each name, and everyone with no Recruiter tagged is also on <strong>Data Hygiene \u2192 Unassigned</strong>.'],
      ['Openings with more than one owner are split', 'When two or more recruiters sit as <em>Recruiter</em> on the same opening in Ashby, the opening and its score are <strong>divided equally</strong> between them. This is the only place a Goal shows a decimal. There is no Data Hygiene list for these yet — the decimal is the sign.'],
      ['Roles that score zero for the quarter', 'They still count in HC but contribute 0 to Score — usually Tech/NonTech roles missing a Level (SME roles score on Complexity alone and PA by title, so neither needs a Level). Score understates the work until the Level is set. The list is in <strong>Data Hygiene → Roles Missing Score Inputs</strong>.'],
    ]
  },

  'rec-joiningpending': {
    summary: 'How this list is worked out',
    intro: 'Every person in closing — <em>Ref Check</em>, <em>Documentation</em> or <em>Offer</em> — one row each, grouped <strong>Pod → Recruiter → Candidate</strong>. A <strong>live</strong> list: each person sits in their recruiter’s pod for the quarter we are in today. On this sub-tab <strong>Year</strong>, <strong>Quarter</strong>, <strong>From</strong> and <strong>To</strong> give way to <strong>DOJ Month</strong>, <strong>DOJ From</strong> and <strong>DOJ To</strong>. The <strong>Pod</strong>, <strong>Recruiter</strong> and <strong>Job</strong> filters narrow it too, and <em>Expand all</em> opens every pod and recruiter.',
    confirmed: 'Definitions confirmed with Jerin · 24 Aug 2026 · on its own sub-tab (#130) 15 Sep 2026 · the opening Ashby shows them tied to (#132) 15 Sep 2026 · DOJ boxes replace the period boxes (#133) 15 Sep 2026 · badges and date labels (#137) 15 Sep 2026',
    groups: [
      {
        heading: 'Reading it',
        items: [
          ['Pod / Recruiter / Candidate', 'Each person sits under their <strong>Recruiter</strong> in Ashby, inside that recruiter’s pod for the quarter we are in today, earliest joining date first. The number tag beside a pod or a recruiter is how many people sit under it, and each recruiter carries their initials in their pod’s colour. Anyone with no recruiter tagged, or whose recruiter this tab does not show, appears in the <em>No recruiter in this view</em> group at the bottom with the reason beside their name — so the list always accounts for everybody.'],
          ['Opening Quarter', 'The quarter of the opening they are tied to in Ashby: the one named on their offer or, when there is none, the opening Ashby’s Openings screen shows them against (<em>Not linked</em> when neither exists). A peach label marks an opening from a quarter before the one we are in.'],
          ['Month and DOJ', 'The joining date, and its month. Under the date: how far away it is — in rose once the date has passed and they are still not moved to Hired. <em>Not set</em> when there is no DOJ yet.'],
          ['Department and Job', 'The role they are joining.'],
          ['Sub-Stage', 'Which of Ref Check, Documentation or Offer they are in now. The badge fills in one step at a time — Ref Check, Documentation, Offer Created, Offer Sent, Offer Accepted — so it darkens as they get closer to joining.'],
          ['DOJ Month, DOJ From and DOJ To', 'In the filter row, on this sub-tab only, in place of Year, Quarter, From and To. They narrow the list by <strong>date of joining</strong>: pick a month, a range, or both, and either end of the range can be left empty. Anyone with <strong>no DOJ yet</strong> drops out while any of them is set; with all three empty, everyone in closing is listed.'],
        ]
      },
    ],
    warnings: [
      ['Longer than JP Total on Position Fulfilment', 'Those tables count a person only against a recruiter with a row there, and Non-Sales also leaves out anyone on an earlier quarter’s opening or joining next quarter. This list shows everyone.'],
    ]
  },

  'rec-joiners': {
    summary: 'How this list is worked out',
    intro: 'Everyone who joined — moved to the <em>Hired</em> stage (an accepted offer alone does not count), with a <strong>start date</strong> between the <strong>From</strong> and <strong>To</strong> dates — one row each, grouped <strong>Pod → Recruiter → Candidate</strong>. The <strong>Pod</strong>, <strong>Recruiter</strong> and <strong>Job</strong> filters narrow it.',
    confirmed: 'Added with Jerin · 15 Sep 2026 (#130) · the opening read from the hire (#131) 15 Sep 2026 · badges and date labels (#137) 15 Sep 2026',
    groups: [
      {
        heading: 'Reading it',
        items: [
          ['Pod / Recruiter / Candidate', 'Each person sits under their <strong>Recruiter</strong> in Ashby, inside that recruiter’s pod for the selected quarter, most recent joining date first. The number tag beside a pod or a recruiter is how many people sit under it, and each recruiter carries their initials in their pod’s colour. Anyone with no recruiter tagged, or whose recruiter this tab does not show, appears in the <em>No recruiter in this view</em> group at the bottom with the reason beside their name — so the list always accounts for everybody.'],
          ['Opening Quarter', 'The quarter of the opening they were <strong>hired into</strong>: the one named on their offer or, when the offer names none, the one picked when they were moved to Hired, read from Ashby’s Openings screen (<em>Not linked</em> only when neither is known). A peach label marks an opening from a quarter before the one they started in.'],
          ['Month and DOJ', 'The day they started, with its weekday under it, and its month.'],
          ['Department and Job', 'The role they joined.'],
        ]
      },
    ],
    warnings: [
      ['Everyone who joined is listed', 'There is no earlier-quarter subtraction, so a recruiter can list more people here than <strong>Joined</strong> on the Position Fulfilment Non-Sales table, which leaves out anyone filling an earlier quarter’s opening — the <strong>Opening Quarter</strong> column shows who. The people under each recruiter are the joiners <strong>Sourcing Mix</strong> counts. There is no Sub-Stage column, because Hired is a single stage.'],
      ['One row per person, under the recruiter', 'Someone with a Sourcer is still listed once, under their Recruiter — the same as the HC columns.'],
    ]
  },

  'rec-momentum': {
    summary: 'How these numbers are worked out',
    intro: 'How many candidates were <strong>added to the top of the funnel</strong> on each day — one row per person, not one per stage. The <strong>Job</strong> filter narrows every number to the chosen jobs. Shading: a deeper teal square means more people added that day, weekends are greyed, a thin line marks each new week, and a small bar beside a recruiter’s total compares it with the others.',
    confirmed: 'Definitions confirmed with Jerin \u00b7 26 Aug 2026 \u00b7 only jobs with an opening opened in the period (#125) 15 Sep 2026 \u00b7 shading (#137c) 15 Sep 2026 \u00b7 every day From → To (#141c) 17 Sep 2026',
    groups: [
      {
        heading: 'What counts as being added',
        items: [
          ['Whichever of these comes first', 'The candidate <strong>enters HM Review</strong>, or an <strong>assessment is triggered</strong> while they are sitting in the Online Assessment stage, or an <strong>R1 interview is booked</strong>. The first of the three is the day they were added.'],
          ['R1 is dated when the interview was BOOKED', 'Not the day it is held \u2014 booking is the piece of work, and the interview itself can be a week later.'],
          ['Counted once per role', 'Once somebody is logged as added, they are not counted again for that role. Moving them on afterwards does not add to the number \u2014 that is the point: this counts <em>people arriving</em>, not steps taken.'],
          ['The count resets each quarter', 'Somebody who arrives again in a later quarter counts again in that quarter. So the quarters do not add up to a year.'],
          ['Cancelled does not count', 'A cancelled interview booking or a cancelled assessment is removed. If that was the only thing that put someone in, the day they were on ticks back down.'],
        ]
      },
      {
        heading: 'Reading it',
        items: [
          ['Rows and columns', 'Pod \u2192 Recruiter \u2192 Job \u2192 the day columns. Open a recruiter to see the roles behind their numbers. Every day of the selected range runs across the top, most recent first; a long range scrolls sideways.'],
          ['Which jobs are listed', 'Only jobs with an <strong>opening opened in the selected Year/Quarter period</strong> \u2014 the team does not work jobs whose opening was opened in an earlier quarter \u2014 and of those, only jobs with something to show in the period. The jobs follow the Year/Quarter selector; <em>From</em> and <em>To</em> set which days are shown. An opening with no opened date does not count; those are listed in <strong>Recruiter Efficiency \u2192 Data Hygiene \u2192 Openings Missing Opened Date</strong>, and Open jobs worked without an opening in <strong>Jobs Recruiting Without an Opening</strong>.'],
          ['Total', 'Every day column beside it added up \u2014 the row\u2019s arrivals for the window shown (30 days, or fewer when the date range is shorter), not for the whole quarter.'],
          ['From / To', 'The two dates after Year and Quarter, which can only be set <strong>inside the selected quarter</strong>. Momentum shows every day between them; every other panel on the tab counts only what happened between the two dates.'],
          ['The heatmap', 'One row per <strong>recruiter</strong>, one square per <strong>day</strong>; darker means more people added, and the count is in the square. <strong>Hover a square</strong> to list the roles behind it. Empty weekend squares are shaded grey. The column beside the names is the total for the window, the bottom row each day\u2019s total.'],
          ['Weekends', 'Saturday and Sunday dates are printed in a soft maroon, on the chart and underlined in the table. An empty square on a Saturday or Sunday is a weekend, not a bad day.'],
        ]
      },
    ],
    warnings: [
      ['This will not match Screening Efficiency', 'That panel counts what happened at R1 \u2014 every R1 action, including candidates who arrived earlier through HM Review. This counts <em>people entering the funnel</em>, by whichever of the three signals came first. Two different questions \u2014 the numbers are not supposed to agree.'],
      ['Assessments count from 8 July 2026', 'That is when the team began sending assessments through Ashby. Before that date a candidate could only be added by HM Review or an R1 booking.'],
    ]
  },
  'rec-screening': {
    summary: 'How these numbers are worked out',
    intro: 'What happens to candidates once they reach <strong>R1</strong> \u2014 how many were put into an R1 round, and how many went further. The <strong>Job</strong> filter narrows every number to the chosen jobs.',
    confirmed: 'Definitions confirmed with Jerin \u00b7 29 Aug 2026 \u00b7 only jobs with an opening opened in the period (#125) 15 Sep 2026 \u00b7 From / To narrows it to the day (#129) 15 Sep 2026',
    groups: [
      {
        heading: 'The columns',
        items: [
          ['Added at R1', 'The candidate was <strong>actioned at R1</strong>, by either route: an <strong>interview was scheduled</strong> at R1, or an <strong>assignment was triggered</strong> while they were sitting at R1. Either one counts; somebody with both counts once. Dated by when the interview was booked, or when the assignment went out, and counted when that day is between the <strong>From</strong> and <strong>To</strong> dates.'],
          ['Progressed', 'Of those, the ones who reached <strong>R2 or beyond</strong> \u2014 any later round, Reference Check, Documentation or Offer \u2014 on or after that day.'],
          ['%', 'Progressed \u00f7 Added at R1.'],
          ['Rows', 'Pod \u2192 Recruiter \u2192 Role. Only roles that actually saw R1 activity in the period are listed \u2014 a recruiter\u2019s older roles are not shown as a row of zeros.'],
          ['Which jobs are listed', 'Only jobs with an <strong>opening opened in the selected Year/Quarter period</strong> \u2014 the team does not work jobs whose opening was opened in an earlier quarter \u2014 and of those, only jobs with something to show in the period. An opening with no opened date does not count; those are listed in <strong>Recruiter Efficiency \u2192 Data Hygiene \u2192 Openings Missing Opened Date</strong>, and Open jobs worked without an opening in <strong>Jobs Recruiting Without an Opening</strong>.'],
          ['Counted once', 'One count per candidate per role per quarter, however many times they were booked or re-booked. Cancelled interviews and cancelled assignments do not count at all.'],
          ['Chart', 'A <strong>dumbbell</strong>: hollow dot = <strong>added at R1</strong>, solid dot = <strong>progressed past it</strong>, and the line between them is the drop-off. <strong>The axis runs down left to right on purpose</strong>, so it reads added \u2192 progressed. The rate sits in its own column on the right, headed <em>% progressed</em>. Hover a row to list its roles.'],
        ]
      },
    ],
    warnings: [
      ['It will not match Momentum\u2019s R1 either', 'Momentum only credits R1 when it was the candidate\u2019s <em>first</em> signal into the funnel. Here every R1 action counts, including candidates who arrived through HM Review earlier. Momentum\u2019s R1 is a subset of this one.'],
      ['HM Review and Online Assessment are not on this panel', 'By design \u2014 this one is about R1. Both still count towards <strong>Momentum</strong>, where they are two of the three ways a candidate enters the funnel.'],
    ]
  },
  'rec-joining': {
    summary: 'How these numbers are worked out',
    intro: 'Everyone who reached an offer, and what became of them. <strong>Offered = Joined + Joining Pending + Dropped</strong>, so the row always closes. The <strong>Job</strong> filter narrows every number to the chosen jobs.',
    confirmed: 'Definitions confirmed with Jerin · 26 Aug 2026 · credit rule aligned with Fulfilment 10 Sep 2026 \u00b7 head always with the recruiter 13 Sep 2026 \u00b7 From / To narrows it to the day (#129) 15 Sep 2026',
    groups: [
      {
        heading: 'The columns',
        items: [
          ['Offered', 'Joined + Joining Pending + Dropped — everyone who got as far as an offer.'],
          ['Joined', 'People <strong>moved to the Hired stage</strong>, dated by their <strong>start date</strong>, which must fall between the <strong>From</strong> and <strong>To</strong> dates (an accepted offer alone is not counted), minus anyone linked — by their offer, or by the opening they were hired into — to an <strong>earlier quarter\u2019s opening</strong> — that was last quarter\u2019s work landing now. The same rule applies on every pod, Sales included.'],
          ['Joining Pending', 'Everyone in <em>Ref Check</em>, <em>Documentation</em> or <em>Offer</em>, minus earlier-quarter openings. Exactly the rule of the Joining Pending card on <strong>Hiring Manager → Position Fulfilment</strong>.'],
          ['Dropped', 'Reached Ref Check, Documentation or Offer and was then archived, counted when the day they first got there is between the <strong>From</strong> and <strong>To</strong> dates. The same list the Hiring Manager tab and the Position Fulfilment tables use.'],
          ['Who each person is counted against', 'Every number in this table is a <strong>count of people</strong>, and each person counts <strong>whole</strong> against their <strong>recruiter</strong> — the same as the HC columns in Position Fulfilment, whoever sourced the role.'],
          ['Joining Conversion', '(Joined + Joining Pending) ÷ Offered — the share of everyone who reached an offer who has <strong>not</strong> fallen out. The bar shows it at a glance.'],
          ['The chart', 'One bar per recruiter, stacking <strong>Joined</strong>, <strong>Joining Pending</strong> and <strong>Dropped</strong>, with <strong>Offered</strong> (their sum) at the end and <strong>Joining conversion</strong> in its own column on the right. Each section is split into the <strong>roles</strong> behind it &mdash; hover one to list them.'],
        ]
      },
    ],
    warnings: [
      ['This measures drop-out, not joining', 'Joined and Joining Pending appear on both sides of the fraction, so they cancel: it is really <strong>1 \u2212 Dropped \u00f7 Offered</strong>. It sits near 96% and moves only when people fall out. That is the intended question \u2014 <em>who have we lost?</em>'],
      ['Joining Pending is live; its neighbours are quarterly', 'It shows who is in Ref Check, Documentation or Offer <strong>today</strong>, so the same people sit inside every quarter\u2019s Offered. Kept that way on purpose, so this column matches the Joining Pending card on Hiring Manager → Position Fulfilment instead of inventing a fifth definition.'],
      ['Recruiters with no pod set are missing entirely', 'As everywhere on this tab — see <strong>Data Hygiene → Pod Not Set</strong>. Cross-pod recruiters belong in the <strong>Others</strong> pod, which is shown normally.'],
      ['Joining Pending here is lower than on the Hiring Manager tab', 'A person counts only against a <strong>recruiter with a row on this tab</strong>. Anyone with no Recruiter tagged in Ashby, or tagged to a recruiter who was not here this quarter, is left out. They are all listed on the <strong>Joining Pending</strong> sub-tab under <em>No recruiter in this view</em>, and everyone with no Recruiter tagged is on <strong>Data Hygiene → Unassigned</strong>.'],
    ]
  },

  'rec-sourcing': {
    summary: 'How these numbers are worked out',
    intro: 'Where the people who actually <strong>joined</strong> came from. The <strong>Job</strong> filter narrows every number to the chosen jobs. Shading: each share is also drawn as a bar, in the source type’s colour from the chart above.',
    confirmed: 'Definitions confirmed with Jerin · 29 Aug 2026 · Quarter on All adds up the whole year 15 Sep 2026 \u00b7 From / To narrows it to the day (#129) 15 Sep 2026 \u00b7 shading (#137c) 15 Sep 2026',
    groups: [
      {
        heading: 'Reading it',
        items: [
          ['Four levels', 'Pod → Recruiter → Source type (e.g. <em>Job Portal</em>) → the specific source (e.g. <em>Naukri</em>, <em>LinkedIn</em>, <em>Employee Referral</em>).'],
          ['Joiners', 'People <strong>moved to the Hired stage</strong>, whose <strong>start date</strong> falls between the <strong>From</strong> and <strong>To</strong> dates, credited to that recruiter, counted against the source on their application. Every joiner counts, including anyone filling a position opened in an earlier quarter — so this can run slightly ahead of the Position Fulfilment table, which leaves those out. The same people are listed by name on the <strong>Joiners</strong> sub-tab.'],
          ['%', 'Share of the level above it — a source’s share of its type, a type’s share of the recruiter, a recruiter’s share of the pod.'],
          ['Chart', 'One bar per recruiter — the 20 with the most joiners in view — stacked by source type. The six biggest types get their own colour and the rest are pooled as <em>All other types</em>. It reads the same joiners as the table.'],
          ['(source not recorded)', 'A joiner whose application carries no source. They are kept here rather than dropped, so the panel still adds up to the number of joiners. They are listed by name — with the people still joining and those who dropped after an offer — in <strong>Recruiter Efficiency → Data Hygiene → Selected Candidates Missing Source</strong>.'],
        ]
      },
    ],
    warnings: [
      ['This counts joiners, not applications', 'Deliberate: a channel can bring tens of thousands of applications and produce almost no one who starts, so counting applications made the loudest channel look like the best one.'],
      ['It will not match application counts anywhere else', 'For example the Overview’s <em>Applications</em> card — a different unit, on purpose. Org-wide totals by department and role are on <strong>Overall Efficiency → Sourcing Mix</strong>.'],
    ]
  },

  'rec-tis': {
    summary: 'How these numbers are worked out',
    intro: 'How long each step actually takes. Every cell holds two things: the <strong>median days for candidates who finished the stage</strong>, and underneath in amber, <strong>how many are still sitting there</strong> and how long they have waited. Shading: a deeper slate behind a median means a slower stage compared with the rest of its column, and the waiting label darkens the longer people have waited — pale amber under 7 days, darker up to 30, rose after 30.',
    confirmed: 'Definitions confirmed with Jerin · 30 Aug 2026 · job rows show the recruiter’s own candidates, and the Job filter narrows every row, 14 Sep 2026 \u00b7 only jobs with an opening opened in the period (#125) 15 Sep 2026 \u00b7 From / To narrows it to the day (#129) 15 Sep 2026 \u00b7 shading (#137c) 15 Sep 2026',
    groups: [
      {
        heading: 'Reading it',
        items: [
          ['The number on top', 'Median days for candidates who <strong>left</strong> the stage — how long that step actually took. This is the only figure on the table you can compare between quarters. Hover a cell for the average and how many candidates it is based on.'],
          ['The two amber lines below', 'The people <strong>still sitting</strong> in that stage: how many, and on the second line the median days they have waited so far. Their clock is still running, so read it as a backlog to clear, not as how long the step takes.'],
          ['A dash instead of a number', 'Nobody has finished that stage in the selected period. If there is an amber figure under it, everyone who arrived is still there.'],
          ['Red', 'Median above 5 days. Colour only — nothing is filtered out.'],
          ['Rows', 'Pod → Recruiter → Job. A job row shows only <strong>that recruiter’s own candidates</strong> on the role, so the job rows add up to the recruiter row above them. The <strong>Job</strong> filter narrows every number to the chosen jobs.'],
          ['Which jobs are listed', 'Only jobs with an <strong>opening opened in the selected Year/Quarter period</strong> \u2014 the team does not work jobs whose opening was opened in an earlier quarter \u2014 and of those, only jobs with something to show in the period. An opening with no opened date does not count; those are listed in <strong>Recruiter Efficiency \u2192 Data Hygiene \u2192 Openings Missing Opened Date</strong>, and Open jobs worked without an opening in <strong>Jobs Recruiting Without an Opening</strong>.'],
          ['Hello Christy', 'The bot route into screening — an alternative to TA Screen, not a step before it. Low volume, so its column is often empty.'],
          ['TA Screen → Offer', 'Measured from real stage history — entered the stage to left the stage — for candidates who <strong>arrived</strong> between the <strong>From</strong> and <strong>To</strong> dates.'],
          ['App Review <span class="defs-tag">live</span>', 'Entirely a waiting pile: everyone <strong>currently sitting</strong> in App Review, measured as today minus their application date. Nobody in it has finished, so it always shows a dash over an amber figure, and it cannot be split by quarter. Marked with an orange asterisk.'],
        ]
      },
    ],
    warnings: [
      ['Why the two figures are kept apart', 'Pooled into one median, the number would measure the calendar, not the process: anyone who never left the stage would count as \u201ctoday minus the day they applied\u201d, so an older quarter would always read higher just for being older.'],
      ['One column on this table is not on the same clock as the others', 'App Review is live; every other stage follows the period. That is why it carries the asterisk — do not read across the row as a single candidate’s journey.'],
    ]
  },

  'rec-hygiene': {
    summary: 'What each of these lists is',
    intro: 'The compliance view: candidates, recruiters and roles the pipeline could not attribute cleanly. Pick a list on the left &mdash; its dot and count say whether it <strong>needs a fix</strong>, is <strong>for the record</strong> or has <strong>nothing to fix</strong>. Each is fixed <strong>in Ashby</strong> or in <strong>Admin → Pod &amp; Capacity</strong>, and its rows clear at the next refresh; every list downloads as CSV. The Pod, Recruiter, Job, From and To filters never apply here — that is deliberate — so they are hidden on this sub-tab. Someone whose access is limited to certain departments sees only those departments’ rows, and <em>Other Anomalies</em> leaves out unrecognised stage names for them, since a stage name carries no job. <strong>Unassigned, Multiple Recruiters, Multiple Sourcers and both opening-link lists start on 1 July 2026 and do not move with the Year/Quarter selector</strong>, so a Q3 miss stays visible after Q3 ends. Unassigned also lists everyone in Joining Pending with no Recruiter tagged, whatever their dates. The selector does apply to Selected Candidates Missing Source, Pod Not Set, Capacity Not Set, Roles Missing Score Inputs, Jobs Recruiting Without an Opening, and Recruiter Dates (the selected year, from Q3 2026).',
    confirmed: 'Definitions confirmed with Jerin · 24 Aug 2026 · Selected Candidates Missing Source 13 Sep 2026 · lists, 1 July 2026 start and side-list layout 14 Sep 2026 \u00b7 Jobs Recruiting Without an Opening (#125) 15 Sep 2026 \u00b7 its idle filters hidden (#141b) 17 Sep 2026',
    groups: [
      {
        heading: 'The lists',
        items: [
          ['Unassigned', 'Candidates past App Review with no Recruiter tagged, whose application was <strong>added, interviewed or assessed on or after 1 July 2026</strong> (assessed = feedback given, or the Online Assessment stage reached). Nobody is credited for this work until a Recruiter is tagged. Grouped by department, then job: <strong>Department / Job / Candidate</strong>, the <strong>Stage</strong> they are in, the day they <strong>Applied</strong>, their <strong>Last activity</strong> (the latest of those dates) and the Ashby <strong>Application ID</strong>. Most recent activity first; it shows up to 1,500 people and says so when there are more. <strong>Also listed, whatever their dates:</strong> everyone in <strong>Joining Pending</strong> (Ref Check, Documentation or Offer) with no Recruiter tagged, because the Recruiter Efficiency tables cannot credit them. Their <strong>Stage</strong> ends in <em>· Joining Pending</em>, and <strong>Applied</strong>, <strong>Last activity</strong> and <strong>Application ID</strong> are blank because the Joining Pending record does not carry them.'],
          ['Multiple Recruiters', 'More than one Recruiter tagged on one application, for applications added, interviewed or assessed on or after 1 July 2026. Scoring credits only the first, so the team should leave a single Recruiter of record. Columns: <strong>Job</strong>, <strong>Candidate</strong>, <strong>Recruiters tagged</strong>, <strong>Last activity</strong> and <strong>Application ID</strong>.'],
          ['Multiple Sourcers', 'An application should never have more than one Sourcer — anything here is a straight data error. Same dates and columns as Multiple Recruiters, with <strong>Sourcers tagged</strong>.'],
          ['Selected Candidates Missing Source', 'People who <strong>joined</strong>, are <strong>joining</strong> or <strong>dropped after an offer</strong> in the selected quarter whose application in Ashby has no source, dated by the offer’s start date (or the day the offer was made, when there is no start date). The joiners are the same people Sourcing Mix shows under <em>(source not recorded)</em>. For selected candidates the <strong>Hiring Tracker is the source of truth</strong> — set the source in Ashby to match it. Columns: <strong>Candidate</strong>, <strong>Job</strong>, <strong>Department</strong>, the <strong>Outcome</strong> (joined, joining pending or dropped), the <strong>Start date</strong> and the <strong>Recruiter</strong>.'],
          ['Recruiter Dates', 'Checks the dates against real work: <strong>work credited in a quarter outside someone’s dates</strong> — openings owned, joiners or drops, checked quarter by quarter across the selected year (the date or the credit is wrong), <strong>a disabled Ashby account with no Left on date</strong> (they still count every quarter), and <strong>recruiters with no Started on date</strong> (they count from the first quarter on record). Only the first two add to the count. Columns: <strong>Recruiter</strong>, the <strong>Quarter</strong> checked, the <strong>Work found</strong> there, their <strong>Started on</strong> and <strong>Left on</strong> dates, and the <strong>Last quarter with work</strong>.'],
          ['Pod Not Set', 'Recruiters who <strong>count in the selected quarter</strong> — by their Started on / Left on dates, or their Ashby account where no dates are set — but have no pod. <strong>They are excluded from every table and chart on this tab</strong>, so this list is where their work is visible until somebody assigns them a pod. If the person genuinely works across pods, assign <strong>Others</strong> rather than leaving them unset. Set the pod in <strong>Admin → Pod &amp; Capacity</strong>. Columns: <strong>Recruiter</strong>, <strong>Applications (all-time)</strong>, <strong>Offers (all-time)</strong>, <strong>Hired (all-time)</strong> and today’s <strong>Joining pending</strong>.'],
          ['Capacity Not Set', 'Recruiters who count in the selected quarter and sit in a real pod — Sales, Lateral, SME-US or SME-India; <em>Others</em> is left out — but whose capacity has <strong>never been entered</strong>. Capacity Utilisation cannot be worked out for them. A capacity typed in as 0 counts as entered. Enter it in <strong>Admin → Pod &amp; Capacity</strong>. Columns: <strong>Recruiter</strong>, <strong>Pod</strong>, <strong>Offers (all-time)</strong>, <strong>Hired (all-time)</strong> and today’s <strong>Joining pending</strong>.'],
          ['Offers Missing Opening Link', 'Offers still in play with no opening attached, where the <strong>Offer made</strong> date or the <strong>DOJ</strong> is on or after 1 July 2026. Without the link the offer cannot be tied to a position, which is why Delta on the HM tab can go negative. Attach the opening in Ashby (View Offer → Update Offer → Opening) and the row clears at the next refresh. Columns: <strong>Candidate</strong>, <strong>Job</strong>, <strong>Department</strong>, the offer <strong>Stage</strong>, <strong>Offer made</strong>, <strong>DOJ</strong> and <strong>Recruiter</strong>.'],
          ['Hired Missing Opening Link', 'The same gap, with the same dates, on offers where the person has already been hired or the application is closed — for the record rather than an alert. <strong>Someone hired into an opening is not listed even when their offer names none</strong>: Ashby records the opening picked when they were moved to Hired, and that link is read from Ashby’s Openings screen, so what is left here is closed applications and any hire whose opening is genuinely unknown. Hiring Manager Joined does not depend on this link — it counts filled openings — but Recruiter Efficiency does: Joined on Non-Sales and Joining Conversion leave out people on an earlier quarter’s opening, and Sales and Others split Joined by the opening’s quarter. An unlinked joiner can never be judged either way. Same columns as Offers Missing Opening Link, plus the application <strong>Status</strong>.'],
          ['Openings Missing Opened Date', 'Openings with no <strong>opened date</strong> in Ashby. They are <strong>left out of Total Openings entirely</strong> — on Hiring Manager Positions and on Overall Efficiency — so they are invisible rather than merely undated. One row per opening: <strong>Job</strong>, <strong>Department</strong>, <strong>Job status</strong> and the <strong>Opening ID</strong>. Set the date on the opening in Ashby.'],
          ['Jobs Recruiting Without an Opening', '<strong>Open</strong> jobs with work in the selected quarter \u2014 new candidates, R1 screening, stage assessments, finished stage stays or interviews \u2014 but <strong>no opening opened in that quarter</strong>. The team does not work jobs whose opening is from an earlier quarter, so Momentum, Screening Efficiency, Throughput, Time in Process and Panelists leave these jobs out, and this is the only place their work shows. Create the quarter\u2019s opening in Ashby, or set the opened date on an undated one. Columns: <strong>Job</strong>, <strong>Department</strong>, <strong>New candidates</strong> (added to the top of the funnel, as on Momentum), <strong>R1 screened</strong>, <strong>Assessed</strong> (stage assessments, as on Throughput), <strong>Finished stays</strong> (candidates who left a stage, as on Time in Process), <strong>Interviews</strong> and <strong>Openings in Ashby</strong> \u2014 none, earlier quarters only, or an opening with no opened date.'],
          ['Roles Missing Score Inputs', 'Roles that score zero for the selected quarter — usually Tech/NonTech roles missing a Level. SME roles score on Complexity alone and PA by title, so a blank Level does not flag them; a blank Complexity counts as Normal. They add headcount but no Score anywhere on the dashboard. Set the Level on the job in Ashby.'],
          ['Other Anomalies', 'One-off attribution problems, including any Ashby stage name the pipeline does not recognise — the guard that catches a stage being renamed and silently dropped. Each row names the <strong>Anomaly</strong>, the <strong>Detail</strong> behind it and <strong>What to do</strong>.'],
        ]
      },
    ],
    warnings: [
      ['Two entries in Other Anomalies are there by design', '<em>Hired</em> and <em>Archived</em> are not pipeline stages, so they always show as unmapped. They are listed as a footnote, not an alert — an alert list topped by non-problems is one people stop reading.'],
      ['A dash instead of a count', 'Unassigned, Multiple Recruiters and Multiple Sourcers show a dash until the first data refresh that carries the 1 July 2026 start — the older data cannot be cut to it.'],
    ]
  },

  'eff-fulfilment': {
    summary: 'How these numbers are worked out',
    intro: 'The same picture as the Hiring Manager tab, cut <strong>Department → Job</strong> and with a <strong>Score</strong> beside every count. Everything follows the Year/Quarter selector, narrowed to the day by the <strong>From</strong> and <strong>To</strong> dates inside it, except Joining Pending, which is live. With Quarter on <em>All</em> the quarters of the selected year are <strong>added up</strong>, the way the Hiring Manager tab does it (Year on <em>All</em> as well: every quarter since Q3 2026), and each quarter’s positions score at that quarter’s points. With Year on <em>All</em> and a quarter picked it shows that quarter of the latest year.',
    confirmed: 'Definitions confirmed with Jerin · 25 Aug 2026 · Joined = someone moved to Hired into the position 14 Sep 2026 \u00b7 Quarter on All adds up the whole year 15 Sep 2026 \u00b7 From / To narrows it to the day (#129) 15 Sep 2026',
    groups: [
      {
        heading: 'The columns',
        items: [
          ['Total Positions', 'Distinct openings raised in the selected period, on a day between the <strong>From</strong> and <strong>To</strong> dates, counted once each in the quarter they were opened.'],
          ['Joined', 'Those positions someone has been <strong>moved to Hired</strong> into \u2014 Ashby marks the opening <em>Filled</em>.'],
          ['Joining Pending', 'Everyone parked in <em>Ref Check</em>, <em>Documentation</em> or <em>Offer</em>, minus anyone whose opening was raised <strong>before the selected period starts</strong>. Counts <strong>people</strong>. Live: it shows who is in closing today, and the period you pick only decides which openings count as earlier. With Quarter on <em>All</em> that is the start of the period, as on the Hiring Manager card.'],
          ['Drop', 'Someone who reached <em>Ref Check</em>, <em>Documentation</em> or <em>Offer</em> and was then <strong>archived</strong> \u2014 declined, withdrew, or closed with the offer still open. Counted on the day they first got there, <strong>once</strong> per person, when that day is between the <strong>From</strong> and <strong>To</strong> dates. The small print is Drop \u00f7 (Joined + Joining Pending + Drop).'],
          ['Delta', 'Total Positions − Joined − Joining Pending. <strong>It can be negative, and that is allowed</strong> — it means more people are in closing than there are positions recorded, which happens when an offer was never linked to an opening. The bar fills with the shortfall; the line under it reads how much is covered — for example <em>30 of 40 · 75%</em> — or, when Delta is negative, how many more people are in closing than positions opened.'],
          ['Missed', 'Positions closed as <em>carry forward</em> to the next quarter.'],
          ['HC and Score', '<strong>HC</strong> is the count. <strong>Score</strong> weights it by how hard the role is (Family + Level + Complexity, from <strong>Admin → Scoring</strong>). A role that scores zero — usually a Tech/NonTech role with no Level; SME roles score on Complexity alone and Program Advisor roles by title — is marked <em>unscored</em>: it still counts in HC but adds nothing to Score. It is the same test as Recruiter Efficiency → Data Hygiene → Roles Missing Score Inputs.'],
        ]
      },
      {
        heading: 'The chart',
        items: [
          ['The chart', 'One bar per department, stacked Joined / Joining Pending / Delta with the total on the end — the same three numbers as the table. Each section is split into the <strong>roles</strong> behind it &mdash; hover one to list them. The legend is at metric level — clicking one toggles that whole colour.'],
          ['A negative Delta on a chart', 'A bar cannot be drawn backwards, so a department with a negative Delta gets no Delta segment and its bar runs past its total. The number at the end of the bar and the tooltip’s <em>Total positions</em> are still the table’s Total, and the tooltip names the negative Delta.'],
        ]
      },
    ],
    warnings: [
      ['Drop does not need an offer', 'Someone archived out of Ref Check or Documentation counts as a drop even if no offer was ever raised for them.'],
      ['Positions and people in the same row', 'Total Positions, Joined and Missed count <strong>positions</strong>. Joining Pending and Drop count <strong>people</strong>. One position can hold several people in closing, which is exactly why Delta is allowed to go negative.'],
      ['This table should agree with HM → Department Summary', 'Same definitions, same rules about which roles appear. The differences are presentation: this one adds Score to every column and drills from department to job.'],
    ]
  },

  'eff-joiningpending': {
    summary: 'How this list is worked out',
    intro: 'Everyone in <em>Ref Check</em>, <em>Documentation</em> or <em>Offer</em> right now, one row each. A <strong>live</strong> list, so on this sub-tab <strong>Year</strong>, <strong>Quarter</strong>, <strong>From</strong> and <strong>To</strong> give way to <strong>DOJ Month</strong>, <strong>DOJ From</strong> and <strong>DOJ To</strong>. The <strong>Department</strong> and <strong>Job</strong> filters narrow it too.',
    confirmed: 'Definitions confirmed with Jerin · 25 Aug 2026 · on its own sub-tab (#130) 15 Sep 2026 · the opening Ashby shows them tied to (#132) 15 Sep 2026 · DOJ boxes replace the period boxes (#133) 15 Sep 2026 · badges and date labels (#137) 15 Sep 2026',
    groups: [
      {
        heading: 'The columns',
        items: [
          ['DOJ', 'The joining date. Under it: how far away it is — in rose once the date has passed and they are still not moved to Hired. <em>Not set</em> when there is no DOJ yet.'],
          ['Candidate', 'The person.'],
          ['Department and Job', 'The role they are joining.'],
          ['Sub-stage', 'Which of Ref Check, Documentation or Offer they are in now. The badge fills in one step at a time — Ref Check, Documentation, Offer Created, Offer Sent, Offer Accepted — so it darkens as they get closer to joining.'],
          ['Recruiter', 'The Recruiter on their hiring team in Ashby, with their initials in their pod’s colour. <em>No recruiter</em> means none is tagged in Ashby.'],
          ['Opening', '<em>Linked</em> when they are tied to an opening in Ashby: the one named on their offer or, when there is none, the opening Ashby’s Openings screen shows them against. <em>Not linked</em> means that person cannot be tied to a position on Position Fulfilment — those are the ones to fix first.'],
          ['DOJ Month, DOJ From and DOJ To', 'In the filter row, on this sub-tab only, in place of Year, Quarter, From and To. They narrow the list by <strong>date of joining</strong>: pick a month, a range, or both, and either end of the range can be left empty. Anyone with <strong>no DOJ yet</strong> drops out while any of them is set; with all three empty, everyone in closing is listed.'],
        ]
      },
    ],
    warnings: [
      ['Slightly longer than the Joining Pending column', 'The column on Position Fulfilment leaves out people sitting on an opening raised before the selected period starts. This list shows everyone, so nobody is lost.'],
    ]
  },

  'eff-joiners': {
    summary: 'How this list is worked out',
    intro: 'Everyone who joined — moved to the <em>Hired</em> stage (an accepted offer alone does not count), with a <strong>start date</strong> between the <strong>From</strong> and <strong>To</strong> dates — one row each, most recent first. The <strong>Department</strong> and <strong>Job</strong> filters narrow it.',
    confirmed: 'Added with Jerin · 15 Sep 2026 (#130) · the opening read from the hire (#131) 15 Sep 2026 · badges and date labels (#137) 15 Sep 2026',
    groups: [
      {
        heading: 'The columns',
        items: [
          ['DOJ', 'The day they started, with its weekday under it.'],
          ['Candidate', 'The person.'],
          ['Department and Job', 'The role they joined.'],
          ['Recruiter', 'The Recruiter on their hiring team in Ashby, with their initials in their pod’s colour. <em>No recruiter</em> means none is tagged in Ashby.'],
          ['Opening', '<em>Linked</em> when they were hired into a known opening: the one named on their offer or, when the offer names none, the one picked when they were moved to Hired, read from Ashby’s Openings screen. <em>Not linked</em> only when neither is known.'],
        ]
      },
    ],
    warnings: [
      ['Not the same number as Joined on Position Fulfilment', 'That column counts <strong>positions</strong> filled, in the quarter each opening was opened. This list counts <strong>people</strong>, on the day they started. Both are right.'],
      ['Everyone who joined is listed', 'Including people filling a position opened before the period, so the count matches the joiners on <strong>Sourcing Mix</strong> and can run ahead of <strong>Joined</strong> on Joining Conversion, which leaves those out. There is no Sub-stage column, because Hired is a single stage.'],
    ]
  },

  'eff-momentum': {
    summary: 'How these numbers are worked out',
    intro: 'How many candidates were <strong>added to the top of the funnel</strong> each day, across the whole org \u2014 one row per person, not one per stage. Shading: a deeper teal square means more people added that day, weekends are greyed, a thin line marks each new week, and a small bar beside a job’s total compares it with the others.',
    confirmed: 'Definitions confirmed with Jerin \u00b7 29 Aug 2026 \u00b7 only jobs with an opening opened in the period (#125) 15 Sep 2026 \u00b7 shading (#137c) 15 Sep 2026 \u00b7 every day From → To (#141c) 17 Sep 2026',
    groups: [
      {
        heading: 'What counts as being added',
        items: [
          ['Whichever of these comes first', 'The candidate <strong>enters HM Review</strong>, or an <strong>assessment is triggered</strong> while they are sitting in the Online Assessment stage, or an <strong>R1 interview is booked</strong>.'],
          ['R1 is dated when the interview was BOOKED', 'Not the day it is held.'],
          ['Counted once per role, per quarter', 'Somebody already added is not counted again for that role in the same quarter. The count resets each quarter, so quarters do not add up to a year.'],
          ['Cancelled does not count', 'A cancelled interview booking or assessment is removed, which can take a count back off a past day.'],
        ]
      },
      {
        heading: 'Reading it',
        items: [
          ['Rows and columns', 'Department \u2192 Role down the side, every day of the selected date range across the top, most recent first; a long range scrolls sideways.'],
          ['Which jobs are listed', 'Only jobs with an <strong>opening opened in the selected Year/Quarter period</strong> \u2014 the team does not work jobs whose opening was opened in an earlier quarter \u2014 and of those, only jobs with something to show in the period. The jobs follow the Year/Quarter selector; <em>From</em> and <em>To</em> set which days are shown. With Year and Quarter both on <em>All</em>, the period starts at Q3 2026. An opening with no opened date does not count; those are listed in <strong>Recruiter Efficiency \u2192 Data Hygiene \u2192 Openings Missing Opened Date</strong>, and Open jobs worked without an opening in <strong>Jobs Recruiting Without an Opening</strong>.'],
          ['From / To', 'The two dates after Year and Quarter, which can only be set <strong>inside the selected period</strong>. Momentum shows every day between them; every other panel on the tab counts only what happened between the two dates.'],
          ['Total', 'Every day column beside it added up \u2014 30 days, or fewer when the date range is shorter.'],
          ['The heatmap', 'One row per <strong>department</strong>, one square per <strong>day</strong>; darker means more people added, and the count is in the square. <strong>Hover a square</strong> to list the roles behind it. Empty weekend squares are shaded grey. The column beside the names is the total for the window, the bottom row each day\u2019s total.'],
          ['Weekends', 'Saturday and Sunday dates are printed in a soft maroon, on the chart and underlined in the table.'],
        ]
      },
    ],
    warnings: [
      ['This will not match Screening Efficiency', 'That panel counts what happened at R1 specifically. This counts everyone entering the funnel, by whichever of the three signals came first.'],
      ['Assessments count from 8 July 2026', 'That is when the team began sending assessments through Ashby. Before that date a candidate could only be added by HM Review or an R1 booking.'],
    ]
  },
  'eff-screening': {
    summary: 'How these numbers are worked out',
    intro: 'What happens to candidates once they reach <strong>R1</strong>, by department \u2014 how many were put into an R1 round, and how many went further.',
    confirmed: 'Definitions confirmed with Jerin \u00b7 29 Aug 2026 \u00b7 only jobs with an opening opened in the period (#125) 15 Sep 2026 \u00b7 From / To narrows it to the day (#129) 15 Sep 2026',
    groups: [
      {
        heading: 'The columns',
        items: [
          ['Added at R1', 'The candidate was <strong>actioned at R1</strong>: an <strong>interview was scheduled</strong> at R1, or an <strong>assignment was triggered</strong> while they sat at R1. Either counts; somebody with both counts once. Counted when that happened between the <strong>From</strong> and <strong>To</strong> dates.'],
          ['Progressed', 'Of those, the ones who reached <strong>R2 or beyond</strong> \u2014 any later round, Reference Check, Documentation or Offer \u2014 on or after that day.'],
          ['%', 'Progressed \u00f7 Added at R1.'],
          ['Rows', 'Department \u2192 Role. Only roles that saw R1 activity in the period are listed.'],
          ['Which jobs are listed', 'Only jobs with an <strong>opening opened in the selected Year/Quarter period</strong> \u2014 the team does not work jobs whose opening was opened in an earlier quarter \u2014 and of those, only jobs with something to show in the period. With Year and Quarter both on <em>All</em>, the period starts at Q3 2026. An opening with no opened date does not count; those are listed in <strong>Recruiter Efficiency \u2192 Data Hygiene \u2192 Openings Missing Opened Date</strong>, and Open jobs worked without an opening in <strong>Jobs Recruiting Without an Opening</strong>.'],
          ['Counted once', 'One count per candidate per role per quarter. Cancelled interviews and cancelled assignments do not count at all.'],
          ['Chart', 'A <strong>dumbbell</strong>: hollow dot = <strong>added at R1</strong>, solid dot = <strong>progressed past it</strong>, and the line between them is the drop-off. <strong>The axis runs down left to right on purpose</strong>, so it reads added \u2192 progressed. The rate sits in its own column on the right, headed <em>% progressed</em>. Hover a row to list its roles.'],
        ]
      },
    ],
    warnings: [
      ['HM Review and Online Assessment are not on this panel', 'By design \u2014 this one is about R1. Both still count towards <strong>Momentum</strong>, where they are two of the three ways a candidate enters the funnel.'],
    ]
  },
  'eff-throughput': {
    summary: 'How these numbers are worked out',
    intro: 'The full funnel, stage by stage, <strong>Department → Job</strong>. Of the people <strong>assessed</strong> at each stage, how many <strong>progressed</strong> to a later one.',
    confirmed: 'Definitions confirmed with Jerin \u00b7 30 Aug 2026 \u00b7 one section, departments open into job rows (#122) 15 Sep 2026 \u00b7 department rows on a slate band, job squares soft apricot (#136) 15 Sep 2026 \u00b7 only jobs with an opening opened in the period (#125) 15 Sep 2026 \u00b7 From / To narrows it to the day (#129) 15 Sep 2026',
    groups: [
      {
        heading: 'Reading the squares',
        items: [
          ['One column per stage', 'Each cell reads <strong>assessed → progressed</strong>, with the percentage below it. <strong>Assessed</strong> means seen at the stage during the period — an interview actually held there, an assignment triggered there, or a feedback form (a select or reject) where no interview exists. Someone who only sat in the queue does not count. <strong>Ref Check, Documentation and Offer are counted differently</strong>: nobody is assessed at an administrative stage, so those three count the candidates <strong>added</strong> to the stage \u2014 the day they entered it. For Offer, progressed means they went on to be <strong>hired</strong>.'],
          ['Progressed', 'The second number in each cell: of those assessed, the ones who then reached a <strong>later stage</strong>. Being rejected or withdrawing does not count.'],
          ['%', 'Progressed ÷ Assessed — of the people actually assessed here, the share who moved forward. It cannot exceed 100%, because Progressed is a subset of Assessed.'],
          ['R1/OA \u2192 late', 'One span per candidate: assessed at <strong>R1 or Online Assessment</strong>, whichever came first, through to <strong>Ref Check, Documentation or Offer</strong>, whichever they reached first. Counted per person, never one stage column divided by another.'],
          ['Rows', 'Each department is a row. Click it, or its arrow, to open the <strong>jobs</strong> inside it, listed underneath. <em>Expand all</em> opens every department, and a department opens by itself when it is the only one showing. With more than one department, <strong>Total</strong> is the last row.'],
          ['Which jobs are listed', 'Only jobs with an <strong>opening opened in the selected Year/Quarter period</strong> \u2014 the team does not work jobs whose opening was opened in an earlier quarter \u2014 and of those, only jobs with something to show in the period. With Year and Quarter both on <em>All</em>, the period starts at Q3 2026. An opening with no opened date does not count; those are listed in <strong>Recruiter Efficiency \u2192 Data Hygiene \u2192 Openings Missing Opened Date</strong>, and Open jobs worked without an opening in <strong>Jobs Recruiting Without an Opening</strong>.'],
          ['What the colour means', 'The shade is <strong>how many people that square lost</strong> \u2014 assessed there, then never reached a later stage \u2014 on five steps from the palest (0\u20139) to the darkest (100 or more). <strong>Department</strong> and <strong>Total</strong> squares are blue, and each department row sits on a darker band; <strong>job</strong> squares use the same five steps in a lighter <strong>apricot</strong>, so a job reads as a job at a glance. The number in the square is still the rate: colour ranks what to fix, the number tells you the rate.'],
          ['A dot', 'Nobody was assessed at that stage in the period. It is not a zero rate.'],
          ['Hover', 'Hover a square for its counts, its rate and how many people it lost.'],
          ['Stages and Hide zero-pipeline', 'The <strong>Stages</strong> dropdown chooses which stage columns appear \u2014 with nothing picked, every stage shows. <em>Hide zero-pipeline</em> drops jobs with no movement at all in the period.'],
          ['The period', 'Follows the Year/Quarter selector. With Quarter on <em>All</em> each cell adds up every quarter of the selected year, and with Year on <em>All</em> as well it covers every quarter since Q3 2026. The <strong>From</strong> and <strong>To</strong> dates inside it narrow each cell to what happened between them.'],
        ]
      },
    ],
    warnings: [
      ['Do not add the stage columns together', 'One person assessed at R1, R2 and R3 appears in all three, so a total across stages counts them three times. Each column is only comparable to its own assessed figure. That is also why the <strong>R1/OA \u2192 late</strong> column is a single per-candidate span rather than a sum.'],
      ['Rejections do not count as progress', 'Only people who reached a later stage count as progressed. Someone rejected or withdrawn at a stage counts as assessed there and not progressed.'],
      ['The columns are not a funnel — do not read them left to right', 'Each stage is measured on its own. One column’s <em>progressed</em> will not equal the next column’s <em>assessed</em>, and often will not come close. Three reasons, all real: candidates skip stages (most roles never use Hello Christy or HM Review), <em>progressed</em> means reaching <em>any</em> later stage rather than the next one, and each figure is dated by when the assessment happened — so somebody screened in June and interviewed in July lands in two different quarters. Compare a stage to itself over time, not to its neighbour.'],
      ['Online Assessment carries small numbers', 'Used, but thinly next to App Review and R1. Treat a single role’s OA conversion as indicative, not solid.'],
    ]
  },

  'eff-pipeline': {
    summary: 'How these numbers are worked out',
    intro: 'The same live snapshot the Hiring Manager tab shows, on this tab’s Department and Job filters: where candidates stand right now. It is the one table on this page whose numbers the period does not change, so From and To are hidden on this sub-tab. Shading: a deeper teal behind a number means more people, compared within that stage’s column (departments with departments, jobs with jobs); zeros stay grey.',
    confirmed: 'Definitions confirmed with Jerin · 24 Aug 2026 · shading (#137c) 15 Sep 2026 · From / To hidden here (#141d) 17 Sep 2026 · added to this tab (#145a) 19 Sep 2026',
    groups: [
      {
        heading: 'Reading the table',
        items: [
          ['The numbers', 'How many candidates are in that stage <strong>today</strong>; archived candidates are left out. <strong>Hired</strong> is everyone hired on the role so far, because a hired candidate stays at Hired.'],
          ['Total', 'Every application on the role, archived ones included — so it is bigger than the stage columns added up.'],
          ['What Year and Quarter do', 'They decide <strong>which roles are listed</strong> — only those with an opening in the selected period — so department and total rows change with it. With Year and Quarter both on <em>All</em>, the period starts on 1 July 2026. Each role’s own counts do not.'],
          ['Department / Job', 'Departments, then the roles inside them. Click a department to open it.'],
          ['Stages and Hide zero-pipeline', 'The <strong>Stages</strong> dropdown chooses which stage columns appear; with nothing picked every stage shows, the same as on Throughput. <em>Hide zero-pipeline</em> drops roles with nobody in the stages shown.'],
        ]
      },
    ],
    warnings: [
      ['Do not add it to the Throughput numbers', 'Throughput counts movement during a period; this one counts people standing still today. Different questions, different totals.'],
      ['Time in Process answers "how long"', 'This table says how many people are at each stage, never how long they have been there. The waiting times live on the Time in Process sub-tab.'],
      ['Online Assessment is thin, not empty', 'It is genuinely used, but its volumes are small next to App Review and R1, so read a single role’s OA numbers with care.'],
    ]
  },

  'eff-tis': {
    summary: 'How these numbers are worked out',
    intro: 'How long each step actually takes, <strong>Department → Job</strong>. Every cell holds two things: the <strong>median days for candidates who finished the stage</strong>, and underneath in amber, <strong>how many are still sitting there</strong> and how long they have waited. Shading: a deeper slate behind a median means a slower stage compared with the rest of its column, and the waiting label darkens the longer people have waited — pale amber under 7 days, darker up to 30, rose after 30.',
    confirmed: 'Definitions confirmed with Jerin \u00b7 30 Aug 2026 \u00b7 only jobs with an opening opened in the period (#125) 15 Sep 2026 \u00b7 From / To narrows it to the day (#129) 15 Sep 2026 \u00b7 shading (#137c) 15 Sep 2026',
    groups: [
      {
        heading: 'Reading it',
        items: [
          ['The number on top', 'Median days for candidates who <strong>left</strong> the stage — how long that step actually took. This is the only figure on the table you can compare between quarters. Hover a cell for the average and how many candidates it is based on.'],
          ['The two amber lines below', 'The people <strong>still sitting</strong> in that stage: how many, and on the second line the median days they have waited so far. Their clock is still running, so read it as a backlog to clear, not as how long the step takes.'],
          ['A dash instead of a number', 'Nobody has finished that stage in the selected period. If there is an amber figure under it, everyone who arrived is still there.'],
          ['Red', 'Median above 5 days. Colour only — nothing is filtered out.'],
          ['Rows', 'Department → Job. Click a department to drill into its roles.'],
          ['Which jobs are listed', 'Only jobs with an <strong>opening opened in the selected Year/Quarter period</strong> \u2014 the team does not work jobs whose opening was opened in an earlier quarter \u2014 and of those, only jobs with something to show in the period. With Year and Quarter both on <em>All</em>, the period starts at Q3 2026. An opening with no opened date does not count; those are listed in <strong>Recruiter Efficiency \u2192 Data Hygiene \u2192 Openings Missing Opened Date</strong>, and Open jobs worked without an opening in <strong>Jobs Recruiting Without an Opening</strong>.'],
          ['Hello Christy', 'The bot route into screening — an alternative to TA Screen, not a step before it. Low volume, so its column is often empty.'],
          ['TA Screen → Offer', 'From real stage history — entered the stage to left the stage — for candidates who <strong>arrived</strong> between the <strong>From</strong> and <strong>To</strong> dates.'],
          ['App Review <span class="defs-tag">live</span>', 'Entirely a waiting pile: everyone <strong>currently sitting</strong> in App Review, measured as today minus their application date. Nobody in it has finished, so it always shows a dash over an amber figure, and it cannot be split by quarter. Marked with an orange asterisk.'],
        ]
      },
    ],
    warnings: [
      ['Why the two figures are kept apart', 'Pooled into one median, the number would measure the calendar, not the process: anyone who never left the stage would count as \u201ctoday minus the day they applied\u201d, so an older quarter would always read higher just for being older.'],
      ['One column is not on the same clock as the others', 'App Review is live; every other stage follows the period. Do not read across a row as one candidate’s journey.'],
    ]
  },

  'eff-joining': {
    summary: 'How these numbers are worked out',
    intro: 'Everyone who reached an offer, by department, and what became of them. <strong>Offered = Joined + Joining Pending + Dropped</strong>, so the row always closes.',
    confirmed: 'Definitions confirmed with Jerin \u00b7 29 Aug 2026 \u00b7 From / To narrows it to the day (#129) 15 Sep 2026',
    groups: [
      {
        heading: 'The columns',
        items: [
          ['Offered', 'Joined + Joining Pending + Dropped \u2014 everyone who got as far as an offer.'],
          ['Joined', 'People <strong>moved to the Hired stage</strong>, dated by their <strong>start date</strong>, which must fall between the <strong>From</strong> and <strong>To</strong> dates (an accepted offer alone is not counted), minus anyone whose opening — the one on their offer or, when the offer names none, the one they were hired into — was raised <strong>before the selected period starts</strong>.'],
          ['Joining Pending', 'Everyone in <em>Ref Check</em>, <em>Documentation</em> or <em>Offer</em>, minus anyone on an opening raised before the selected period starts. The same rule as the Joining Pending card on Hiring Manager → Position Fulfilment.'],
          ['Dropped', 'Reached Ref Check, Documentation or Offer and was then archived, counted when the day they first got there is between the <strong>From</strong> and <strong>To</strong> dates. The same list HM and the Recruiter tab use.'],
          ['Joining Conversion', '(Joined + Joining Pending) \u00f7 Offered \u2014 the share of everyone who reached an offer who has <strong>not</strong> fallen out.'],
          ['Rows', 'Department, then the roles inside it. People whose offer or case names a role Ashby\u2019s job list does not return still count, under their department (or <em>Unknown</em>), with <em>(no job recorded)</em> when there is no title \u2014 so Joining Pending here matches Position Fulfilment on this tab.'],
          ['The period', 'Follows the Year/Quarter selector, like Position Fulfilment: with Quarter on <em>All</em> it adds up every quarter of the selected year (Year on <em>All</em> as well: every quarter since Q3 2026). The <strong>From</strong> and <strong>To</strong> dates inside it narrow Joined and Dropped to the day; Joining Pending stays live.'],
          ['Chart', 'One bar per department, stacking Joined, Joining Pending and Dropped, with <strong>Offered</strong> at the end of the bar and the <strong>Joining conversion</strong> in its own labelled column down the right-hand edge. Each section is split into the <strong>roles</strong> behind it &mdash; hover one to list them.'],
        ]
      },
    ],
    warnings: [
      ['This measures drop-out, not joining', 'Joined and Joining Pending sit on <em>both</em> sides of the fraction, so they cancel: the figure is arithmetically <strong>1 \u2212 Dropped \u00f7 Offered</strong>. That is the intended question \u2014 <em>who have we lost?</em>'],
      ['Joining Pending is live; its neighbours are quarterly', 'It shows who is in closing <strong>today</strong>, so the same people sit inside every quarter\u2019s Offered \u2014 kept that way so the column matches the Joining Pending card on Hiring Manager → Position Fulfilment.'],
      ['How this compares with the Recruiter tab', 'The Recruiter tab\u2019s <em>Position Fulfilment</em> tables take no earlier-quarter subtraction on Joined for the Sales and Others pods. Pods do not exist on this tab, so here the subtraction is applied to every department \u2014 the same as the Recruiter tab\u2019s own Joining Conversion, which applies it to every pod.'],
    ]
  },
  'eff-sourcing': {
    summary: 'How these numbers are worked out',
    intro: 'Where the people who actually <strong>joined</strong> came from, <strong>Department → Job → Source type → Source</strong>. Shading: each share is also drawn as a bar; a source name’s bar takes that source’s colour from the chart above, and the rest stay slate.',
    confirmed: 'Definitions confirmed with Jerin \u00b7 30 Aug 2026 \u00b7 From / To narrows it to the day (#129) 15 Sep 2026 \u00b7 shading (#137c) 15 Sep 2026',
    groups: [
      {
        heading: 'Reading it',
        items: [
          ['Joiners', 'People <strong>moved to the Hired stage</strong> for that role, whose <strong>start date</strong> falls between the <strong>From</strong> and <strong>To</strong> dates, counted against the source on their application. With Quarter on <em>All</em> it covers the whole selected year, and every quarter since Q3 2026 with Year on <em>All</em> as well — the line above the table names the period.'],
          ['%', 'Share of the level above — a source’s share of its type, a type’s share of the role, and so on.'],
          ['(source not recorded)', 'A joiner whose application carries no source. They are kept here rather than dropped, so the panel still adds up to the number of joiners. They are listed by name — with the people still joining and those who dropped after an offer — in <strong>Recruiter Efficiency → Data Hygiene → Selected Candidates Missing Source</strong>.'],
          ['Chart', 'One bar per source type, split into the individual sources inside it. The 12 biggest sources get their own colour; the rest are pooled as <em>All other sources</em>. It reads the same rows as the table, so the two can never disagree.'],
        ]
      },
    ],
    warnings: [
      ['This counts joiners, not applications', 'Deliberate: a channel can bring tens of thousands of applications and produce almost no one who starts.'],
      ['Counted by START DATE, and every joiner counts', 'Someone who accepted in June and starts in September counts in Q3, not Q2. <strong>One deliberate difference from Position Fulfilment and Joining Conversion on this tab:</strong> those two leave out people filling a position that was opened in an earlier quarter, because they answer “did we fill this quarter’s demand”. This panel asks which channels bring us people, so a joiner counts however long ago their position was raised — which is why its total runs a little higher.'],
    ]
  },

  'interviewer': {
    summary: 'How these numbers are worked out',
    intro: 'Interview load and feedback turnaround per panelist, built from the interviews actually scheduled in Ashby.',
    confirmed: 'Definitions confirmed with Jerin \u00b7 31 Aug 2026 \u00b7 only jobs with an opening opened in the period (#125) 15 Sep 2026 \u00b7 From / To narrows it to the day (#129) 15 Sep 2026',
    groups: [
      {
        heading: 'The cards',
        items: [
          ['Total Interviews', 'Interview <strong>events</strong> — a two-person panel is one event. It reads <em>Interviews</em> when a period is picked. The line underneath gives the panel places behind them.'],
          ['Panel Slots', 'Shown instead when a Department, Job or Panelist filter is set, or the data has no event count for the period: <strong>places on panels</strong>, so a panel of two counts twice.'],
          ['Panelists', 'Distinct people who sat on at least one interview in the view — <em>Panelists Active</em> when a period is picked.'],
          ['Feedback Coverage and Avg Turnaround cards', 'The same measures as the columns below, across everyone in view, counted once each. Both are all-time and cover every interview those people sat that you can see — all of them, unless your access is limited to certain departments — not only the filtered ones.'],
        ]
      },
      {
        heading: 'The columns',
        items: [
          ['Interviews', 'Places this panelist took on interview panels during the selected period. A department row adds up its panelists.'],
          ['Feedback Coverage', 'How often this panelist writes up an interview: the share of their interviews that have feedback attached, with <strong>feedback received / interviews</strong> in brackets so the rate is never a bare percentage. Taken from Ashby\u2019s own flag on each interview.'],
          ['Avg Turnaround', 'Time from an interview ending to the feedback being submitted, shown in hours under a day and in days above it. All-time; highlighted above 72 hours. A panelist’s figure is the average of their per-role averages, and a department’s is the average of its panelists’ figures.'],
          ['Rows', 'Department \u2192 Panelist \u2192 the roles they interviewed for.'],
          ['Which jobs are counted', 'Only interviews on jobs with an <strong>opening opened in a quarter the From\u2013To dates touch</strong> \u2014 the team does not work jobs whose opening was opened in an earlier quarter. Neither tab reaches back before 1 July 2026. The <em>Total Interviews</em> card counts the same jobs. Feedback Coverage and Avg Turnaround stay per person, as described below.'],
          ['The period', 'The <strong>From</strong> and <strong>To</strong> dates of the tab it sits on \u2014 Hiring Manager or Overall Efficiency \u2014 which Year and Quarter fill in. Interviews are counted by the <strong>day</strong> they were held, so a date range counts exactly its days.'],
          ['Chart', 'One bar per panelist for the 15 busiest in view, stacked by month \u2014 or by quarter until the data carries months. Inside a date range each month holds only its days between the two dates, so a bar adds up to the table.'],
        ]
      },
    ],
    warnings: [
      ['Only the interview count follows the period', 'Feedback Coverage and Avg Turnaround have no quarter breakdown in the data, so they are all-time and say so in the header. The interview count beside them does follow the period \u2014 which is why a department can show fewer interviews this quarter than it has feedback outstanding overall.'],
      ['Feedback figures are per person across everything you can see', 'Coverage is recorded per panelist, not per role. A department row rolls up its <strong>distinct</strong> panelists, so nobody is counted twice \u2014 but the figure still covers every interview those people sat anywhere you can see, not only this department\u2019s. The cards above the table have the same limit.'],
    ]
  },

  'admin-pods': {
    summary: 'How this page works',
    intro: 'Which pod each recruiter sits in, what they are expected to carry, and who counts in each quarter \u2014 used by <strong>Recruiter Efficiency</strong> and <strong>Overall Efficiency</strong>. Pod and Capacity are stored <strong>per quarter</strong> and copy forward until someone changes them.',
    confirmed: 'Definitions confirmed with Jerin \u00b7 30 Aug 2026 \u00b7 split into Pod & Capacity and Scoring (#137b) 15 Sep 2026 \u00b7 grouped by pod (#142) 17 Sep 2026',
    groups: [
      {
        heading: 'Reading it',
        items: [
          ['Pod', 'Groups recruiters on the Recruiter Efficiency tab. A recruiter with <strong>no pod for the selected quarter is excluded from every row and total</strong> on that tab \u2014 they are listed under Data Hygiene \u2192 Pod Not Set. Use <strong>Others</strong> for anyone who works across pods \u2014 it groups and totals like a normal pod.'],
          ['Capacity', 'A Score, not a headcount \u2014 what that recruiter is expected to carry in that quarter. It sits beside the Goal on the Position Fulfilment tables and drives Capacity Utilisation. It is not the Goal: the Goal comes from the openings the recruiter owns in Ashby.'],
          ['Type', '<strong>Agency</strong>, <strong>Freelancer</strong> or <strong>Internal</strong>. A label only \u2014 it moves no number, because everyone follows the same credit rule. Ashby\u2019s <em>External Recruiter</em> flag sets the default (flagged = Freelancer, otherwise Internal), and anyone can change it here. Hover the box to see whether Ashby flags the account.'],
          ['Started on', 'The recruiter\u2019s first day, set once per person \u2014 not per quarter. A blank start means they count from the first quarter on record. Ashby does not record this, which is why it is kept here.'],
          ['Left on', 'Their last working day. Blank means still here. Someone who left part-way through a quarter still counts for that whole quarter.'],
          ['Groups', 'Recruiters are grouped by <strong>pod</strong> for the selected quarter. Each heading counts the recruiters listed under it and adds up their <strong>Capacity</strong> for that quarter, so switching on the recruiters who weren\u2019t here adds theirs too. Changing someone\u2019s pod moves them into that group; the heading\u2019s total follows as you type a capacity.'],
          ['In quarter', 'Whether they count in the quarter chosen in the <strong>Quarter</strong> box, and why. With both dates blank, the Ashby account decides. Hover it to see which one decided.'],
          ['Ashby account', '<strong>Read from Ashby, not editable here.</strong> <em>Enabled</em> means the person holds an elevated recruiter licence (Recruiter or Recruiter Admin); <em>Unknown</em> means no Ashby user matched the name. It only decides who counts for people with no dates set; their past offers and hires still score either way.'],
          ['Quarter and copy-forward', 'The <strong>Quarter</strong> box picks which quarter you are editing. Pod and Capacity are stored per quarter; a quarter with no explicit setting inherits the nearest earlier one, and editing a quarter only changes that quarter. Started on, Left on and Type are per person, not per quarter.'],
          ['Show recruiters who weren’t here this quarter', 'Also lists recruiters outside their dates for the chosen quarter. Their saved Pod and Capacity are kept either way; this only changes what is listed.'],
        ]
      },
    ],
    warnings: [
      ['Edits are local until you publish', 'Changes apply in <strong>this browser</strong> immediately, and to nobody else. <strong>Publish to team</strong> writes the shared config everyone sees. It is one config with <strong>Scoring</strong>, so it sends the changes from both tabs. The status beside it says when this browser has unpublished changes. <strong>Download</strong> saves the file as a fallback.'],
    ]
  },

  'admin-grid': {
    summary: 'How scoring works',
    intro: 'How a role earns its points on <strong>Recruiter Efficiency</strong> and <strong>Overall Efficiency</strong>. The grid is stored <strong>per quarter</strong> and copies forward until someone changes it; <strong>Department \u2192 Family</strong> and <strong>Levels &amp; overrides</strong> are the same in every quarter.',
    confirmed: 'Definitions confirmed with Jerin \u00b7 30 Aug 2026 \u00b7 split into Pod & Capacity and Scoring (#137b) 15 Sep 2026',
    groups: [
      {
        heading: 'Reading it',
        items: [
          ['A role\u2019s Score', '<strong>Family + Level + Complexity</strong> \u2192 the grid \u2192 points. Level and Complexity come from the job in Ashby; Family is derived from the department and job title.'],
          ['Role Score Grid', 'Each role classification maps to one tier, and each tier to a point value: edit the points in the header and pick one tier per row. The chosen tier shows its points, and a deeper colour means more points. The note beside the title says whether the quarter was edited or inherited. Reports score a role with the grid of the quarter being reported.'],
          ['Quarter and copy-forward', 'The <strong>Quarter</strong> box picks which quarter\u2019s grid you are editing. A quarter with no explicit grid inherits the nearest earlier one, and editing a quarter only changes that quarter.'],
        ]
      },
    ],
    warnings: [
      ['Edits are local until you publish', 'Changes apply in <strong>this browser</strong> immediately, and to nobody else. <strong>Publish to team</strong> writes the shared config everyone sees. It is one config with <strong>Pod &amp; Capacity</strong>, so it sends the changes from both tabs. The status beside it says when this browser has unpublished changes. <strong>Download</strong> saves the file as a fallback.'],
    ]
  },

  'admin-family': {
    summary: 'How this list works',
    intro: 'Which scoring family each Ashby department belongs to. The same in every quarter.',
    confirmed: 'Definitions confirmed with Jerin \u00b7 30 Aug 2026 \u00b7 split into Pod & Capacity and Scoring (#137b) 15 Sep 2026',
    groups: [
      {
        heading: 'Reading it',
        items: [
          ['Department → Family', 'Maps each Ashby department to a scoring family. Business departments score as <strong>PA</strong> only when the job title contains <em>Program Advisor</em> (a Senior Program Advisor scores as a regular PA, a Junior as PA Junior); otherwise they score as NonTech. <em>Exclude</em> scores zero.'],
        ]
      },
    ],
    warnings: [
      ['Edits are local until you publish', 'Changes apply in <strong>this browser</strong> immediately, and to nobody else. <strong>Publish to team</strong> writes the shared config everyone sees. It is one config with <strong>Pod &amp; Capacity</strong>, so it sends the changes from both tabs. The status beside it says when this browser has unpublished changes. <strong>Download</strong> saves the file as a fallback.'],
    ]
  },

  'admin-levels': {
    summary: 'What this list is',
    intro: 'Reference only \u2014 nothing here can be edited, and it is the same in every quarter.',
    confirmed: 'Definitions confirmed with Jerin \u00b7 30 Aug 2026 \u00b7 split into Pod & Capacity and Scoring (#137b) 15 Sep 2026',
    groups: [
      {
        heading: 'Reading it',
        items: [
          ['Level → Band · Complexity · Leadership override', 'Reference only. L7–L8 score as Leadership and L9 and above as Senior Leadership, in any family. A blank Complexity counts as Normal. Tech and NonTech roles with no Level score zero; SME roles score on Complexity alone.'],
        ]
      },
    ],
  },

  'admin-access': {
    summary: 'How access works',
    intro: 'Who can open the dashboard and what they see. Sign-in is the person’s <strong>@interviewkickstart.com Google account</strong>, matched on email.',
    groups: [
      {
        heading: 'Reading it',
        items: [
          ['Default access', 'What anyone signed in with an @interviewkickstart.com account gets when their email is not in the list below.'],
          ['Role', '<strong>Admin</strong>: every tab plus Admin. <strong>Full Access</strong>: every tab except Admin. <strong>Restricted</strong>: Overview plus the tabs you grant. <strong>None</strong>: access denied.'],
          ['Tabs', 'Restricted users only. Choose from Hiring Manager, Recruiter Efficiency and Overall Efficiency. Overview is always on; Admin can never be granted this way.'],
          ['Depts', 'Restricted users only; empty means all. <strong>Every figure</strong> on Hiring Manager, Recruiter Efficiency and Overall Efficiency, the Panelists panels included, narrows to the jobs in those departments. The <strong>Overview</strong> page is never narrowed — it is for everyone. The choices are the departments the jobs carry in Ashby. Teams are no longer used. Treat it as a convenience, not a privacy boundary: the data file behind the dashboard is public, so this changes what the page shows, not what can be read.'],
          ['User type', '<strong>Hiring Manager</strong>, <strong>Recruitment Team</strong>, <strong>Admin</strong> or <strong>Others</strong> — a label for grouping people and for the filter. It changes nothing about what they can see: Role, Tabs and Depts decide that. Someone with no saved label shows the one their role suggests (Admin ⇒ Admin, Restricted ⇒ Hiring Manager, otherwise Recruitment Team).'],
          ['User type and Invite status filters', 'Narrow the list below. <strong>Invited</strong> = an invite has been sent · <strong>Not invited</strong> = their access is published but no invite has gone · <strong>Not published yet</strong> = the access shown is not live, so no invite can be sent. The count beside them says how many people are shown.'],
          ['Groups', 'The list is grouped by <strong>User type</strong> \u2014 Admin, Recruitment Team, Hiring Manager, Others \u2014 each heading showing how many people it holds and how many of them have been invited. Changing someone\u2019s user type moves them into that group. Sorting a column sorts within each group.'],
          ['Send invite', 'Sends the invite email to that person <strong>straight away, after you confirm</strong> — nothing goes out automatically. It gives the dashboard link, says to sign in with their Interview Kickstart Google account, and describes <strong>only the access that person has</strong>. It is sent from the mailbox that runs the dashboard (currently jerin@interviewkickstart.com), signed TA Team, so replies go there. Greyed out until their access is <strong>published</strong>. Once sent, the row shows the date (hover it to see who sent it), and the button becomes <em>Resend invite</em>.'],
        ]
      },
    ],
    warnings: [
      ['Nothing changes for anyone until you publish', '<strong>Publish access</strong> writes the shared file everyone reads. Until then your edits are kept in <strong>this browser</strong> only: they survive a reload, nobody else sees them, and if someone else publishes access in the meantime they are dropped (the status line says so) rather than published over that change. <strong>Download</strong> saves access.json as a fallback.'],
    ]
  },

  'admin-depts': {
    summary: 'What this list is',
    intro: 'A read-only copy of Ashby’s department → team tree (Ashby → Admin → Organization Setup → Departments &amp; Teams).',
    groups: [
      {
        heading: 'Reading it',
        items: [
          ['Where reports get departments', 'From each job in Ashby, which already carries its department and team. This copy is only a fallback for older data files, so changing it moves no current number.'],
          ['Keeping it current', 'It does not update itself. Edit <code>site/js/dept-map.js</code> when Ashby’s departments or teams change.'],
          ['Access Management', 'Does not use this copy. Its Depts picker lists the departments the jobs carry in Ashby, which is what a restriction is matched against.'],
        ]
      },
    ],
  },

  'overview': {
    summary: 'How these numbers are worked out',
    intro: 'The one-page summary. Everything follows the Year/Quarter selector unless it says otherwise.',
    confirmed: 'Definitions confirmed with Jerin · 30 Aug 2026 · Joined positions = moved to Hired 14 Sep 2026 · the four ranked panels became context cards (#135) 15 Sep 2026',
    groups: [
      {
        heading: 'The five cards',
        items: [
          ['Total Positions', 'Positions opened in the selected period, counted once each in the quarter they were opened. The line underneath splits them into joined, open and — where there are any — missed.'],
          ['Applications', 'Candidates who applied in the period.'],
          ['Candidates Interviewed', 'Distinct <strong>people</strong> we assessed in the period. Someone counts once whether they sat one interview or five — within a quarter. A whole year is the quarters added up unless the data file carries a year-level count, so somebody interviewed in two different quarters can count twice; the card says “quarters added up” when that is what you are looking at. It includes candidates who took an <strong>online assessment</strong> (HeyMilo, Trifle, HackerEarth) as well as those who met a panel — the two are combined by person, not added, because plenty of candidates do both. The line underneath splits them.'],
          ['Total Interviews Managed', 'Shown in place of Candidates Interviewed only when the data file has no per-person count: interview events in the period, with the number of panelists underneath (marked <em>all time</em> when the data has no per-quarter split).'],
          ['Applications Hired', 'Applications made in the period that are now at <strong>Hired</strong>, with their share of all the period’s applications underneath. It follows the <strong>application</strong>, so it is neither the positions joined (Fill Rate, Hiring Manager) nor the people who started in the period (Recruiter Efficiency), and it will not match either.'],
          ['Fill Rate', 'Positions joined ÷ positions opened, for the period. A position counts as joined once someone has been <strong>moved to Hired</strong> into it (Ashby marks the opening <em>Filled</em>).'],
        ]
      },
      {
        heading: 'The rest of the page',
        items: [
          ['Hiring Pipeline', 'Applied → Screened → Interviewed → Offered → Hired for the period. Each band is how many candidates reached that point, so the bands step down.'],
          ['Positions by Department', 'The same positions as the Total Positions card, broken out by department. The six largest are listed and everything past them is summed on a final line, so the list always reconciles with the card above it. The line under the title is the joined, total and still-open positions for the period — the same as the Total Positions card — and the pill beside a department is its joined positions ÷ its total. In the bar, deep teal is joined, pale slate is open and rose is missed.'],
          ['Top Jobs by Hired / by Applications', 'The roles with the most hires, and the most applications, in the period. <strong>By Hired under a quarter</strong> reads every role once the data file carries the per-quarter hire ranking; against an older file it falls back to that quarter’s busiest roles, so a role that hires well on very few applicants can be missing from it. The grey tag under a job is its department, and the line under the title adds up the jobs listed.'],
          ['Top Panelists by Interview Count', 'Who carried the interviewing load in the period. The grey tag under a name is the department they <strong>interviewed for most</strong> in the period — Ashby gives a person no department, so it comes from the jobs behind their interviews; “+1” means they also interviewed for another department.'],
          ['Rank badges and links', 'The top three in each list wear a filled badge. The link at the bottom of a card opens the tab behind it, and only shows if you can open that tab.'],
        ]
      },
    ],
    warnings: [
      ['This card counts people; the interview tabs count interviews', 'Candidates Interviewed counts a person once. The <strong>Panelists</strong> tabs on Hiring Manager and Overall Efficiency count <strong>places on panels</strong> — a candidate seen three times by two people each is 1 here and 6 there. Both are right; they answer different questions, so never compare them directly.'],
    ]
  },

};

// #13 (Jerin, 14 Sep 2026): the Data Hygiene side list, one entry per list in display order. `sub` is the one-line reminder under the
// name; `why` and `fix` fill the list header (Jerin approved these visible notes for this tab — mock-up B1); `scope` names the dates the
// list covers ('floor' = on or after dataQuality.hygieneFloor, 'quarter', 'year', 'all', 'live'); `record` marks the one list shown
// grey (for the record) rather than red. The rules themselves are described in the 'rec-hygiene' block above — change both together.
export const HYGIENE_LISTS = [
  { id: 'unassigned', group: 'Candidates', name: 'Unassigned', sub: 'Past App Review, no Recruiter tagged', scope: 'floor', unit: 'candidates',
    why: 'Nobody is credited for work on these candidates until a Recruiter is tagged.', fix: ['Ashby', 'Candidate', 'Hiring Team', 'Add Member · Recruiter'] },
  { id: 'multirec', group: 'Candidates', name: 'Multiple Recruiters', sub: 'Two or more Recruiters on one application', scope: 'floor', unit: 'applications',
    why: 'Scoring credits only the first Recruiter, so the others lose credit for the same candidate.', fix: ['Ashby', 'Candidate', 'Hiring Team', 'Keep one Recruiter'] },
  { id: 'multisrc', group: 'Candidates', name: 'Multiple Sourcers', sub: 'Two or more Sourcers on one application', scope: 'floor', unit: 'applications',
    why: 'An application should never have more than one Sourcer — anything here is a data error.', fix: ['Ashby', 'Candidate', 'Hiring Team', 'Keep one Sourcer'] },
  { id: 'nosrc', group: 'Candidates', name: 'Selected Candidates Missing Source', sub: 'Joined, joining or dropped, with no source', scope: 'quarter', unit: 'people',
    why: 'Sourcing Mix cannot say which channel brought these people. The Hiring Tracker holds the right source.', fix: ['Ashby', 'Application', 'Source', 'Match the Hiring Tracker'] },
  { id: 'dates', group: 'Recruiters', name: 'Recruiter Dates', sub: 'Dates that don’t match the work credited', scope: 'year', unit: 'recruiters',
    why: 'Started on and Left on decide who appears in each quarter. A wrong date hides real work or shows someone who had left.', fix: ['Admin', 'Pod & Capacity', 'Started on / Left on'] },
  { id: 'nopod', group: 'Recruiters', name: 'Pod Not Set', sub: 'Active recruiters with no pod', scope: 'quarter', unit: 'recruiters',
    why: 'Anyone without a pod is left out of every table and chart on this tab — this is the only place their work shows.', fix: ['Admin', 'Pod & Capacity', 'Pod'] },
  { id: 'nocap', group: 'Recruiters', name: 'Capacity Not Set', sub: 'In a pod, capacity never entered', scope: 'quarter', unit: 'recruiters',
    why: 'Capacity Utilisation cannot be worked out for them. People in Others are left out on purpose.', fix: ['Admin', 'Pod & Capacity', 'Capacity'] },
  { id: 'offergap', group: 'Offers & openings', name: 'Offers Missing Opening Link', sub: 'Live offers not tied to a position', scope: 'floor', unit: 'offers',
    why: 'Without the opening the offer cannot be matched to a position, which is why Delta on the Hiring Manager tab can go negative.', fix: ['Ashby', 'View Offer', 'Update Offer', 'Opening'] },
  { id: 'hiredgap', group: 'Offers & openings', name: 'Hired Missing Opening Link', sub: 'Hired or closed, never tied to a position', scope: 'floor', unit: 'people', record: true,
    why: 'Recruiter Joined cannot tell whether these people filled this quarter’s opening or an earlier one.', fix: ['Ashby', 'View Offer', 'Update Offer', 'Opening'] },
  { id: 'nodate', group: 'Offers & openings', name: 'Openings Missing Opened Date', sub: 'Invisible in Total Openings', scope: 'all', unit: 'openings',
    why: 'An opening with no opened date is left out of Total Openings on Hiring Manager and Overall Efficiency entirely.', fix: ['Ashby', 'Job', 'Openings', 'Opened at'] },
  { id: 'noopening', group: 'Offers & openings', name: 'Jobs Recruiting Without an Opening', sub: 'Open jobs worked with no opening this quarter', scope: 'quarter', unit: 'jobs',
    why: 'Momentum, Screening Efficiency, Throughput, Time in Process and Panelists list only jobs with an opening opened in the quarter, so this work is hidden there until the job gets one.', fix: ['Ashby', 'Job', 'Openings', 'Create or date the opening'] },
  { id: 'unscored', group: 'Offers & openings', name: 'Roles Missing Score Inputs', sub: 'Adds headcount but no Score', scope: 'quarter', unit: 'roles',
    why: 'A role that scores zero adds headcount but nothing to its department’s Score — usually a Tech or Non-Tech role with no Level.', fix: ['Ashby', 'Job', 'Level'] },
  { id: 'anomalies', group: 'System', name: 'Other Anomalies', sub: 'Unknown stage names, mis-credited interviewers', scope: 'live', unit: 'issues',
    why: 'Catches an Ashby stage the dashboard doesn’t recognise before its candidates silently drop out of every count.', fix: ['See each row'] },
];

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
    <summary><svg class="defs-ico" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.4" fill="none" stroke="currentColor" stroke-width="1.3"/><rect x="7.35" y="7" width="1.3" height="4.6" rx=".6" fill="currentColor"/><circle cx="8" cy="4.8" r=".9" fill="currentColor"/></svg><span class="defs-sum-text">${d.summary}</span><svg class="defs-chev" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></summary>
    <div class="defs-body">
      ${d.intro ? `<p class="defs-intro">${d.intro}</p>` : ''}
      ${groups}${warn}
      ${d.confirmed ? `<p class="defs-confirmed">${d.confirmed}</p>` : ''}
    </div>
  </details>`;
}
