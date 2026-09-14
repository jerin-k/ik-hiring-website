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
    confirmed: 'Definitions confirmed with Jerin · 24 Aug 2026 · Joined = someone moved to Hired into the position 14 Sep 2026',
    groups: [
      {
        heading: 'The six cards at the top',
        items: [
          ['Total Positions', 'How many <strong>positions</strong> were opened in the period you have selected. Each opening counts once, in the quarter it was opened — so a role opened in Q2 keeps counting toward Q2 for as long as it stays open. Positions marked <em>On Hold</em> or <em>Shelved</em>, and positions with no opening date recorded in Ashby, are left out.'],
          ['Joined', 'Positions from that set that someone has been <strong>moved to Hired</strong> into \u2014 Ashby then marks the opening <em>Filled</em>.'],
          ['Open', 'Positions from that set still to fill.'],
          ['Missed', 'Positions closed with the reason <em>carry forward</em> — the hire did not happen in that quarter and moved to the next one.'],
          ['Joining Pending', 'Counts <strong>people</strong>, not positions: everyone sitting in <em>Ref Check</em>, <em>Documentation</em> or <em>Offer</em> right now, minus anyone whose opening was raised in a quarter before the period you picked. It is a <strong>live</strong> figure: it shows who is in closing today, and the period only decides which openings count as earlier.'],
          ['Dropped', 'Someone who reached <em>Ref Check</em>, <em>Documentation</em> or <em>Offer</em> and was then <strong>archived</strong> \u2014 declined, withdrew, or closed with the offer still open. Counted in the quarter they first got there, <strong>once</strong> per person. The small print is its share of outcomes: Dropped \u00f7 (Joined + Joining Pending + Dropped).'],
        ]
      },
      {
        heading: 'The filters at the top',
        items: [
          ['Department and Job', 'Narrow every panel on this tab to the chosen department and roles.'],
          ['Status', 'The <strong>role’s</strong> status in Ashby: <em>Open</em> or <em>Closed</em> (an archived role counts as Closed). Tick just one and every panel narrows to roles with that status — positions, Joining Pending, Dropped, the Cases list, Throughput, Pipeline and Panelists. With both ticked, or neither, nothing is filtered.'],
          ['From / To, Year and Quarter', 'The period. Year and Quarter fill in the From and To dates; you can also type your own dates, and every panel follows them. With Year and Quarter both on <em>All</em>, the dates are cleared and the page covers all time.'],
        ]
      },
      {
        heading: 'Department Summary — the columns',
        items: [
          ['Department', "Ashby's top-level department. Click the row to open the individual roles inside it."],
          ['Total Openings', 'Positions opened in the period, as above.'],
          ['Joined', 'Positions someone has been moved to Hired into (Ashby marks the opening <em>Filled</em>).'],
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
          ['Opening Quarter', 'The quarter of the opening their offer is linked to. It reads <em>Not linked</em> when the offer has no opening attached in Ashby — those offers are listed in <strong>Recruiter Efficiency → Data Hygiene → Offers Missing Opening Link</strong>.'],
          ['Month and DOJ', 'The candidate’s date of joining, and its month.'],
          ['Sub-Stage', 'Which of Ref Check, Documentation or Offer they are in now.'],
          ['Department, Job, Candidate, Recruiter', 'The role, the person, and the Recruiter on their hiring team in Ashby.'],
          ['Its own date filter', 'The DOJ month and date boxes above the list filter the list only. They do not touch anything else on the page.'],
        ]
      },
    ],
    warnings: [
      ['Positions and people are different units', 'Total Openings, Open and Missed count <strong>positions</strong>. Joining Pending and Dropped count <strong>people</strong>. One position can have several people in closing against it, so never read across the row as if it were one running total.'],
      ['Drop does not need an offer', 'Someone archived out of Ref Check or Documentation counts as a drop even if no offer was ever raised for them.'],
      ['Joining Pending is live', 'It always shows who is in closing today; the period you pick only decides which openings count as earlier-quarter ones. Everything else on this page follows the period.'],
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
          ['One column per stage', 'Each cell reads <strong>assessed → progressed</strong>, with the throughput percentage below it. <strong>Assessed</strong> means seen at that stage during the period — an interview actually held there, an assignment triggered there, or a feedback form (a select or reject) where no interview exists. <strong>Progressed</strong> means they then reached a <em>later</em> stage. <strong>Ref Check, Documentation and Offer are counted differently</strong>: nobody is assessed at an administrative stage, so those three count the candidates <strong>added</strong> to the stage \u2014 the day they entered it. For Offer, progressed means they went on to be <strong>hired</strong>.'],
          ['What the colour means', 'In the <strong>table</strong>, the shade is the throughput rate: under 50%, 50\u201370%, and 70% or more. In the <strong>chart</strong> above it, the shade is <strong>how many people that square lost</strong> \u2014 assessed there, then never reached a later stage \u2014 from white (0\u20139) to darkest (100 or more), while the number in the square is still the rate. Colour ranks what to fix; the number tells you the rate.'],
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
      ['Rejections do not count as progress', 'Only people who reached a later stage count as progressed. Someone rejected or withdrawn at a stage counts as assessed there and not progressed.'],
      ['The columns are not a funnel — do not read them left to right', 'Each stage is measured on its own. One column’s <em>progressed</em> will not equal the next column’s <em>assessed</em>, and often will not come close. Three reasons, all real: candidates skip stages (most roles never use Hello Christy or HM Review), <em>progressed</em> means reaching <em>any</em> later stage rather than the next one, and each figure is dated by when the assessment happened — so somebody screened in June and interviewed in July lands in two different quarters. Compare a stage to itself over time, not to its neighbour.'],
      ['A role with no movement reads zero, not its history', 'If a role had no activity in the selected period it shows zeros rather than its all-time numbers. That includes a period with no stage history at all, such as a quarter that has not started.'],
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
          ['The numbers', 'How many candidates are in that stage <strong>today</strong>; archived candidates are left out. <strong>Hired</strong> is everyone hired on the role so far, because a hired candidate stays at Hired.'],
          ['Total', 'Every application on the role, archived ones included — so it is bigger than the stage columns added up.'],
          ['What the date filter does do', 'It decides <strong>which roles are listed</strong> — only those with an opening in the selected period — so department and total rows change with it. With Year and Quarter both on <em>All</em>, every role is listed. Each role’s own counts do not.'],
          ['Rows', 'Department, then the roles inside it. Click to open.'],
          ['Stage tick-boxes and Hide zero-pipeline', 'The tick-boxes choose which stage columns appear. <em>Hide zero-pipeline</em> drops roles with nobody in them.'],
        ]
      },
    ],
    warnings: [
      ['Do not add it to the Throughput numbers', 'That table counts movement during a period; this one counts people standing still today. Different questions, different totals.'],
      ['Online Assessment is thin, not empty', 'It is genuinely used, but its volumes are small next to App Review and R1, so read a single role’s OA numbers with care.'],
    ]
  },

  'rec-fulfilment': {
    summary: 'How these numbers are worked out',
    intro: 'Three tables, same shape. <strong>Non-Sales</strong> is measured on <strong>Joined + Joining Pending</strong>; <strong>Sales</strong> and <strong>Others</strong> on <strong>Joined</strong>. Everything follows the Year/Quarter selector at the top. Goals, pods and capacity exist only per quarter, so with Quarter on <em>All</em> these tables show the current quarter. The <strong>Job</strong> filter narrows every number to the chosen jobs. While it is on, or your access is limited to certain departments, <strong>Capacity</strong> and <strong>Capacity Utilisation</strong> read a dash.',
    confirmed: 'Definitions confirmed with Jerin · 24 Aug 2026 · Goal basis updated 6 Sep 2026 · Joined split on Sales and Others added 7 Sep 2026 · recruiter/sourcer credit rule replaced and the +N sourced line added 13 Sep 2026 · Goal counts filled openings and leaves out archived ones 14 Sep 2026 · the Job filter narrows every number, and Capacity reads a dash while it does, 14 Sep 2026',
    groups: [
      {
        heading: 'The two number types in every column',
        items: [
          ['HC', 'Headcount — a count of people (or of positions, for Goal). It always counts on the <strong>recruiter’s</strong> row. Anything a person <strong>sourced</strong> for someone else shows as a small <strong>+N sourced</strong> line underneath instead, so the main figure still adds up to the real number of people.'],
          ['Score', 'The same thing weighted by how hard the role is: each role scores points from its Family, Level and Complexity, set in <strong>Admin → Metric Configuration</strong>. A senior niche hire is worth many times a vanilla one. <strong>Where a candidate has a Sourcer, the points for Joined, Joining Pending and Drop are shared half and half</strong> — see <em>How credit is shared with a Sourcer</em> below. The Goal is never shared.'],
        ]
      },
      {
        heading: 'The columns',
        items: [
          ['Goal', 'The <strong>openings you own</strong> in the selected quarter — the positions where you are the <strong>Recruiter on the opening</strong> in Ashby, not every role you have ever touched. Each opening scores from its role’s Family, Level and Complexity. <strong>The Goal is never shared</strong>: even where an opening also has a Sourcer, the recruiter keeps its full points. Openings a person is tagged on as <strong>Sourcer</strong> show underneath as <strong>+N sourced</strong>, with no points attached. Openings still open, already filled or carried forward all count; <strong>archived</strong> openings do not.'],
          ['Capacity', 'What this recruiter is expected to carry in the quarter, as a <strong>Score</strong>, set by hand in <strong>Admin → Metric Configuration</strong>. It reads 0 until somebody sets it. It is not the Goal — the Goal comes from the openings the recruiter owns. Role rows show a dash, because capacity is set per recruiter — and every row does while the <strong>Job</strong> filter or a department restriction narrows the numbers, because capacity cannot be split by job or department.'],
          ['Joined', 'Candidates <strong>moved to the Hired stage</strong>, dated by their <strong>start date</strong>, from the individual offer records — an accepted offer alone is not counted. On <strong>Non-Sales</strong> it also excludes anyone linked to an <strong>earlier quarter\u2019s opening</strong> — last quarter\u2019s work landing now. <strong>Sales and Others take no such subtraction</strong>, deliberately: their goal is joiners whenever the opening was raised. On <strong>Sales</strong> and <strong>Others</strong> this appears as <strong>Joined Total</strong>, split across the two columns beside it.'],
          ['Joined — Prev Qtr Openings <span class="defs-tag">Sales · Others</span>', 'Of the people who joined this quarter, those filling an opening raised in an <strong>earlier</strong> quarter — carried-over demand finally landing. Needs the offer to carry an opening link.'],
          ['Joined — Current Qtr Openings <span class="defs-tag">Sales · Others</span>', 'Everyone else who joined — <strong>Joined Total minus the column beside it</strong>, so the two always add up. Because it is a subtraction it also holds <strong>every joiner whose offer has no opening attached at all</strong>; that count is printed under the number as <em>unlinked</em>. So this column means <em>“not known to be earlier”</em>, not <em>“raised this quarter”</em>.'],
          ['JP Total', 'Always <strong>exactly the two columns beside it added together</strong> — never counted separately. On <strong>Sales</strong> and <strong>Others</strong> that is everyone currently in Ref Check, Documentation or Offer. On <strong>Non-Sales</strong> it leaves out anyone on an earlier quarter’s opening, and anyone joining next quarter on an opening that is not this quarter’s.'],
          ['JP — Current Qtr <span class="defs-tag">Non-Sales</span>', 'Everyone in closing, minus anyone on an earlier quarter’s opening, minus anyone joining next quarter.'],
          ['JP — Upcoming Qtr <span class="defs-tag">Non-Sales</span>', 'Their opening was raised this quarter but they join next quarter. Needs the offer to carry an opening link.'],
          ['JP — Prev Qtr Openings <span class="defs-tag">Sales · Others</span>', 'Opening raised last quarter, candidate joining this quarter — last quarter’s work landing now. Needs the offer to carry an opening link.'],
          ['JP — Current Qtr Openings <span class="defs-tag">Sales · Others</span>', 'Everyone else in closing.'],
          ['Drop', 'Someone who reached <em>Ref Check</em>, <em>Documentation</em> or <em>Offer</em> and was then <strong>archived</strong> \u2014 declined, withdrew, or closed with the offer still open. Counted in the quarter they first got there, <strong>once</strong> per person. The small print is Drop \u00f7 (Joined + JP + Drop).'],
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
          ['Agency, freelancer or internal makes no difference', 'Everyone follows the same rule, as recruiter or as sourcer. The <strong>Agency</strong> / <strong>Freelancer</strong> / <strong>Internal</strong> setting in <strong>Admin → Metric Configuration</strong> is kept as a label only.'],
          ['Agencies and freelancers appear under <span class="defs-tag">Others</span>', 'They join the list the moment they own an opening, are tagged as Sourcer on one, or have a joiner attributed to them, and sit in <strong>Others</strong> until a pod is set for them in <strong>Admin → Metric Configuration</strong>. Without that their share of the credit would leave the recruiter and show up nowhere.'],
          ['Where the source of the candidate comes into it', '<strong>It does not.</strong> Whether someone came from an agency, a job board or a referral has <strong>no effect on the score</strong>. Only the tagged Sourcer moves credit.'],
          ['Nothing is created or lost', 'On Joined, Joining Pending and Drop the two halves always add back to the whole — whatever leaves the recruiter turns up on the sourcer’s row. The Goal is not shared, so each opening is counted once, on its recruiter.'],
        ]
      },
      {
        heading: 'The chart and the Cases list',
        items: [
          ['Chart', 'One bar per recruiter \u2014 the bar is what they <strong>achieved</strong>. A solid line marks their <strong>Goal</strong>, a dashed line their <strong>Capacity</strong> (not drawn while the Job filter or a department restriction narrows the numbers), and a pale band labelled <em>Short of Goal</em> fills any shortfall. Everything is in Score. Same figures as the table. Each section is split into the <strong>roles</strong> behind it &mdash; hover one to list them. <em>Short of Goal</em> is not split \u2014 it belongs to no single role. The bar is always exactly the table\u2019s Achieved: any credit that no role row under the recruiter carries shows as its own band, <em>credit not tied to a listed role</em>. Hovering a bar shows the Goal.'],
          ['Joining Pending — Cases', 'Every person in closing, one row each, grouped Pod → Recruiter → Candidate. A <strong>live</strong> list, so the quarter selector does not apply. Anyone with no recruiter tagged, or whose recruiter this tab hides by default, appears in the <em>No recruiter in this view</em> group at the bottom with the reason beside their name — so the list always accounts for everybody.'],
          ['Cases columns', '<strong>Opening Quarter</strong> is the quarter of the opening the offer is linked to (<em>Not linked</em> when there is none). <strong>Month</strong> and <strong>DOJ</strong> are the joining date. <strong>Sub-Stage</strong> is Ref Check, Documentation or Offer.'],
        ]
      },
    ],
    warnings: [
      ['Fulfilment — Others', 'A third table for recruiters in the <strong>Others</strong> pod — people who work across pods rather than inside one. It uses the <strong>Sales counting rule</strong>: joiners count regardless of which quarter raised the opening, because that work is billed per joiner. Nobody appears in more than one table, so no total or chart double-counts.'],
          ['Recruiters with no pod set are left out entirely', 'Out of every row, total and chart on this tab. Their numbers are in <strong>Data Hygiene → Pod Not Set</strong>. Someone who genuinely works across pods should be given the <strong>Others</strong> pod, which appears here like any other.'],
      ['Drop does not need an offer', 'Someone archived out of Ref Check or Documentation counts as a drop even if no offer was ever raised for them.'],
      ['Recruiters who weren\u2019t here this quarter are hidden by default', 'A recruiter counts from their <strong>Started on</strong> date to their <strong>Left on</strong> date, set in <strong>Admin \u2192 Metric Configuration</strong> \u2014 someone who left mid-quarter still counts for that quarter. Until a recruiter\u2019s dates are entered, a disabled Ashby account decides. Their history still counts either way; tick <em>Not here this quarter</em> to see them.'],
      ['Openings with more than one owner are split', 'When two or more recruiters sit as <em>Recruiter</em> on the same opening in Ashby, the opening and its score are <strong>divided equally</strong> between them. This is the only place a Goal shows a decimal. There is no Data Hygiene list for these yet — the decimal is the sign.'],
      ['Roles that score zero for the quarter', 'They still count in HC but contribute 0 to Score — usually Tech/NonTech roles missing a Level (SME roles score on Complexity alone and PA by title, so neither needs a Level). Score understates the work until the Level is set. The list is in <strong>Data Hygiene → Roles Missing Score Inputs</strong>.'],
    ]
  },

  'rec-momentum': {
    summary: 'How these numbers are worked out',
    intro: 'How many candidates were <strong>added to the top of the funnel</strong> on each day — one row per person, not one per stage. The <strong>Job</strong> filter narrows every number to the chosen jobs.',
    confirmed: 'Definitions confirmed with Jerin \u00b7 26 Aug 2026',
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
          ['Rows and columns', 'Pod \u2192 Recruiter \u2192 Job \u2192 the day columns. Open a recruiter to see the roles behind their numbers. The last 30 days of the selected range run across the top, most recent first.'],
          ['Total', 'Every day column beside it added up \u2014 the row\u2019s arrivals for the window shown (30 days, or fewer when the date range is shorter), not for the whole quarter.'],
          ['Momentum from / Momentum to', 'Momentum is the one panel driven by these two dates rather than the Year/Quarter selector, and they change nothing else on the tab. It always shows the last 30 days of that range.'],
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
    confirmed: 'Definitions confirmed with Jerin · 26 Aug 2026 · credit rule aligned with Fulfilment 10 Sep 2026 · head always with the recruiter 13 Sep 2026',
    groups: [
      {
        heading: 'The columns',
        items: [
          ['Offered', 'Joined + Joining Pending + Dropped — everyone who got as far as an offer.'],
          ['Joined', 'People <strong>moved to the Hired stage</strong>, dated by their <strong>start date</strong> (an accepted offer alone is not counted), minus anyone whose offer is linked to an <strong>earlier quarter\u2019s opening</strong> — that was last quarter\u2019s work landing now. The same rule applies on every pod, Sales included.'],
          ['Joining Pending', 'Everyone in <em>Ref Check</em>, <em>Documentation</em> or <em>Offer</em>, minus earlier-quarter openings. Exactly the rule the Hiring Manager Positions card uses.'],
          ['Dropped', 'Reached Ref Check, Documentation or Offer and was then archived. The same list HM and both Fulfilment tables use.'],
          ['Who each person is counted against', 'Every number in this table is a <strong>count of people</strong>, and each person counts <strong>whole</strong> against their <strong>recruiter</strong> — the same as the HC columns in Fulfilment, whoever sourced the role.'],
          ['Joining Conversion', '(Joined + Joining Pending) ÷ Offered — the share of everyone who reached an offer who has <strong>not</strong> fallen out. The bar shows it at a glance.'],
          ['The chart', 'One bar per recruiter, stacking <strong>Joined</strong>, <strong>Joining Pending</strong> and <strong>Dropped</strong>, with <strong>Offered</strong> (their sum) at the end and <strong>Joining conversion</strong> in its own column on the right. Each section is split into the <strong>roles</strong> behind it &mdash; hover one to list them.'],
        ]
      },
    ],
    warnings: [
      ['This measures drop-out, not joining', 'Joined and Joining Pending appear on both sides of the fraction, so they cancel: it is really <strong>1 \u2212 Dropped \u00f7 Offered</strong>. It sits near 96% and moves only when people fall out. That is the intended question \u2014 <em>who have we lost?</em>'],
      ['Joining Pending is live; its neighbours are quarterly', 'It shows who is in Ref Check, Documentation or Offer <strong>today</strong>, so the same people sit inside every quarter\u2019s Offered. Kept that way on purpose, so this column matches the HM Positions card instead of inventing a fifth definition.'],
      ['Recruiters with no pod set are missing entirely', 'As everywhere on this tab — see <strong>Data Hygiene → Pod Not Set</strong>. Cross-pod recruiters belong in the <strong>Others</strong> pod, which is shown normally.'],
    ]
  },

  'rec-sourcing': {
    summary: 'How these numbers are worked out',
    intro: 'Where the people who actually <strong>joined</strong> came from. The <strong>Job</strong> filter narrows every number to the chosen jobs.',
    confirmed: 'Definitions confirmed with Jerin · 29 Aug 2026',
    groups: [
      {
        heading: 'Reading it',
        items: [
          ['Four levels', 'Pod → Recruiter → Source type (e.g. <em>Job Portal</em>) → the specific source (e.g. <em>Naukri</em>, <em>LinkedIn</em>, <em>Employee Referral</em>).'],
          ['Joiners', 'People <strong>moved to the Hired stage</strong>, whose <strong>start date</strong> falls in the selected period, credited to that recruiter, counted against the source on their application. Every joiner counts, including anyone filling a position opened in an earlier quarter — so this can run slightly ahead of the Fulfilment table, which leaves those out. Leave Quarter on <em>All</em> and you get the whole year — the line above the table names the period being shown.'],
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
    intro: 'How long each step actually takes. Every cell holds two things: the <strong>median days for candidates who finished the stage</strong>, and underneath in amber, <strong>how many are still sitting there</strong> and how long they have waited.',
    confirmed: 'Definitions confirmed with Jerin · 30 Aug 2026 · job rows show the recruiter’s own candidates, and the Job filter narrows every row, 14 Sep 2026',
    groups: [
      {
        heading: 'Reading it',
        items: [
          ['The number on top', 'Median days for candidates who <strong>left</strong> the stage — how long that step actually took. This is the only figure on the table you can compare between quarters. Hover a cell for the average and how many candidates it is based on.'],
          ['The two amber lines below', 'The people <strong>still sitting</strong> in that stage: how many, and on the second line the median days they have waited so far. Their clock is still running, so read it as a backlog to clear, not as how long the step takes.'],
          ['A dash instead of a number', 'Nobody has finished that stage in the selected period. If there is an amber figure under it, everyone who arrived is still there.'],
          ['Red', 'Median above 5 days. Colour only — nothing is filtered out.'],
          ['Rows', 'Pod → Recruiter → Job. A job row shows only <strong>that recruiter’s own candidates</strong> on the role, so the job rows add up to the recruiter row above them. The <strong>Job</strong> filter narrows every number to the chosen jobs.'],
          ['Hello Christy', 'The bot route into screening — an alternative to TA Screen, not a step before it. Low volume, so its column is often empty.'],
          ['TA Screen → Offer', 'Measured from real stage history — entered the stage to left the stage — for candidates who <strong>arrived</strong> during the selected period.'],
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
    intro: 'The compliance view: candidates and roles the pipeline could not attribute cleanly. These get fixed <strong>in Ashby</strong>, and the rows disappear at the next refresh. Every list downloads as CSV. The Pod, Recruiter and Job filters never apply here — that is deliberate. Someone whose access is limited to certain departments sees only those departments’ rows, and <em>Other Anomalies</em> leaves out unrecognised stage names for them, since a stage name carries no job. The Unassigned list stops at 800 rows and the Multiple Recruiters and Multiple Sourcers lists at 200. The Year/Quarter selector does, for the lists about a quarter: Recruiter Roster, Recruiter Dates (the whole selected year), Pod Not Set, Selected Candidates Missing Source, Roles Missing Score Inputs and Capacity Not Set.',
    confirmed: 'Definitions confirmed with Jerin · 24 Aug 2026 · Selected Candidates Missing Source 13 Sep 2026',
    groups: [
      {
        heading: 'The cards at the top',
        items: [
          ['Unassigned (screening+)', 'The <em>Unassigned</em> list below: candidates past App Review with no Recruiter tagged.'],
          ['Unassigned (all funnel)', 'Every application with no Recruiter tagged, App Review included. Most have not been worked yet, so there is no list for it.'],
          ['Multi-Recruiter apps', 'The <em>Multiple Recruiters</em> list below.'],
          ['Multi-Sourcer apps', 'The <em>Multiple Sourcers</em> list below. It should be zero.'],
          ['Not here this quarter', 'Recruiters outside their <strong>Started on</strong> / <strong>Left on</strong> dates for the selected quarter — or, where no dates are set, with a disabled Ashby account.'],
        ]
      },
      {
        heading: 'The lists',
        items: [
          ['Unassigned', 'Candidates in active screening with no Recruiter tagged on the hiring team. The actionable backlog — nobody is credited for this work. Candidates still in App Review are left out, since nobody has worked them yet. Its columns are the role and candidate (<strong>Job / Candidate</strong>), the date they <strong>Applied</strong>, and the Ashby <strong>Application ID</strong> to find them by.'],
          ['Multiple Recruiters', 'More than one person tagged as Recruiter on one application. Scoring credits the first, so the team should leave a single Recruiter of record.'],
          ['Multiple Sourcers', 'An application should never have more than one Sourcer. Anything here is a straight data error.'],
          ['Recruiter Roster', 'Everyone the pipeline knows about: whether Ashby still shows them holding a recruiter licence, their <strong>Started on</strong> and <strong>Left on</strong> dates, and whether they count in the selected quarter — by their dates, or by the Ashby account where no dates are set. Their history still counts either way. <strong>Offers</strong> and <strong>Hired</strong> are all-time totals, not the quarter’s.'],
          ['Recruiter Dates', 'Checks the dates against real work: <strong>work credited in a quarter outside someone\u2019s dates</strong> \u2014 openings owned, joiners or drops, checked quarter by quarter across the selected year (the date or the credit is wrong), <strong>a disabled Ashby account with no Left on date</strong> (they still count every quarter), and <strong>recruiters with no Started on date</strong> (they count from the first quarter on record). Only the first two add to the count on the tab.'],
          ['Pod Not Set', 'Real recruiters with real numbers who have no pod for the selected quarter. <strong>They are excluded from every table and chart on this tab</strong> — this list is where their work is visible until somebody assigns them a pod. If the person genuinely works across pods, assign <strong>Others</strong> rather than leaving them unset. Set the pod in <strong>Admin → Metric Configuration</strong>. <strong>Applications</strong>, <strong>Offers</strong> and <strong>Hired</strong> here are all-time totals, not the quarter’s.'],
          ['Offers Missing Opening Link', 'Offers with no opening attached that are <strong>still in play</strong>. Without the link the offer cannot be tied to a position, which is why Delta on the HM tab can go negative. Attach the opening in Ashby and the row clears at the next refresh.'],
          ['Hired Missing Opening Link', 'The same gap on offers where the person has already been hired or the application is closed. Hiring Manager Joined does not depend on this link — it counts filled openings — but Recruiter Efficiency does: Joined on Non-Sales and Joining Conversion leave out people on an earlier quarter’s opening, and Sales and Others split Joined by the opening’s quarter. An unlinked joiner can never be judged either way.'],
          ['Selected Candidates Missing Source', 'People who <strong>joined</strong>, are <strong>joining</strong> or <strong>dropped after an offer</strong> in the selected quarter whose application in Ashby has no source, dated by the offer’s start date (or the day the offer was made, when there is no start date). The joiners are the same people Sourcing Mix shows under <em>(source not recorded)</em>. For selected candidates the <strong>Hiring Tracker is the source of truth</strong> — set the source in Ashby to match it.'],
          ['Roles Missing Score Inputs', 'Roles that score zero for the selected quarter — usually Tech/NonTech roles missing a Level. SME roles score on Complexity alone and PA by title, so a blank Level does not flag them; a blank Complexity counts as Normal. They add headcount but no Score anywhere on the dashboard. Set the Level on the job in Ashby.'],
          ['Openings Missing Opened Date', 'Openings with no <strong>opened date</strong> in Ashby. They are <strong>left out of Total Openings entirely</strong> \u2014 on Hiring Manager Positions and on Overall Efficiency \u2014 so they are invisible rather than merely undated. One row per opening. Set the date on the opening in Ashby.'],
          ['Capacity Not Set', 'Recruiters with a Capacity of 0 for the selected quarter who still have offers, hires or people in closing against their name. Their Goal and results still show in Fulfilment; only Capacity Utilisation cannot be worked out. Either the capacity belongs in <strong>Admin → Metric Configuration</strong>, or those candidates are attributed to the wrong person. <strong>Offers</strong> and <strong>Hired</strong> are all-time totals, so someone with only older work can appear here.'],
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
    intro: 'The same picture as the Hiring Manager tab, cut <strong>Department → Job</strong> and with a <strong>Score</strong> beside every count. Everything follows the Year/Quarter selector except Joining Pending, which is live. Positions are counted per quarter, so with Quarter on <em>All</em> this panel and Joining Conversion show the current quarter (the orange line under the filters says so), and with Year on <em>All</em> and a quarter picked they show that quarter of the latest year.',
    confirmed: 'Definitions confirmed with Jerin · 25 Aug 2026 · Joined = someone moved to Hired into the position 14 Sep 2026',
    groups: [
      {
        heading: 'The columns',
        items: [
          ['Total Positions', 'Distinct openings raised in the selected quarter, counted once each in the quarter they were opened.'],
          ['Joined', 'Those positions someone has been <strong>moved to Hired</strong> into \u2014 Ashby marks the opening <em>Filled</em>.'],
          ['Joining Pending', 'Everyone parked in <em>Ref Check</em>, <em>Documentation</em> or <em>Offer</em>, minus anyone whose opening belongs to an earlier quarter. Counts <strong>people</strong>. Live: it shows who is in closing today, and the quarter you pick only decides which openings count as earlier.'],
          ['Drop', 'Someone who reached <em>Ref Check</em>, <em>Documentation</em> or <em>Offer</em> and was then <strong>archived</strong> \u2014 declined, withdrew, or closed with the offer still open. Counted in the quarter they first got there, <strong>once</strong> per person. The small print is Drop \u00f7 (Joined + Joining Pending + Drop).'],
          ['Delta', 'Total Positions − Joined − Joining Pending. <strong>It can be negative, and that is allowed</strong> — it means more people are in closing than there are positions recorded, which happens when an offer was never linked to an opening. The bar fills with the shortfall; the line under it reads how much is covered — for example <em>30 of 40 · 75%</em> — or, when Delta is negative, how many more people are in closing than positions opened.'],
          ['Missed', 'Positions closed as <em>carry forward</em> to the next quarter.'],
          ['HC and Score', '<strong>HC</strong> is the count. <strong>Score</strong> weights it by how hard the role is (Family + Level + Complexity, from <strong>Admin → Metric Configuration</strong>). A role that scores zero — usually a Tech/NonTech role with no Level; SME roles score on Complexity alone and Program Advisor roles by title — is marked <em>unscored</em>: it still counts in HC but adds nothing to Score. It is the same test as Recruiter Efficiency → Data Hygiene → Roles Missing Score Inputs.'],
        ]
      },
      {
        heading: 'Charts and the Cases list',
        items: [
          ['The chart', 'One bar per department, stacked Joined / Joining Pending / Delta with the total on the end — the same three numbers as the table. Each section is split into the <strong>roles</strong> behind it &mdash; hover one to list them. The legend is at metric level — clicking one toggles that whole colour.'],
          ['A negative Delta on a chart', 'A bar cannot be drawn backwards, so a department with a negative Delta gets no Delta segment and its bar runs past its total. The number at the end of the bar and the tooltip’s <em>Total positions</em> are still the table’s Total, and the tooltip names the negative Delta.'],
          ['Joining Pending — Cases', 'Everyone in Ref Check, Documentation or Offer, scoped to the Department and Job filters. <strong>Candidate</strong> is the person, <strong>Sub-stage</strong> is which of Ref Check, Documentation or Offer they are in, and <strong>DOJ</strong> is the joining date. <strong>Opening</strong> reads <em>Not linked</em> when no opening is attached in Ashby, so that person cannot be tied to a position above. Those are the ones to fix first.'],
        ]
      },
    ],
    warnings: [
      ['Drop does not need an offer', 'Someone archived out of Ref Check or Documentation counts as a drop even if no offer was ever raised for them.'],
      ['Positions and people in the same row', 'Total Positions, Joined and Missed count <strong>positions</strong>. Joining Pending and Drop count <strong>people</strong>. One position can hold several people in closing, which is exactly why Delta is allowed to go negative.'],
      ['This table should agree with HM → Department Summary', 'Same definitions, same rules about which roles appear. The differences are presentation: this one adds Score to every column and drills from department to job.'],
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
          ['Whichever of these comes first', 'The candidate <strong>enters HM Review</strong>, or an <strong>assessment is triggered</strong> while they are sitting in the Online Assessment stage, or an <strong>R1 interview is booked</strong>.'],
          ['R1 is dated when the interview was BOOKED', 'Not the day it is held.'],
          ['Counted once per role, per quarter', 'Somebody already added is not counted again for that role in the same quarter. The count resets each quarter, so quarters do not add up to a year.'],
          ['Cancelled does not count', 'A cancelled interview booking or assessment is removed, which can take a count back off a past day.'],
        ]
      },
      {
        heading: 'Reading it',
        items: [
          ['Rows and columns', 'Department \u2192 Role down the side, the last 30 days of the selected date range across the top.'],
          ['Momentum from / Momentum to', 'Momentum is the one panel driven by these two dates rather than the Year/Quarter selector, and they change nothing else on the tab. It always shows the last 30 days of that range.'],
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
    confirmed: 'Definitions confirmed with Jerin · 30 Aug 2026',
    groups: [
      {
        heading: 'The columns',
        items: [
          ['One column per stage', 'Each cell reads <strong>assessed → progressed</strong>, with the percentage below it. <strong>Assessed</strong> means seen at the stage during the period — an interview actually held there, an assignment triggered there, or a feedback form (a select or reject) where no interview exists. Someone who only sat in the queue does not count. <strong>Ref Check, Documentation and Offer are counted differently</strong>: nobody is assessed at an administrative stage, so those three count the candidates <strong>added</strong> to the stage \u2014 the day they entered it. For Offer, progressed means they went on to be <strong>hired</strong>.'],
          ['Progressed', 'The second number in each cell: of those assessed, the ones who then reached a <strong>later stage</strong>. Being rejected or withdrawing does not count.'],
          ['%', 'Progressed ÷ Assessed — of the people actually assessed here, the share who moved forward. It cannot exceed 100%, because Progressed is a subset of Assessed.'],
          ['Overall', 'One span per candidate: assessed at <strong>R1 or Online Assessment</strong>, whichever came first, through to <strong>Ref Check, Documentation or Offer</strong>, whichever they reached first. Counted per person, never one stage column divided by another.'],
          ['Rows', 'Department, then the roles inside it. Click a department to open it.'],
          ['A dash', 'Nobody was assessed at that stage in the period. It is not a zero rate.'],
          ['Stage tick-boxes', 'Choose which stage columns appear, in the table and the chart.'],
          ['The period', 'Follows the Year/Quarter selector. With Quarter on <em>All</em> each cell adds up every quarter of the selected year, and with Year on <em>All</em> as well it covers all time.'],
          ['The chart', 'Department down the side, <strong>stage across the top</strong>. Each cell reads <strong>assessed \u2192 progressed</strong> with the rate below it, shaded by how many people it lost. The last column is the <strong>R1/OA \u2192 late stage</strong> span. A dot means nobody was assessed there. Hover for the counts, the rate and the loss.'],
          ['What the colour means', 'In the <strong>table</strong>, the shade is the throughput rate: under 50%, 50\u201370%, and 70% or more. In the <strong>chart</strong> above it, the shade is <strong>how many people that square lost</strong> \u2014 assessed there, then never reached a later stage \u2014 from white (0\u20139) to darkest (100 or more), while the number in the square is still the rate. Colour ranks what to fix; the number tells you the rate.'],
        ]
      },
    ],
    warnings: [
      ['Do not add the stage columns together', 'One person assessed at R1, R2 and R3 appears in all three, so a total across stages counts them three times. Each column is only comparable to its own assessed figure. That is also why the Overall column is a single per-candidate span rather than a sum.'],
      ['Rejections do not count as progress', 'Only people who reached a later stage count as progressed. Someone rejected or withdrawn at a stage counts as assessed there and not progressed.'],
      ['The columns are not a funnel — do not read them left to right', 'Each stage is measured on its own. One column’s <em>progressed</em> will not equal the next column’s <em>assessed</em>, and often will not come close. Three reasons, all real: candidates skip stages (most roles never use Hello Christy or HM Review), <em>progressed</em> means reaching <em>any</em> later stage rather than the next one, and each figure is dated by when the assessment happened — so somebody screened in June and interviewed in July lands in two different quarters. Compare a stage to itself over time, not to its neighbour.'],
      ['Online Assessment carries small numbers', 'Used, but thinly next to App Review and R1. Treat a single role’s OA conversion as indicative, not solid.'],
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
      ['Why the two figures are kept apart', 'Pooled into one median, the number would measure the calendar, not the process: anyone who never left the stage would count as \u201ctoday minus the day they applied\u201d, so an older quarter would always read higher just for being older.'],
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
          ['Joined', 'People <strong>moved to the Hired stage</strong>, dated by their <strong>start date</strong> (an accepted offer alone is not counted), minus anyone whose offer is linked to an <strong>earlier quarter\u2019s opening</strong>.'],
          ['Joining Pending', 'Everyone in <em>Ref Check</em>, <em>Documentation</em> or <em>Offer</em>, minus earlier-quarter openings. The same rule the Hiring Manager Positions card uses.'],
          ['Dropped', 'Reached Ref Check, Documentation or Offer and was then archived. The same list HM and the Recruiter tab use.'],
          ['Joining Conversion', '(Joined + Joining Pending) \u00f7 Offered \u2014 the share of everyone who reached an offer who has <strong>not</strong> fallen out.'],
          ['Rows', 'Department, then the roles inside it. People whose offer or case names a role Ashby\u2019s job list does not return still count, under their department (or <em>Unknown</em>), with <em>(no job recorded)</em> when there is no title \u2014 so Joining Pending here matches Fulfilment on this tab.'],
          ['The period', 'Per quarter, like Fulfilment: with Quarter on <em>All</em> it shows the current quarter.'],
          ['Chart', 'One bar per department, stacking Joined, Joining Pending and Dropped, with <strong>Offered</strong> at the end of the bar and the <strong>Joining conversion</strong> in its own labelled column down the right-hand edge. Each section is split into the <strong>roles</strong> behind it &mdash; hover one to list them.'],
        ]
      },
    ],
    warnings: [
      ['This measures drop-out, not joining', 'Joined and Joining Pending sit on <em>both</em> sides of the fraction, so they cancel: the figure is arithmetically <strong>1 \u2212 Dropped \u00f7 Offered</strong>. That is the intended question \u2014 <em>who have we lost?</em>'],
      ['Joining Pending is live; its neighbours are quarterly', 'It shows who is in closing <strong>today</strong>, so the same people sit inside every quarter\u2019s Offered \u2014 kept that way so the column matches the HM Positions card.'],
      ['How this compares with the Recruiter tab', 'The Recruiter tab\u2019s <em>Fulfilment</em> tables take no earlier-quarter subtraction on Joined for the Sales and Others pods. Pods do not exist on this tab, so here the subtraction is applied to every department \u2014 the same as the Recruiter tab\u2019s own Joining Conversion, which applies it to every pod.'],
    ]
  },
  'eff-sourcing': {
    summary: 'How these numbers are worked out',
    intro: 'Where the people who actually <strong>joined</strong> came from, <strong>Department → Job → Source type → Source</strong>.',
    confirmed: 'Definitions confirmed with Jerin · 30 Aug 2026',
    groups: [
      {
        heading: 'Reading it',
        items: [
          ['Joiners', 'People <strong>moved to the Hired stage</strong> for that role, whose <strong>start date</strong> falls in the selected period, counted against the source on their application. With Quarter on <em>All</em> it covers the whole selected year, and all time with Year on <em>All</em> as well — the line above the table names the period.'],
          ['%', 'Share of the level above — a source’s share of its type, a type’s share of the role, and so on.'],
          ['(source not recorded)', 'A joiner whose application carries no source. They are kept here rather than dropped, so the panel still adds up to the number of joiners. They are listed by name — with the people still joining and those who dropped after an offer — in <strong>Recruiter Efficiency → Data Hygiene → Selected Candidates Missing Source</strong>.'],
          ['Chart', 'One bar per source type, split into the individual sources inside it. The 12 biggest sources get their own colour; the rest are pooled as <em>All other sources</em>. It reads the same rows as the table, so the two can never disagree.'],
        ]
      },
    ],
    warnings: [
      ['This counts joiners, not applications', 'Deliberate: a channel can bring tens of thousands of applications and produce almost no one who starts.'],
      ['Counted by START DATE, and every joiner counts', 'Someone who accepted in June and starts in September counts in Q3, not Q2. <strong>One deliberate difference from Fulfilment and Joining Conversion on this tab:</strong> those two leave out people filling a position that was opened in an earlier quarter, because they answer “did we fill this quarter’s demand”. This panel asks which channels bring us people, so a joiner counts however long ago their position was raised — which is why its total runs a little higher.'],
    ]
  },

  'interviewer': {
    summary: 'How these numbers are worked out',
    intro: 'Interview load and feedback turnaround per panelist, built from the interviews actually scheduled in Ashby.',
    confirmed: 'Definitions confirmed with Jerin \u00b7 31 Aug 2026',
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
          ['The period', 'Follows the tab it sits on. On <strong>Hiring Manager</strong> it follows the From and To dates (which Year and Quarter fill in); on <strong>Overall Efficiency</strong> it follows Year and Quarter. Interview counts are kept by month, so a date range counts whole months.'],
          ['Chart', 'One bar per panelist for the 15 busiest in view, stacked by month — or by quarter until the data carries months.'],
        ]
      },
    ],
    warnings: [
      ['Only the interview count follows the period', 'Feedback Coverage and Avg Turnaround have no quarter breakdown in the data, so they are all-time and say so in the header. The interview count beside them does follow the period \u2014 which is why a department can show fewer interviews this quarter than it has feedback outstanding overall.'],
      ['Feedback figures are per person across everything you can see', 'Coverage is recorded per panelist, not per role. A department row rolls up its <strong>distinct</strong> panelists, so nobody is counted twice \u2014 but the figure still covers every interview those people sat anywhere you can see, not only this department\u2019s. The cards above the table have the same limit.'],
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
          ['Pod', 'Groups recruiters on the Recruiter Efficiency tab. A recruiter with <strong>no pod for the selected quarter is excluded from every row and total</strong> on that tab \u2014 they are listed under Data Hygiene \u2192 Pod Not Set. Use <strong>Others</strong> for anyone who works across pods \u2014 it groups and totals like a normal pod.'],
          ['Capacity', 'A Score, not a headcount \u2014 what that recruiter is expected to carry in that quarter. It sits beside the Goal on the Fulfilment tables and drives Capacity Utilisation. It is not the Goal: the Goal comes from the openings the recruiter owns in Ashby.'],
          ['Type', '<strong>Agency</strong>, <strong>Freelancer</strong> or <strong>Internal</strong>. A label only \u2014 it moves no number, because everyone follows the same credit rule. Ashby\u2019s <em>External Recruiter</em> flag sets the default (flagged = Freelancer, otherwise Internal), and anyone can change it here. Hover the box to see whether Ashby flags the account.'],
          ['Started on', 'The recruiter\u2019s first day, set once per person \u2014 not per quarter. A blank start means they count from the first quarter on record. Ashby does not record this, which is why it is kept here.'],
          ['Left on', 'Their last working day. Blank means still here. Someone who left part-way through a quarter still counts for that whole quarter.'],
          ['In quarter', 'Whether they count in the quarter chosen at the top, and why. With both dates blank, the Ashby account decides. Hover it to see which one decided.'],
          ['Ashby account', '<strong>Read from Ashby, not editable here.</strong> <em>Enabled</em> means the person holds an elevated recruiter licence (Recruiter or Recruiter Admin); <em>Unknown</em> means no Ashby user matched the name. It only decides who counts for people with no dates set; their past offers and hires still score either way.'],
          ['Quarter and copy-forward', 'The <strong>Quarter</strong> box picks which quarter you are editing. Pod, Capacity and the Score Grid are each stored per quarter; a quarter with no explicit setting inherits the nearest earlier one, and editing a quarter only changes that quarter. Started on, Left on and Type are per person, not per quarter.'],
          ['Show recruiters who weren’t here this quarter', 'Also lists recruiters outside their dates for the chosen quarter. Their saved Pod and Capacity are kept either way; this only changes what is listed.'],
          ['Role Score Grid', 'Each role classification maps to one tier, and each tier to a point value: edit the points in the header and pick one tier per row. The note beside the title says whether the quarter was edited or inherited. Reports score a role with the grid of the quarter being reported.'],
          ['Department → Family', 'Maps each Ashby department to a scoring family. Business departments score as <strong>PA</strong> only when the job title contains <em>Program Advisor</em> (a Senior Program Advisor scores as a regular PA, a Junior as PA Junior); otherwise they score as NonTech. <em>Exclude</em> scores zero.'],
          ['Level → Band · Complexity · Leadership override', 'Reference only. L7–L8 score as Leadership and L9 and above as Senior Leadership, in any family. A blank Complexity counts as Normal. Tech and NonTech roles with no Level score zero; SME roles score on Complexity alone.'],
        ]
      },
    ],
    warnings: [
      ['Edits are local until you publish', 'Changes apply in <strong>this browser</strong> immediately, and to nobody else. <strong>Publish to team</strong> writes the shared config everyone sees. The status line beside <strong>Publish to team</strong> says when this browser has unpublished changes. <strong>Download</strong> saves the file as a fallback.'],
    ]
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
          ['User type', '<strong>Hiring Manager</strong>, <strong>Recruitment Team</strong> or <strong>Admin</strong> — a label for grouping people and for the filter. It changes nothing about what they can see: Role, Tabs and Depts decide that. Someone with no saved label shows the one their role suggests (Admin ⇒ Admin, Restricted ⇒ Hiring Manager, otherwise Recruitment Team).'],
          ['User type and Invite status filters', 'Narrow the list below. <strong>Invited</strong> = an invite has been sent · <strong>Not invited</strong> = their access is published but no invite has gone · <strong>Not published yet</strong> = the access shown is not live, so no invite can be sent. The count beside them says how many people are shown.'],
          ['Send invite', 'Sends the invite email to that person <strong>straight away, after you confirm</strong> — nothing goes out automatically. It gives the dashboard link, says to sign in with their Interview Kickstart Google account, and describes <strong>only the access that person has</strong>. It is sent from the mailbox that runs the dashboard (currently jerin@interviewkickstart.com), signed TA Team, so replies go there. Greyed out until their access is <strong>published</strong>. Once sent, the row shows the date and who sent it, and the button becomes <em>Resend invite</em>.'],
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
    confirmed: 'Definitions confirmed with Jerin · 30 Aug 2026 · Joined positions = moved to Hired 14 Sep 2026',
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
          ['Positions by Department', 'The same positions as the Total Positions card, broken out by department. The six largest are listed and everything past them is summed on a final line, so the list always reconciles with the card above it.'],
          ['Top Jobs by Hired / by Applications', 'The roles with the most hires, and the most applications, in the period. <strong>By Hired under a quarter</strong> reads every role once the data file carries the per-quarter hire ranking; against an older file it falls back to that quarter’s busiest roles, so a role that hires well on very few applicants can be missing from it.'],
          ['Top Panelists by Interview Count', 'Who carried the interviewing load in the period.'],
        ]
      },
    ],
    warnings: [
      ['This card counts people; the interview tabs count interviews', 'Candidates Interviewed counts a person once. The <strong>Panelists</strong> tabs on Hiring Manager and Overall Efficiency count <strong>places on panels</strong> — a candidate seen three times by two people each is 1 here and 6 there. Both are right; they answer different questions, so never compare them directly.'],
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
