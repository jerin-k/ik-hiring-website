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
    intro: 'Built from Ashby <strong>openings</strong> &mdash; the positions being filled &mdash; and <strong>offers</strong> &mdash; the people. Openings count positions and offers count people, and that difference explains most of the confusion here.',
    confirmed: 'Settled with Jerin &middot; 24 Aug 2026. Latest: a recruiter level on the table, and the first column takes the row&rsquo;s colour &middot; 27 Sep 2026. An offer drop needs an offer &middot; 27 Sep 2026. Show levels belongs to this table; the other sub-tabs keep an Expand all tick &middot; 28 Sep 2026. People count against the recruiter who worked them &middot; 28 Sep 2026.',
    groups: [
      {
        heading: 'The cards and the columns',
        items: [
          ['Total openings', 'Positions opened on a day between <strong>From</strong> and <strong>To</strong>. Each counts once, in the quarter it opened, so a role opened in Q2 keeps counting toward Q2 while it stays open. Left out: positions marked <em>On Hold</em> or <em>Shelved</em>, and any with no opening date in Ashby.'],
          ['Joined', 'Positions someone has been <strong>moved to Hired</strong> into &mdash; Ashby then marks the opening <em>Filled</em>.'],
          ['Open', 'Positions from that set still to fill.'],
          ['Joining pipeline', '<strong>People</strong>, not positions: everyone in Ref Check, Documentation or Offer right now, less anyone whose opening was raised before the period. <strong>Live</strong> &mdash; it shows who is in closing today, and the period only decides which openings count as earlier.'],
          ['Offer drop', 'Someone who <strong>received an offer</strong> and then dropped out. Someone who left <strong>before any offer</strong> is not counted. Dated by the day they first reached Ref Check, Documentation or Offer, once per person. The small figure underneath is their share of all outcomes.'],
          ['Delta', 'Total openings &minus; Joined &minus; Joining pipeline. <strong>It can go below zero, and that is allowed</strong>: more people in closing than positions recorded, which happens when an offer was never linked to an opening. It shrinks as those links get fixed.'],
          ['Who is joining', 'The people behind <strong>Joining pipeline</strong> on that row, with their start date and stage. Counted the same way, so the names add up to the number. <strong>Live</strong>, like the column. Long lists fold into <em>+N more</em>.'],
          ['Who has joined', 'The people who <strong>actually started</strong> in the period &mdash; same test as the <strong>Joiners</strong> sub-tab. &#128681; <strong>The number of names can differ from Joined</strong>, and that is not a fault: Joined counts <strong>positions</strong> filled against this quarter&rsquo;s openings, while this counts <strong>people</strong> and leaves nobody out, including anyone filling an earlier position. For people on both sides, use Recruiter Efficiency.'],
          ['Remarks', 'A note against the <strong>role</strong>, not a candidate. It stays until somebody edits it, everybody sees the same one, and line breaks are kept. &#128681; It is saved to a file <strong>anyone with the link can read</strong>, so never put candidate names, salaries or contact details in it &mdash; an email address or a long number is refused. Amber, with <em>Unsaved &mdash; in this browser only</em>, means the server has not confirmed it yet.'],
        ]
      },
      {
        heading: 'The levels in the first column',
        items: [
          ['Show levels', 'Which levels the table is built from &mdash; <strong>Job</strong>, <strong>Recruiter</strong>, <strong>Topic</strong>, with Department always the top. It chooses which levels <strong>exist</strong>, not how deep it opens: switch one off and whatever sat under it hangs on the level above, so the rows still add up. The other sub-tabs have an <em>Expand all</em> tick instead.'],
          ['Recruiter', 'A position belongs to <strong>whoever owns it</strong> in Ashby. A <strong>person</strong> &mdash; joining, joined, or dropped after an offer &mdash; belongs to the <strong>recruiter who worked them</strong>, taken from the candidate&rsquo;s own hiring team &mdash; whatever position their offer happens to name. The recruiter rows always add up to the role above.'],
          ['(recruiter not set)', 'Positions with no recruiter recorded in Ashby, kept in their own row so the rows still add up. A gap to fix in Ashby &mdash; most of them name their recruiter in the position&rsquo;s own title.'],
          ['no position of their own here', 'A recruiter who worked somebody on this role but owns none of its positions &mdash; usually the same recording gap seen from the other side.'],
          ['Topic<span class=\"defs-tag\">SME - US and SME - India only</span>', 'In those two departments one role runs several topics at once, with a position for each. Everywhere else a role is one thing. A topic row adds up to the <strong>recruiter</strong> above it, not to the whole role. <strong>(topic not set)</strong> is the positions nobody has given a topic yet.'],
          ['Why some columns dash on a topic row', 'Only <strong>Total openings</strong> and <strong>Joined</strong> split by topic for everyone, because a position carries its own topic. <strong>Joining pipeline</strong> splits for people whose offer names an opening; the rest stay on the role row, so the two still add up. The <strong>names</strong> follow the same rule &mdash; a topic row lists the people it can claim, and the role row above says how many that is rather than repeating them. <strong>Offer drop</strong> and <strong>Delta</strong> dash, because most people who dropped cannot be placed under a topic. Both are right on the row above.'],
        ]
      },
      {
        heading: 'The filters and the chart',
        items: [
          ['Department and Job', 'Narrow every panel on this tab.'],
          ['From / To, Year and Quarter', 'The period. Year and Quarter fill in the dates; you can pick your own, but only <strong>inside that quarter</strong>. Every panel follows them <strong>to the day</strong>. Joining pipeline and the Interview Pipeline counts stay live; the Joining Pipeline sub-tab swaps these boxes for DOJ Month, From and To, and Interview Pipeline hides them. <strong>Nothing before Q3 2026 is offered.</strong>'],
          ['One bar per department', 'Bar length is the positions opened, split into <strong>Joined</strong>, <strong>Joining pipeline</strong> and <strong>Delta</strong> &mdash; the same figures as the columns. The first two split again into the roles behind them; hover to list them. Delta does not split, because it belongs to no single role. The number at the end is the table&rsquo;s <strong>Total openings</strong>, not the bands added up, because a negative Delta cannot be drawn.'],
        ]
      },
    ],
    warnings: [
      ['Positions and people are different units', 'Total openings and Joined count <strong>positions</strong>; Joining pipeline and Offer drop count <strong>people</strong>. One position can have several people in closing against it, so never read across a row as a running total.'],
      ['An offer drop needs an offer', 'Somebody archived before any offer was raised is <strong>not</strong> one. They came out on 27 Sep 2026 so that heads and points count the same people.'],
      ['Joining pipeline is live', 'Everything else here follows the period. The people behind it are listed on the <strong>Joining Pipeline</strong> sub-tab.'],
      ['A role only appears if it belongs here', 'It had an opening in the period, or somebody is in closing on it.'],
    ]
  },

  'hm-joiningpending': {
    summary: 'How this list is worked out',
    intro: 'One row per person currently in <em>Ref Check</em>, <em>Documentation</em> or <em>Offer</em> &mdash; the people behind the Joining Pipeline card on <strong>Position Fulfilment</strong>. A <strong>live</strong> list, so on this sub-tab Year, Quarter, From and To give way to <strong>DOJ Month</strong>, <strong>DOJ From</strong> and <strong>DOJ To</strong>.',
    confirmed: 'Settled with Jerin &middot; 24 Aug 2026. Latest: Opening and Topic as two columns, the opening by its full name &middot; 23 Sep 2026. Renamed Joining Pending to Joining Pipeline &middot; 27 Sep 2026.',
    groups: [
      {
        heading: 'The columns',
        items: [
          ['Joining date / person', 'A tree: <strong>joining month</strong>, then <strong>joining date</strong>, then the people, each heading carrying its own count. A month wholly in the past is tagged <em>Overdue</em>. Anyone with no date is kept in a final <strong>Date not set</strong> group, so the names always add up to the number.'],
          ['Sub-stage', 'Which of Ref Check, Documentation or Offer they are in now. The badge fills in one step at a time &mdash; Ref Check, Documentation, Offer Created, Offer Sent, Offer Accepted &mdash; so it darkens as they get closer to joining.'],
          ['Sourcer', 'Who <strong>sourced</strong> the candidate, when that was somebody other than the recruiter working the role. &#128681; <strong>A dash is the normal case, not a gap</strong> &mdash; almost every hire is sourced by the recruiter who worked it, and Ashby only holds this field when someone else did it. Today it is filled on <strong>3 rows across both lists</strong>. The head always stays with the recruiter (#108), so a name here never changes a count.'],
          ['Opening', 'The <strong>position</strong> they are tied to, by its full name. When it cannot be shown the cell says why: <em>no opening on the offer</em> (nobody has tied the offer to a position yet) or <em>not in this period</em>.'],
          ['Topic', 'On an <strong>SME</strong> role, the topic of the opening their offer names &mdash; what they were really hired for. Each reason it cannot be shown is a different job for a different person: <em>no opening on the offer</em> (link it), <em>opening has no topic</em> (set it &mdash; the list is in Data Hygiene), or <em>opening not in this period</em>. A plain dash means the role does not use topics, so nothing is missing.'],
          ['Opening quarter', 'The quarter of the opening they are tied to. A peach label marks one from an earlier quarter. <em>Not linked</em> means neither their offer nor Ashby&rsquo;s Openings screen names one; those are listed in <strong>Data Hygiene &rarr; Offers Missing Opening Link</strong>.'],
          ['Department, Job and Recruiter', 'The role, and the Recruiter on their hiring team in Ashby, initials in their pod&rsquo;s colour. <em>No recruiter</em> means none is tagged.'],
          ['DOJ Month, DOJ From and DOJ To', 'In the filter row on this sub-tab only, in place of Year, Quarter, From and To. They narrow the list by <strong>date of joining</strong>; either end of the range can be left empty. Anyone with <strong>no DOJ yet</strong> drops out while any is set.'],
        ]
      },
    ],
    warnings: [
      ['Slightly longer than the Joining Pipeline card', 'The same people, without the card&rsquo;s subtraction: the card leaves out anyone whose opening was raised before the period. This list shows everyone, so nobody is lost.'],
    ]
  },

  'hm-joiners': {
    summary: 'How this list is worked out',
    intro: 'One row per <strong>person</strong> who joined: moved to the <em>Hired</em> stage &mdash; an accepted offer alone does not count &mdash; with a <strong>start date</strong> between <strong>From</strong> and <strong>To</strong>, most recent first.',
    confirmed: 'Added with Jerin &middot; 15 Sep 2026. Latest: Opening and Topic as two columns, the opening by its full name &middot; 23 Sep 2026.',
    groups: [
      {
        heading: 'The columns',
        items: [
          ['Joining date / person', 'A tree: <strong>joining month</strong>, then <strong>joining date</strong>, then the people, each heading carrying its own count. Anyone with no date is kept in a final <strong>Date not set</strong> group, so the names always add up to the number.'],
          ['Opening', 'The <strong>position</strong> they are tied to, by its full name. When it cannot be shown the cell says <em>no opening on the offer</em> or <em>not in this period</em>.'],
          ['Sourcer', 'Who <strong>sourced</strong> the candidate, when that was somebody other than the recruiter working the role. &#128681; <strong>A dash is the normal case, not a gap</strong> &mdash; almost every hire is sourced by the recruiter who worked it, and Ashby only holds this field when someone else did it. Today it is filled on <strong>3 rows across both lists</strong>. The head always stays with the recruiter (#108), so a name here never changes a count.'],
          ['Topic', 'On an <strong>SME</strong> role, the topic of the opening their offer names. Where it cannot be shown the cell says why: <em>no opening on the offer</em>, <em>opening has no topic</em>, or <em>opening not in this period</em>. A plain dash means the role does not use topics.'],
          ['Opening quarter', 'The quarter of the opening they were <strong>hired into</strong>: the one on their offer, or the one picked when they were moved to Hired. A peach label marks one from before the quarter they started in.'],
          ['Department, Job and Recruiter', 'The role, and the Recruiter on their hiring team in Ashby, initials in their pod&rsquo;s colour for the quarter they started in.'],
        ]
      },
    ],
    warnings: [
      ['Not the same number as Joined on Position Fulfilment', 'That column counts <strong>positions</strong> filled, in the quarter each opening was opened. This counts <strong>people</strong>, on the day they started. Someone starting now on a position opened earlier is listed here but counts in that earlier quarter. Both are right.'],
      ['Everyone who joined is listed', 'Including people filling a position opened in an earlier quarter &mdash; the <strong>Opening quarter</strong> column shows who they are. There is no Sub-stage column, because Hired is a single stage.'],
    ]
  },

  'hm-throughput': {
    summary: 'How these numbers are worked out',
    intro: 'Of the people <strong>assessed</strong> at a stage, how many <strong>progressed</strong> to a later one. Built from real events in Ashby &mdash; interviews held, assignments triggered, feedback submitted &mdash; not from a snapshot of where people sit today.',
    confirmed: 'Rebuilt with Jerin &middot; 30 Aug 2026. Latest: only jobs with an opening opened in the period, and From / To to the day &middot; 15 Sep 2026.',
    groups: [
      {
        heading: 'Reading the squares',
        items: [
          ['One column per stage', 'Each cell reads <strong>assessed &rarr; progressed</strong>, with the rate below it. <strong>Assessed</strong> means seen at that stage in the period &mdash; an interview held there, an assignment triggered there, or a feedback form where no interview exists. <strong>Progressed</strong> means they then reached a <em>later</em> stage. <strong>Ref Check, Documentation and Offer are different</strong>: nobody is assessed at an administrative stage, so those three count the candidates <strong>added</strong> to the stage. For Offer, progressed means they went on to be <strong>hired</strong>.'],
          ['R1/OA &rarr; late', 'One span per candidate: assessed at <strong>R1 or Online Assessment</strong>, whichever came first, through to <strong>Ref Check, Documentation or Offer</strong>, whichever they reached first. Counted per person, never one column divided by another.'],
          ['What the colour means', 'The shade is <strong>how many people that square lost</strong> &mdash; assessed there, then never reached a later stage &mdash; on five steps from palest to darkest. <strong>Department</strong> and <strong>Total</strong> squares are blue on a darker band; <strong>job</strong> squares use the same steps in a lighter apricot. Colour ranks what to fix; the number is the rate.'],
          ['A dot', '<strong>Nobody was assessed</strong> at that stage in the period. It is not a zero rate, and it is not missing data.'],
          ['Rows', 'Each department is a row; click it to open the <strong>jobs</strong> inside it. <em>Expand all</em> opens every department. With more than one, <strong>Total</strong> is the last row.'],
          ['Which jobs are listed', 'Only jobs with an <strong>opening opened in a quarter the dates touch</strong> &mdash; the team does not work jobs whose opening was opened in an earlier quarter. The squares count only what happened <strong>between the two dates</strong>. An opening with no opened date does not count; those are listed in <strong>Data Hygiene</strong>.'],
          ['Stages and Hide zero-pipeline', 'The <strong>Stages</strong> dropdown chooses which columns appear; with nothing picked every stage shows. <em>Hide zero-pipeline</em> drops jobs with no movement in the period.'],
        ]
      },
    ],
    warnings: [
      ['The columns are not a funnel &mdash; do not read them left to right', 'Each stage is measured on its own. One column&rsquo;s <em>progressed</em> will not equal the next column&rsquo;s <em>assessed</em>, for three real reasons: candidates skip stages, <em>progressed</em> means reaching <em>any</em> later stage, and each figure is dated by when the assessment happened. Compare a stage to itself over time, not to its neighbour.'],
      ['Rejections do not count as progress', 'Someone rejected or withdrawn at a stage counts as assessed there and not progressed.'],
      ['A role with no movement reads empty, not its history', 'A role with no activity in the period shows dots rather than its all-time numbers.'],
      ['Not the same as Interview Pipeline', 'This counts movement <em>during</em> a period; that counts people <em>sitting</em> somewhere today. The two are not meant to tie out.'],
    ]
  },

  'hm-pipeline': {
    summary: 'How these numbers are worked out',
    intro: 'A <strong>live snapshot</strong>: where candidates stand right now. The one table on this page the period does not change, so From and To are hidden here. A deeper teal behind a number means more people, compared within that stage&rsquo;s column; zeros stay grey.',
    confirmed: 'Settled with Jerin &middot; 24 Aug 2026. Latest: From / To hidden here &middot; 17 Sep 2026.',
    groups: [
      {
        heading: 'Reading the table',
        items: [
          ['The numbers', 'How many candidates are in that stage <strong>today</strong>; archived candidates are left out. <strong>Hired</strong> is everyone hired on the role so far, because a hired candidate stays at Hired.'],
          ['Total', 'Every application the role ever had, <strong>archived ones included</strong> &mdash; so it is bigger than the stage columns added up. The same table on Recruiter Efficiency calls its first column <em>In pipeline</em> and adds the stages up instead; compare the stage columns between them, never those two.'],
          ['Department / Job', 'Department, then the roles inside it. Click to open. <em>Expand all</em> opens every department.'],
          ['What Year and Quarter do', 'They decide <strong>which roles are listed</strong> &mdash; only those with an opening in the period. Each role&rsquo;s own counts do not change.'],
          ['Hello Christy', 'The bot route into screening &mdash; an alternative to TA Screen, not a step before it. Low volume, so its column is often nearly empty.'],
          ['Stages and Hide zero-pipeline', 'The <strong>Stages</strong> dropdown chooses which columns appear. <em>Hide zero-pipeline</em> drops roles with nobody in the stages shown.'],
        ]
      },
    ],
    warnings: [
      ['Do not add it to the Throughput numbers', 'Throughput counts movement during a period; this counts people standing still today. Different questions, different totals.'],
      ['Online Assessment is thin, not empty', 'It is genuinely used, but its volumes are small next to App Review and R1, so read a single role&rsquo;s OA numbers with care.'],
    ]
  },

  'rec-fulfilment': {
    summary: 'How these numbers are worked out',
    intro: '<strong>Five tables, one per pod</strong> &mdash; Sales, SME-US, SME-India, Lateral and Others &mdash; the same shape, each with its own chart. Filter to one pod or recruiter and only their table stays. There is no <em>All</em> quarter here: goals, pods and capacity belong to a quarter. <strong>From</strong> and <strong>To</strong> narrow every column to the day, except Joining pipeline, which is live. While the <strong>Job</strong> filter is on, Capacity and Capacity used read a dash.',
    confirmed: 'Settled with Jerin &middot; 24 Aug 2026. Latest: five tables, one per pod, and a Delta that shows the surplus &middot; 25 Sep 2026. An offer drop needs an offer, and carries points on Lateral and Others &middot; 27 Sep 2026.',
    groups: [
      {
        heading: 'The two number types in every column',
        items: [
          ['Pod / Recruiter / Job / Topic', 'The four levels of the first column: pods, then the recruiters in them, then the roles each owns positions on, then &mdash; on the two SME departments only &mdash; the topic.'],
          ['Show levels', 'Unticking <strong>Topic</strong> takes the topic level away, so a role stops opening any further. The pod, the recruiter and the role are what this tab is, so they cannot be taken away here; the other sub-tabs have an <em>Expand all</em> tick in the same place.'],
          ['Heads<span class=\"defs-tag\">HC</span>', 'A count of people, or of positions for Goal. It always counts on the <strong>recruiter&rsquo;s</strong> row; what they sourced for someone else shows as a small <strong>+N sourced</strong> line instead.'],
          ['Score', 'The same count weighted by how hard the role is: Family, Level and the <strong>Complexity set on that opening</strong> &mdash; not on the job, since two openings on one job can differ. <strong>No Complexity means no points.</strong> Where a candidate has a sourcer, Joined, Joining pipeline and Offer drop split half and half. Goal never splits.'],
        ]
      },
      {
        heading: 'What each table is measured on',
        items: [
          ['Joiners or Offers', 'Sales, SME-US, SME-India and Others are measured on <strong>Joiners</strong>. Lateral is measured on <strong>Offers</strong> &mdash; everyone who received one, whether they started, are in closing, or dropped. That is why Lateral is the only table whose Delta also subtracts Offer drop.'],
          ['What counts as achieved', '<strong>Joined</strong> on Sales and Others &middot; <strong>Joined + Joining pipeline</strong> on SME-US and SME-India &middot; <strong>Joined + Joining pipeline + Offer drop</strong> on Lateral.'],
          ['Earlier quarters', 'SME-US, SME-India and Lateral leave out anyone tied to an <strong>earlier quarter&rsquo;s opening</strong>. Sales and Others count them, deliberately: their goal is joiners whenever the opening was raised.'],
          ['Capacity (NA) on Others', 'Agencies are given no capacity. Only the heading says NA; the cells are a dash.'],
        ]
      },
      {
        heading: 'The columns',
        items: [
          ['Goal', 'The <strong>openings you own</strong> that were opened in the period &mdash; where you are the Recruiter on the opening in Ashby. Each scores from its role and <strong>its own Complexity</strong>, and the number with none is named under the Score. Open, filled and carried-forward openings count; <strong>archived</strong> ones do not. Never shared, even where the opening has a sourcer.'],
          ['Capacity', 'What this recruiter is expected to carry in the quarter, as a <strong>Score</strong>, set by hand in <strong>Admin &rarr; Pod &amp; Capacity</strong>. 0 until somebody sets it; over part of a quarter, that share by days. Role rows dash, and so does every row while the Job filter or a department restriction narrows the numbers &mdash; capacity cannot be split by job.'],
          ['Joined', 'Candidates <strong>moved to the Hired stage</strong>, dated by their <strong>start date</strong>. An accepted offer alone is not counted.'],
          ['Joining pipeline', 'Everyone in <strong>Reference Check, Documentation or Offer</strong>. <strong>Live</strong> &mdash; the dates do not change it. Under the Score, <strong>N no score</strong> counts how many of those same people scored nothing, because their offer names no opening or that opening has no Complexity.'],
          ['Offer drop', 'Someone who <strong>received an offer</strong> and then dropped out. Someone who left <strong>before any offer</strong> is not counted. Dated by the day they first reached Ref Check, Documentation or Offer, once per person. On <strong>Lateral</strong> and <strong>Others</strong> it carries points, priced from the position its offer names; elsewhere it counts as a person only.'],
          ['Delta', 'Goal minus achieved, so a positive number is what is still to do. <strong>It goes below zero</strong>: over-delivery reads as a minus. That is what makes a recruiter&rsquo;s job rows add up to their own row.'],
          ['Capacity used', 'Achieved &divide; Capacity, both as Score. A dash where no capacity is set, or while a filter narrows the numbers. <strong>The colour runs the opposite way to Delta</strong>: over 100% reads well, under 70% is worth acting on.'],
        ]
      },
      {
        heading: 'How credit is shared with a sourcer',
        items: [
          ['The rule', 'Where somebody is tagged <strong>Sourcer on a candidate</strong>, the points for Joined, Joining pipeline and Offer drop split <strong>half and half</strong> with the recruiter &mdash; every department, whoever the sourcer is. With no sourcer the recruiter keeps the lot, which is the normal case.'],
          ['The Goal never splits', 'The recruiter keeps the full Goal even where the opening has a sourcer, so a shared role leaves a shortfall they close by landing more people. One exception: an opening with a sourcer and <strong>no recruiter</strong> gives its Goal to the sourcer.'],
          ['The head stays with the recruiter', 'Only the Score divides, so every HC column adds up to the real number of people. The <strong>+N sourced</strong> line counts what that person sourced for someone else, and is never added to the figure above it. Those people are <strong>named</strong> in the two people columns with a quiet <strong>sourced</strong> mark, so you can see who they are without the count moving.'],
          ['Two different tags, so two lines can disagree', 'Goal and Delta use the sourcer on the <strong>opening</strong> &mdash; who was briefed. Joined, Joining pipeline and Offer drop use the sourcer on the <strong>candidate</strong> &mdash; who found the person. Both are correct. The candidate&rsquo;s own source, agency or board or referral, changes nothing, and <strong>Agency / Freelancer / Internal</strong> is a label only.'],
        ]
      },
      {
        heading: 'Specialisation &mdash; SME - US and SME - India only',
        items: [
          ['What the level shows', 'In those two departments one role runs several topics at once, with a position for each. Open a pod, a recruiter, then an SME job and it splits by the <strong>topic on each position</strong>. A job opens when that recruiter owns a position with a topic, or has somebody in closing or already joined against one.'],
          ['What a topic row holds', 'The openings that recruiter owns in that topic, and their people whose <strong>offer names a position of it</strong>. A topic is listed whether or not they own a position in it, so <strong>nobody disappears</strong>; only somebody whose offer names no position stays on the job row. A <strong>0</strong> captioned <em>no openings of theirs</em> is a topic where they own nothing but have somebody in closing. <strong>(topic not set)</strong> is the positions nobody has given a topic yet.'],
          ['Why the rest dash', 'Capacity and Capacity used are set per recruiter and cannot be cut by topic. Offer drop dashes because most people who dropped cannot be placed under one, and Delta because it is a shortfall against a Goal. Both are right on the job row.'],
        ]
      },
      {
        heading: 'The people columns and the chart',
        items: [
          ['Who has joined &middot; Who is joining', 'The people behind Joined and Joining pipeline on that row. A pod or recruiter row shows a count; the names sit on the rows underneath. A person is named <strong>once</strong>, on the deepest row that can claim them &mdash; where a role splits by topic, the topic rows carry the names and the role row says <em>N under their topics</em>. &#9888; A name marked <strong>sourced</strong> is someone this person <strong>sourced for a colleague</strong>: the head stays with the recruiter who worked them, so that name is deliberately not in the count beside it. &#9888; On the <strong>Hiring Manager</strong> tab Joined counts <strong>positions</strong>, so there the names and the number can differ and both be right.'],
          ['Chart', 'One per table, in <strong>points</strong>. The bar is the points achieved, a solid line the <strong>Goal</strong>, a dashed line the <strong>Capacity</strong>, and a pale band fills any shortfall. Hover to list the roles behind it. Same figures as the table.'],
        ]
      },
    ],
    warnings: [
      ['No pod, no row', 'A recruiter with no pod is out of every row, total and chart here. Their numbers are in <strong>Data Hygiene &rarr; Pod Not Set</strong>. Somebody who works across pods should be given the <strong>Others</strong> pod.'],
      ['So is anyone not here this quarter', 'A recruiter counts between their <strong>Started on</strong> and <strong>Left on</strong> dates. People in closing still tagged to them are listed under <em>No recruiter in this view</em> on the Joining Pipeline sub-tab.'],
      ['Joining pipeline is lower here than on the Hiring Manager tab', 'These tables count a person only when their recruiter has a row here. Nobody is lost &mdash; the Joining Pipeline sub-tab lists them all.'],
      ['An opening with two owners is split', 'It divides equally between them. This is the only place a Goal shows a decimal.'],
      ['Roles that score zero', 'A role with no Level counts in HC but adds 0 to Score, so Score understates the work. The list is in <strong>Data Hygiene &rarr; Roles Missing Score Inputs</strong>.'],
    ]
  },

  'rec-joiningpending': {
    summary: 'How this list is worked out',
    intro: 'Every person in closing &mdash; <em>Ref Check</em>, <em>Documentation</em> or <em>Offer</em> &mdash; one row each, grouped <strong>Pod &rarr; Recruiter &rarr; Candidate</strong>. A <strong>live</strong> list: each person sits in their recruiter&rsquo;s pod for the quarter we are in today. On this sub-tab Year, Quarter, From and To give way to <strong>DOJ Month</strong>, <strong>DOJ From</strong> and <strong>DOJ To</strong>, and <em>Expand all</em> opens every pod and recruiter.',
    confirmed: 'Settled with Jerin &middot; 24 Aug 2026. Latest: Opening and Topic as two columns, the opening by its full name &middot; 23 Sep 2026. Renamed Joining Pending to Joining Pipeline &middot; 27 Sep 2026.',
    groups: [
      {
        heading: 'Reading it',
        items: [
          ['Pod / Recruiter / Candidate', 'Each person sits under their <strong>Recruiter</strong> in Ashby, inside that recruiter&rsquo;s pod, earliest joining date first, with a count beside each pod and recruiter. Anyone with no recruiter tagged, or whose recruiter this tab does not show, appears under <em>No recruiter in this view</em> with the reason beside their name &mdash; so the list accounts for everybody.'],
          ['Month and DOJ', 'The joining date and its month. It turns <strong>rose</strong> once the date has passed and they are still not moved to Hired. <em>Not set</em> when there is no DOJ yet.'],
          ['Sourcer', 'Who <strong>sourced</strong> the candidate, when that was somebody other than the recruiter working the role. &#128681; <strong>A dash is the normal case, not a gap</strong> &mdash; almost every hire is sourced by the recruiter who worked it, and Ashby only holds this field when someone else did it. Today it is filled on <strong>3 rows across both lists</strong>. The head always stays with the recruiter (#108), so a name here never changes a count.'],
          ['Sub-stage', 'Which of Ref Check, Documentation or Offer they are in now. The badge fills in one step at a time, so it darkens as they get closer to joining.'],
          ['Opening', 'The <strong>position</strong> they are tied to, by its full name. When it cannot be shown the cell says why: <em>no opening on the offer</em> or <em>not in this period</em>.'],
          ['Topic', 'On an <strong>SME</strong> role, the topic of the opening their offer names. Each reason it cannot be shown is a different job for a different person: <em>no opening on the offer</em> (link it), <em>opening has no topic</em> (set it &mdash; the list is in Data Hygiene), or <em>opening not in this period</em>. A plain dash means the role does not use topics.'],
          ['Opening quarter', 'The quarter of the opening they are tied to. A peach label marks one from an earlier quarter. <em>Not linked</em> when neither their offer nor Ashby&rsquo;s Openings screen names one.'],
          ['Department and Job', 'The role they are joining.'],
          ['DOJ Month, DOJ From and DOJ To', 'In the filter row on this sub-tab only. They narrow the list by <strong>date of joining</strong>; either end can be left empty. Anyone with <strong>no DOJ yet</strong> drops out while any is set.'],
        ]
      },
    ],
    warnings: [
      ['Longer than Joining pipeline on Position Fulfilment', 'Those tables count a person only against a recruiter with a row there, and three of the five pods also leave out anyone on an earlier quarter&rsquo;s opening. This list shows everyone.'],
    ]
  },

  'rec-joiners': {
    summary: 'How this list is worked out',
    intro: 'Everyone who joined &mdash; moved to the <em>Hired</em> stage (an accepted offer alone does not count), with a <strong>start date</strong> between <strong>From</strong> and <strong>To</strong> &mdash; one row each, grouped <strong>Pod &rarr; Recruiter &rarr; Candidate</strong>.',
    confirmed: 'Added with Jerin &middot; 15 Sep 2026. Latest: Opening and Topic as two columns, the opening by its full name &middot; 23 Sep 2026.',
    groups: [
      {
        heading: 'Reading it',
        items: [
          ['Pod / Recruiter / Candidate', 'Each person sits under their <strong>Recruiter</strong> in Ashby, inside that recruiter&rsquo;s pod for the selected quarter, most recent joining date first. Anyone with no recruiter tagged, or whose recruiter this tab does not show, appears under <em>No recruiter in this view</em> with the reason beside their name.'],
          ['Month and DOJ', 'The day they started, and its month.'],
          ['Sourcer', 'Who <strong>sourced</strong> the candidate, when that was somebody other than the recruiter working the role. &#128681; <strong>A dash is the normal case, not a gap</strong> &mdash; almost every hire is sourced by the recruiter who worked it, and Ashby only holds this field when someone else did it. Today it is filled on <strong>3 rows across both lists</strong>. The head always stays with the recruiter (#108), so a name here never changes a count.'],
          ['Opening', 'The <strong>position</strong> they are tied to, by its full name, or why it cannot be shown: <em>no opening on the offer</em> or <em>not in this period</em>.'],
          ['Topic', 'On an <strong>SME</strong> role, the topic of the opening their offer names, or why it cannot be shown. A plain dash means the role does not use topics.'],
          ['Opening quarter', 'The quarter of the opening they were <strong>hired into</strong>: the one on their offer, or the one picked when they were moved to Hired. A peach label marks one from before the quarter they started in.'],
          ['Department and Job', 'The role they joined.'],
        ]
      },
    ],
    warnings: [
      ['Everyone who joined is listed', 'There is no earlier-quarter subtraction, so a recruiter can list more people here than <strong>Joined</strong> on their Position Fulfilment table &mdash; the <strong>Opening quarter</strong> column shows who. These are the joiners <strong>Sourcing Mix</strong> counts. There is no Sub-stage column, because Hired is a single stage.'],
      ['One row per person, under the recruiter', 'Someone with a sourcer is still listed once, under their Recruiter &mdash; the same as the HC columns.'],
    ]
  },

  'rec-momentum': {
    summary: 'How these numbers are worked out',
    intro: 'How many candidates were <strong>added to the top of the funnel</strong> on each day &mdash; one row per person, not one per stage. A deeper teal square means more people added that day; weekends are greyed and a thin line marks each new week.',
    confirmed: 'Settled with Jerin &middot; 26 Aug 2026. Latest: every day From &rarr; To &middot; 17 Sep 2026.',
    groups: [
      {
        heading: 'What counts as being added',
        items: [
          ['Whichever comes first', 'The candidate <strong>enters HM Review</strong>, or an <strong>assessment is triggered</strong> while they sit in Online Assessment, or an <strong>R1 interview is booked</strong>. The first of the three is the day they were added.'],
          ['R1 is dated when the interview was BOOKED', 'Not the day it is held &mdash; booking is the piece of work, and the interview can be a week later.'],
          ['Counted once per role', 'Moving somebody on afterwards does not add to the number. This counts <em>people arriving</em>, not steps taken. The count resets each quarter, so quarters do not add up to a year.'],
          ['Cancelled does not count', 'A cancelled booking or assessment is removed, and if it was the only thing that put somebody in, the day ticks back down.'],
        ]
      },
      {
        heading: 'Reading it',
        items: [
          ['Pod / Recruiter / Job, and the day columns', 'Pod &rarr; Recruiter &rarr; Job, then one column per day. Every day of the selected range runs across the top, most recent first; a long range scrolls sideways. <strong>Hover a square</strong> to list the roles behind it.'],
          ['Total', 'Every day column beside it added up &mdash; the row&rsquo;s arrivals for the window shown, not for the whole quarter.'],
          ['Weekends', 'Saturday and Sunday dates are printed in a soft maroon. An empty weekend square is a weekend, not a bad day.'],
          ['Which jobs are listed', 'Only jobs with an <strong>opening opened in the selected period</strong> &mdash; the team does not work jobs whose opening was opened in an earlier quarter &mdash; and of those, only jobs with something to show. An opening with no opened date does not count; those are listed in <strong>Data Hygiene</strong>.'],
        ]
      },
    ],
    warnings: [
      ['This will not match Screening Efficiency', 'That panel counts every R1 action, including candidates who arrived earlier through HM Review. This counts <em>people entering the funnel</em>, by whichever signal came first. Two different questions.'],
      ['Assessments count from 8 July 2026', 'That is when the team began sending assessments through Ashby. Before it, a candidate could only be added by HM Review or an R1 booking.'],
    ]
  },

  'rec-screening': {
    summary: 'How these numbers are worked out',
    intro: 'What happens to candidates once they reach <strong>R1</strong> &mdash; how many were put into an R1 round, and how many went further.',
    confirmed: 'Settled with Jerin &middot; 29 Aug 2026. Latest: From / To narrows it to the day &middot; 15 Sep 2026.',
    groups: [
      {
        heading: 'The columns',
        items: [
          ['Added at R1', 'The candidate was <strong>actioned at R1</strong>, by either route: an <strong>interview was scheduled</strong> at R1, or an <strong>assignment was triggered</strong> while they sat at R1. Somebody with both counts once. Dated by the booking or the assignment going out, and counted when that day is between <strong>From</strong> and <strong>To</strong>.'],
          ['Progressed', 'Of those, the ones who reached <strong>R2 or beyond</strong> &mdash; any later round, Reference Check, Documentation or Offer &mdash; on or after that day.'],
          ['%', 'Progressed &divide; Added at R1.'],
          ['Counted once', 'One count per candidate per role per quarter, however many times they were booked. Cancelled interviews and assignments do not count at all.'],
          ['Pod / Recruiter / Job', 'Pod &rarr; Recruiter &rarr; Role. Only roles with R1 activity in the period are listed. Of those, only jobs with an <strong>opening opened in the selected period</strong> &mdash; the team does not work jobs whose opening was opened in an earlier quarter.'],
          ['Chart', 'A <strong>dumbbell</strong>: hollow dot = added at R1, solid dot = progressed past it, and the line between them is the drop-off. The axis runs down left to right on purpose, so it reads added &rarr; progressed. Hover a row to list its roles.'],
        ]
      },
    ],
    warnings: [
      ['It will not match Momentum&rsquo;s R1 either', 'Momentum credits R1 only when it was the candidate&rsquo;s <em>first</em> signal into the funnel. Here every R1 action counts, so Momentum&rsquo;s R1 is a subset of this one.'],
      ['HM Review and Online Assessment are not on this panel', 'By design &mdash; this one is about R1. Both still count towards <strong>Momentum</strong>.'],
    ]
  },

  'rec-joining': {
    summary: 'How these numbers are worked out',
    intro: 'Everyone who reached an offer, and what became of them. <strong>Offered = Joined + Joining pipeline + Offer drop</strong>, so the row always closes.',
    confirmed: 'Settled with Jerin &middot; 26 Aug 2026. Latest: a drop now means an offer drop &mdash; received an offer, then dropped out &middot; 27 Sep 2026.',
    groups: [
      {
        heading: 'The columns',
        items: [
          ['Pod / Recruiter', 'Pods, then the recruiters in them. Every figure below is a count of people.'],
          ['Offered', 'Joined + Joining pipeline + Offer drop &mdash; everyone who got as far as an offer.'],
          ['Joined', 'People <strong>moved to the Hired stage</strong>, dated by their <strong>start date</strong>, which must fall between <strong>From</strong> and <strong>To</strong>, minus anyone tied to an <strong>earlier quarter&rsquo;s opening</strong>. The same rule on every pod, Sales included &mdash; which is not what the Position Fulfilment tables do.'],
          ['Joining pipeline', 'Everyone in Ref Check, Documentation or Offer, minus earlier-quarter openings. Exactly the rule of the Joining Pipeline card on <strong>Hiring Manager &rarr; Position Fulfilment</strong>.'],
          ['Offer drop', 'Received an offer and then dropped out, counted when the day they first reached Ref Check, Documentation or Offer falls between <strong>From</strong> and <strong>To</strong>. Someone who left before any offer is not counted.'],
          ['Joining conversion', '(Joined + Joining pipeline) &divide; Offered &mdash; the share of everyone who reached an offer who has <strong>not</strong> fallen out.'],
          ['Who each person counts against', 'Every number here is a <strong>count of people</strong>, and each person counts <strong>whole</strong> against their <strong>recruiter</strong> &mdash; the same as the HC columns, whoever sourced the role.'],
          ['The chart', 'One bar per recruiter stacking Joined, Joining pipeline and Offer drop, with <strong>Offered</strong> at the end and <strong>Joining conversion</strong> in its own column. Each section splits into the roles behind it &mdash; hover to list them.'],
        ]
      },
    ],
    warnings: [
      ['This measures drop-out, not joining', 'Joined and Joining pipeline appear on both sides of the fraction, so they cancel: it is really <strong>1 &minus; Offer drop &divide; Offered</strong>. It sits near 96% and moves only when people fall out. That is the intended question &mdash; <em>who have we lost?</em>'],
      ['Joining pipeline is live; its neighbours are quarterly', 'It shows who is in closing <strong>today</strong>, so the same people sit inside every quarter&rsquo;s Offered. Kept that way so this column matches the Joining Pipeline card on the Hiring Manager tab.'],
      ['Recruiters with no pod are missing entirely', 'As everywhere on this tab &mdash; see <strong>Data Hygiene &rarr; Pod Not Set</strong>. Cross-pod recruiters belong in the <strong>Others</strong> pod.'],
      ['Joining pipeline is lower here than on the Hiring Manager tab', 'A person counts only against a recruiter with a row on this tab. They are all listed on the <strong>Joining Pipeline</strong> sub-tab under <em>No recruiter in this view</em>.'],
    ]
  },

  'rec-sourcing': {
    summary: 'How these numbers are worked out',
    intro: 'Where the people who actually <strong>joined</strong> came from. Each share is also drawn as a bar, in the source type&rsquo;s colour from the chart above.',
    confirmed: 'Settled with Jerin &middot; 29 Aug 2026. Latest: From / To narrows it to the day &middot; 15 Sep 2026.',
    groups: [
      {
        heading: 'Reading it',
        items: [
          ['Pod / Recruiter / Source type / Source name', 'Pod &rarr; Recruiter &rarr; Source type (<em>Job Portal</em>) &rarr; the specific source (<em>Naukri</em>, <em>LinkedIn</em>, <em>Employee Referral</em>).'],
          ['Joiners', 'People <strong>moved to the Hired stage</strong> whose <strong>start date</strong> falls between <strong>From</strong> and <strong>To</strong>, counted against the source on their application. <strong>Every</strong> joiner counts, including anyone filling a position opened in an earlier quarter &mdash; so this runs slightly ahead of the Position Fulfilment table, which leaves those out. The same people are named on the <strong>Joiners</strong> sub-tab.'],
          ['%', 'Share of the level above it &mdash; a source&rsquo;s share of its type, a type&rsquo;s share of the recruiter, a recruiter&rsquo;s share of the pod.'],
          ['(source not recorded)', 'A joiner whose application carries no source, kept here rather than dropped so the panel still adds up. They are named in <strong>Data Hygiene &rarr; Selected Candidates Missing Source</strong>.'],
          ['Chart', 'One bar per recruiter, stacked by source type. The six biggest types get their own colour and the rest are pooled as <em>All other types</em>. It reads the same joiners as the table.'],
        ]
      },
    ],
    warnings: [
      ['This counts joiners, not applications', 'Deliberate: a channel can bring tens of thousands of applications and produce almost nobody who starts, so counting applications made the loudest channel look like the best one.'],
      ['It will not match application counts anywhere else', 'A different unit, on purpose. Org-wide totals by department and role are on <strong>Overall Efficiency &rarr; Sourcing Mix</strong>.'],
    ]
  },

  'rec-tis': {
    summary: 'How these numbers are worked out',
    intro: 'How long each step actually takes. Every cell holds two things: the <strong>median days for candidates who finished the stage</strong>, and underneath in amber, <strong>how many are still sitting there</strong> and how long they have waited.',
    confirmed: 'Settled with Jerin &middot; 30 Aug 2026. Latest: From / To narrows it to the day &middot; 15 Sep 2026.',
    groups: [
      {
        heading: 'Reading it',
        items: [
          ['The number on top', 'Median days for candidates who <strong>left</strong> the stage &mdash; how long that step actually took. The only figure here you can compare between quarters. Hover a cell for the average and how many candidates it rests on.'],
          ['The two amber lines below', 'The people <strong>still sitting</strong> in that stage: how many, and the median days they have waited so far. Their clock is still running, so read it as a backlog to clear, not as how long the step takes. The label darkens the longer they have waited.'],
          ['A dash instead of a number', 'Nobody has finished that stage in the period. With an amber figure under it, everyone who arrived is still there.'],
          ['Red', 'Median above 5 days. Colour only &mdash; nothing is filtered out.'],
          ['Pod / Recruiter / Job', 'Pod &rarr; Recruiter &rarr; Job. A job row shows only <strong>that recruiter&rsquo;s own candidates</strong>, so the job rows add up to the recruiter row. Only jobs with an <strong>opening opened in the selected period</strong> are listed.'],
          ['TA Screen &rarr; Offer', 'Measured from real stage history &mdash; entered the stage to left the stage &mdash; for candidates who <strong>arrived</strong> between <strong>From</strong> and <strong>To</strong>.'],
          ['App Review<span class=\"defs-tag\">live</span>', 'Entirely a waiting pile: everyone <strong>currently sitting</strong> in App Review, measured as today minus their application date. Nobody in it has finished, so it always shows a dash over an amber figure. Marked with an orange asterisk.'],
          ['Hello Christy', 'The bot route into screening &mdash; an alternative to TA Screen, not a step before it. Low volume, so its column is often empty.'],
        ]
      },
    ],
    warnings: [
      ['Why the two figures are kept apart', 'Pooled into one median the number would measure the calendar, not the process: anyone who never left would count as today minus the day they applied, so an older quarter would always read higher just for being older.'],
      ['One column is not on the same clock as the others', 'App Review is live; every other stage follows the period. That is why it carries the asterisk &mdash; do not read across the row as one candidate&rsquo;s journey.'],
    ]
  },

  'rec-hygiene': {
    summary: 'What each of these lists is',
    intro: 'The compliance view: candidates, recruiters and roles the pipeline could not attribute cleanly. Pick a list on the left &mdash; its dot says whether it <strong>needs a fix</strong>, is <strong>for the record</strong> or has <strong>nothing to fix</strong>. Each is fixed <strong>in Ashby</strong> or in <strong>Admin &rarr; Pod &amp; Capacity</strong>, and its rows clear at the next refresh; every list downloads as CSV.',
    confirmed: 'Settled with Jerin &middot; 24 Aug 2026. Latest: the Job status column and its filter &middot; 19 Sep 2026.',
    groups: [
      {
        heading: 'What applies to every list',
        items: [
          ['Job status', 'Every list that names a job shows that job&rsquo;s status straight from Ashby &mdash; Open, Closed or Archived &mdash; so a row against a job nobody is recruiting for is easy to skip; closed and archived ones are greyed. <strong>The buttons above the table filter on it</strong>, changing the rows, the count and the CSV together. A row whose job cannot be identified appears only under <em>All</em>.'],
          ['Which filters apply', 'Pod, Recruiter, Job, From and To never apply here, so they are hidden on this sub-tab. <strong>Unassigned, Multiple Recruiters, Multiple Sourcers and both opening-link lists start on 1 July 2026</strong> and do not move with Year and Quarter, so a Q3 miss stays visible after Q3 ends. The selector does apply to Selected Candidates Missing Source, Pod Not Set, Capacity Not Set, Roles Missing Score Inputs, Jobs Recruiting Without an Opening and Recruiter Dates.'],
          ['Limited access', 'Someone whose access is limited to certain departments sees only those rows, and <em>Other Anomalies</em> leaves out unrecognised stage names for them, since a stage name carries no job.'],
        ]
      },
      {
        heading: 'The lists',
        items: [
          ['Unassigned', 'Candidates past App Review with <strong>no Recruiter tagged</strong>, active on or after 1 July 2026. Nobody is credited for this work until a Recruiter is tagged. It also lists everyone in <strong>Joining Pipeline</strong> with no Recruiter tagged, whatever their dates, because the Recruiter Efficiency tables cannot credit them; their Applied and Last activity are blank, because the Joining Pipeline record does not carry them.'],
          ['Multiple Recruiters', 'More than one Recruiter tagged on one application. Scoring credits only the first, so leave a single Recruiter of record.'],
          ['Multiple Sourcers', 'An application should never have more than one Sourcer &mdash; anything here is a straight data error.'],
          ['Selected Candidates Missing Source', 'People who <strong>joined</strong>, are <strong>joining</strong> or <strong>dropped after an offer</strong> whose application has no source. The joiners are the same people Sourcing Mix shows under <em>(source not recorded)</em>. For selected candidates the <strong>Hiring Tracker is the source of truth</strong> &mdash; set Ashby to match it.'],
          ['Recruiter Dates', 'Checks the dates against real work: <strong>work credited in a quarter outside someone&rsquo;s dates</strong> (the date or the credit is wrong), <strong>a disabled Ashby account with no Left on date</strong> (they still count every quarter), and <strong>recruiters with no Started on date</strong> (they count from the first quarter on record). Only the first two add to the count. The <strong>Work found</strong> column names what was credited in the quarter being checked.'],
          ['Pod Not Set', 'Recruiters who count in the quarter but have no pod. <strong>They are excluded from every table and chart on this tab</strong>, so this list is where their work is visible until somebody assigns one. Anyone who genuinely works across pods should be given <strong>Others</strong>.'],
          ['Capacity Not Set', 'Recruiters in a real pod whose capacity has <strong>never been entered</strong>, so Capacity used cannot be worked out for them. A capacity typed as 0 counts as entered. <em>Others</em> is left out.'],
          ['Offers Missing Opening Link', 'Offers still in play with <strong>no opening attached</strong>, from 1 July 2026. Without the link the offer cannot be tied to a position, which is why Delta on the Hiring Manager tab can go negative. Attach it in Ashby: View Offer &rarr; Update Offer &rarr; Opening.'],
          ['Hired Missing Opening Link', 'The same gap where the person is already hired or the application is closed &mdash; for the record rather than an alert. <strong>Somebody hired into an opening is not listed even when their offer names none</strong>, because that link is read from Ashby&rsquo;s Openings screen. What is left is closed applications and hires whose opening is genuinely unknown.'],
          ['Openings Missing Opened Date', 'Openings with no <strong>opened date</strong> in Ashby. They are <strong>left out of Total openings entirely</strong>, so they are invisible rather than merely undated. Set the date on the opening.'],
          ['Jobs Recruiting Without an Opening', '<strong>Open</strong> jobs with work in the quarter but <strong>no opening opened in it</strong>. The team does not work jobs whose opening is from an earlier quarter, so Momentum, Screening Efficiency, Throughput, Time in Process and Panelists leave these out &mdash; this is the only place their work shows. Create the quarter&rsquo;s opening, or set the opened date on an undated one. Its <strong>Openings in Ashby</strong> column says which it is: none at all, earlier quarters only, or an opening with no opened date.'],
          ['Roles Missing Score Inputs', 'Roles that score zero, usually Tech/NonTech roles missing a Level. SME roles score on Complexity alone and PA by title. <strong>Complexity is read from the opening, and an opening with none scores nothing.</strong> These roles add headcount but no Score anywhere.'],
          ['Other Anomalies', 'One-off attribution problems, including any Ashby stage name the pipeline does not recognise &mdash; the guard that catches a stage being renamed and silently dropped.'],
        ]
      },
    ],
    warnings: [
      ['Two entries in Other Anomalies are there by design', '<em>Hired</em> and <em>Archived</em> are not pipeline stages, so they always show as unmapped. They are a footnote, not an alert &mdash; an alert list topped by non-problems is one people stop reading.'],
      ['A dash instead of a count', 'Unassigned, Multiple Recruiters and Multiple Sourcers show a dash until the first refresh that carries the 1 July 2026 start &mdash; older data cannot be cut to it.'],
    ]
  },

  'eff-fulfilment': {
    summary: 'How these numbers are worked out',
    intro: 'The same picture as the Hiring Manager tab, cut <strong>Department &rarr; Job</strong> and with a <strong>Score</strong> beside every count. Everything follows Year and Quarter, narrowed to the day by <strong>From</strong> and <strong>To</strong>, except Joining pipeline, which is live. With Quarter on <em>All</em> the quarters of the selected year are added up, each quarter&rsquo;s positions scoring at that quarter&rsquo;s points.',
    confirmed: 'Settled with Jerin &middot; 25 Aug 2026. Latest: an offer drop needs an offer, and is priced from the position its offer names &middot; 27 Sep 2026. Show levels belongs to this table; the other sub-tabs keep an Expand all tick &middot; 28 Sep 2026. People count against the recruiter who worked them &middot; 28 Sep 2026.',
    groups: [
      {
        heading: 'The columns',
        items: [
          ['HC and Score', '<strong>HC</strong> is the count. <strong>Score</strong> weights it by how hard the role is &mdash; Family, Level and Complexity, from <strong>Admin &rarr; Scoring</strong>. A role that scores zero, usually one with no Level, is marked <em>unscored</em>: it counts in HC but adds nothing to Score.'],
          ['Total positions', 'Distinct openings raised in the period, on a day between <strong>From</strong> and <strong>To</strong>, counted once each in the quarter they were opened.'],
          ['Joined', 'Those positions someone has been <strong>moved to Hired</strong> into &mdash; Ashby marks the opening <em>Filled</em>.'],
          ['Joining pipeline', 'Everyone in <em>Ref Check</em>, <em>Documentation</em> or <em>Offer</em>, minus anyone whose opening was raised <strong>before the period starts</strong>. Counts <strong>people</strong>, and it is <strong>live</strong>: the period only decides which openings count as earlier. Under the Score, <strong>N no score</strong> counts how many of those same people scored nothing, because their offer names no opening or that opening has no Complexity. &#9888; This tab counts more of them than the Recruiter tab does, and both are right: here the rows are <strong>jobs</strong>, so people with no recruiter named are still counted.'],
          ['Offer drop', 'Someone who <strong>received an offer</strong> and then dropped out. Someone who left <strong>before any offer</strong> is not counted. Dated by the day they first reached Ref Check, Documentation or Offer, once per person. The small figure is their share of all outcomes. <strong>Points:</strong> priced from the position its offer names; an offer naming none scores nothing.'],
          ['Delta', 'Total positions &minus; Joined &minus; Joining pipeline. <strong>It can be negative, and that is allowed</strong> &mdash; more people in closing than positions recorded, which happens when an offer was never linked to an opening.'],
        ]
      },
      {
        heading: 'The levels in the first column',
        items: [
          ['Show levels', 'Which levels the table is built from &mdash; <strong>Job</strong>, <strong>Recruiter</strong>, <strong>Topic</strong>, with Department always the top. It chooses which levels <strong>exist</strong>, not how deep it opens: switch one off and whatever sat under it hangs on the level above, so the rows still add up. The other sub-tabs have an <em>Expand all</em> tick instead.'],
          ['Recruiter', 'A position belongs to <strong>whoever owns it</strong> in Ashby. A <strong>person</strong> &mdash; joining, joined, or dropped after an offer &mdash; belongs to the <strong>recruiter who worked them</strong>, taken from the candidate&rsquo;s own hiring team &mdash; whatever position their offer happens to name. The recruiter rows always add up to the role above, in the counts and the points.'],
          ['(recruiter not set)', 'Positions with no recruiter recorded in Ashby, kept in their own row so the rows still add up. A gap to fix in Ashby &mdash; most of them name their recruiter in the position&rsquo;s own title.'],
          ['no position of their own here', 'A recruiter who worked somebody on this role but owns none of its positions &mdash; usually the same recording gap seen from the other side.'],
          ['Topic<span class=\"defs-tag\">SME - US and SME - India only</span>', 'In those two departments one role runs several topics at once, with a position for each. The topic sits under the <strong>recruiter</strong>, and a topic row adds up to that recruiter. <strong>(topic not set)</strong> is the positions nobody has given a topic yet, kept so the topics still add up.'],
          ['Which columns split by topic', '<strong>Total positions</strong> and <strong>Joined</strong> split for everyone, in HC and Score, because a position carries its own topic. <strong>Joining pipeline</strong> splits for people whose offer names an opening of that topic; the rest stay on the job row, so the topics can come to less and never to more. <strong>Offer drop</strong> and <strong>Delta</strong> dash: most people who dropped cannot be placed under a topic. Both are right on the row above.'],
        ]
      },
      {
        heading: 'The people columns and the chart',
        items: [
          ['Who has joined', 'The people who actually <strong>started</strong> in the period, grouped by start date &mdash; the same list, on the same definition, as the <strong>Joiners</strong> sub-tab and the Hiring Manager tab, with <strong>no earlier-quarter subtraction</strong>. &#128681; It counts <strong>people</strong> while the Joined column beside it counts <strong>positions</strong>, so the two can differ and both be right.'],
          ['Who is joining', 'The people counted in <strong>Joining pipeline</strong> on the same row, with their joining date and sub-stage. Same rule as the column, so the names and the number agree. Where a role splits by topic, the <strong>topic rows carry the names</strong> and the row above says <em>N under their topics</em>, so nobody is listed twice in one open tree.'],
          ['Remarks', 'The note your team keeps against the <strong>role</strong>. <strong>Read-only here</strong> and written on the <strong>Hiring Manager</strong> tab &mdash; one note per role, read by both tabs, so this is the same note shown twice rather than a second copy that could drift.'],
          ['A department row shows a count, not a list', 'Naming everyone on the department row would repeat every name again on the role rows beneath it, so it says <em>N across M roles</em> instead. A topic row shows a dash, because those people are already named on the row above.'],
          ['The chart', 'One bar per department, stacked Joined / Joining pipeline / Delta with the total on the end &mdash; the same three numbers as the table. Each section splits into the <strong>roles</strong> behind it; hover to list them. A bar cannot be drawn backwards, so a department with a <strong>negative Delta</strong> gets no Delta segment; the number at the end is still the table&rsquo;s Total, and the tooltip names the negative Delta.'],
        ]
      },
    ],
    warnings: [
      ['Positions and people in the same row', 'Total positions and Joined count <strong>positions</strong>; Joining pipeline and Offer drop count <strong>people</strong>. One position can hold several people in closing, which is exactly why Delta is allowed to go negative.'],
      ['An offer drop needs an offer', 'Somebody archived before any offer was raised is <strong>not</strong> one. They came out on 27 Sep 2026 so that heads and points count the same people.'],
      ['This table should agree with the Hiring Manager tab', 'Same definitions, same rules about which roles appear. The differences are presentation: this one adds Score to every column.'],
    ]
  },

  'eff-joiningpending': {
    summary: 'How this list is worked out',
    intro: 'Everyone in <em>Ref Check</em>, <em>Documentation</em> or <em>Offer</em> right now, one row each. A <strong>live</strong> list, so on this sub-tab Year, Quarter, From and To give way to <strong>DOJ Month</strong>, <strong>DOJ From</strong> and <strong>DOJ To</strong>.',
    confirmed: 'Settled with Jerin &middot; 25 Aug 2026. Latest: Opening and Topic as two columns, the opening by its full name &middot; 23 Sep 2026. Renamed Joining Pending to Joining Pipeline &middot; 27 Sep 2026.',
    groups: [
      {
        heading: 'The columns',
        items: [
          ['Joining date / person', 'A tree: <strong>joining month</strong>, then <strong>joining date</strong>, then the people, each heading carrying its own count. A month wholly in the past is tagged <em>Overdue</em>; the date turns <strong>rose</strong> once it has passed and they are still not moved to Hired. Anyone with no date is kept in a final <strong>Date not set</strong> group, so the names always add up to the number.'],
          ['Sub-stage', 'Which of Ref Check, Documentation or Offer they are in now. The badge fills in one step at a time, so it darkens as they get closer to joining.'],
          ['Recruiter', 'The Recruiter on their hiring team in Ashby, initials in their pod&rsquo;s colour. <em>No recruiter</em> means none is tagged.'],
          ['Sourcer', 'Who <strong>sourced</strong> the candidate, when that was somebody other than the recruiter working the role. &#128681; <strong>A dash is the normal case, not a gap</strong> &mdash; almost every hire is sourced by the recruiter who worked it, and Ashby only holds this field when someone else did it. Today it is filled on <strong>3 rows across both lists</strong>. The head always stays with the recruiter (#108), so a name here never changes a count.'],
          ['Department and Job', 'The role they are joining.'],
          ['Opening', 'The <strong>position</strong> they are tied to, by its full name. When it cannot be shown the cell says why: <em>no opening on the offer</em> or <em>not in this period</em>.'],
          ['Topic', 'On an <strong>SME</strong> role, the topic of the opening their offer names. Each reason it cannot be shown is a different job: <em>no opening on the offer</em> (link it), <em>opening has no topic</em> (set it &mdash; the list is in Data Hygiene), or <em>opening not in this period</em>. A plain dash means the role does not use topics.'],
          ['Opening quarter', 'The quarter of the opening they are tied to. A peach label marks one from an earlier quarter. <em>Not linked</em> means neither their offer nor Ashby&rsquo;s Openings screen names one, so they cannot be counted against a position on Position Fulfilment &mdash; those are the ones to fix first.'],
          ['DOJ Month, DOJ From and DOJ To', 'In the filter row on this sub-tab only. They narrow the list by <strong>date of joining</strong>; either end can be left empty. Anyone with <strong>no DOJ yet</strong> drops out while any is set.'],
        ]
      },
    ],
    warnings: [
      ['Slightly longer than the Joining pipeline column', 'That column leaves out people on an opening raised before the period starts. This list shows everyone, so nobody is lost.'],
    ]
  },

  'eff-joiners': {
    summary: 'How this list is worked out',
    intro: 'Everyone who joined &mdash; moved to the <em>Hired</em> stage (an accepted offer alone does not count), with a <strong>start date</strong> between <strong>From</strong> and <strong>To</strong> &mdash; one row each, most recent first.',
    confirmed: 'Added with Jerin &middot; 15 Sep 2026. Latest: Opening and Topic as two columns, the opening by its full name &middot; 23 Sep 2026.',
    groups: [
      {
        heading: 'The columns',
        items: [
          ['Joining date / person', 'A tree: <strong>joining month</strong>, then <strong>joining date</strong>, then the people, each heading carrying its own count. Anyone with no date is kept in a final <strong>Date not set</strong> group, so the names always add up to the number.'],
          ['Recruiter', 'The Recruiter on their hiring team in Ashby, initials in their pod&rsquo;s colour.'],
          ['Sourcer', 'Who <strong>sourced</strong> the candidate, when that was somebody other than the recruiter working the role. &#128681; <strong>A dash is the normal case, not a gap</strong> &mdash; almost every hire is sourced by the recruiter who worked it, and Ashby only holds this field when someone else did it. Today it is filled on <strong>3 rows across both lists</strong>. The head always stays with the recruiter (#108), so a name here never changes a count.'],
          ['Department and Job', 'The role they joined.'],
          ['Opening', 'The <strong>position</strong> they are tied to, by its full name, or why it cannot be shown: <em>no opening on the offer</em> or <em>not in this period</em>.'],
          ['Topic', 'On an <strong>SME</strong> role, the topic of the opening their offer names, or why it cannot be shown. A plain dash means the role does not use topics.'],
          ['Opening quarter', 'The quarter of the opening they were <strong>hired into</strong>: the one on their offer, or the one picked when they were moved to Hired. A peach label marks one from before the quarter they started in. <em>Not linked</em> only when neither is known.'],
        ]
      },
    ],
    warnings: [
      ['Not the same number as Joined on Position Fulfilment', 'That column counts <strong>positions</strong> filled, in the quarter each opening was opened. This counts <strong>people</strong>, on the day they started. Both are right.'],
      ['Everyone who joined is listed', 'Including people filling a position opened before the period, so this matches the joiners on <strong>Sourcing Mix</strong> and can run ahead of <strong>Joined</strong> on Joining Conversion, which leaves those out. There is no Sub-stage column, because Hired is a single stage.'],
    ]
  },

  'eff-momentum': {
    summary: 'How these numbers are worked out',
    intro: 'How many candidates were <strong>added to the top of the funnel</strong> each day, across the whole org &mdash; one row per person, not one per stage. A deeper teal square means more people added that day; weekends are greyed and a thin line marks each new week.',
    confirmed: 'Settled with Jerin &middot; 29 Aug 2026. Latest: every day From &rarr; To &middot; 17 Sep 2026.',
    groups: [
      {
        heading: 'What counts as being added',
        items: [
          ['Whichever comes first', 'The candidate <strong>enters HM Review</strong>, or an <strong>assessment is triggered</strong> while they sit in Online Assessment, or an <strong>R1 interview is booked</strong>.'],
          ['R1 is dated when the interview was BOOKED', 'Not the day it is held.'],
          ['Counted once per role, per quarter', 'Somebody already added is not counted again for that role in the same quarter, and the count resets each quarter, so quarters do not add up to a year.'],
          ['Cancelled does not count', 'A cancelled booking or assessment is removed, which can take a count back off a past day.'],
        ]
      },
      {
        heading: 'Reading it',
        items: [
          ['Department / Job, and the day columns', 'Department &rarr; Role down the side, every day of the selected range across the top, most recent first; a long range scrolls sideways. <strong>Hover a square</strong> to list the roles behind it.'],
          ['Total', 'Every day column beside it added up &mdash; the window shown, not the whole quarter.'],
          ['Weekends', 'Saturday and Sunday dates are printed in a soft maroon. An empty weekend square is a weekend, not a bad day.'],
          ['Which jobs are listed', 'Only jobs with an <strong>opening opened in the selected period</strong> &mdash; the team does not work jobs whose opening was opened in an earlier quarter &mdash; and of those, only jobs with something to show. An opening with no opened date does not count; those are listed in <strong>Data Hygiene</strong>.'],
        ]
      },
    ],
    warnings: [
      ['This will not match Screening Efficiency', 'That panel counts every R1 action. This counts everyone entering the funnel, by whichever of the three signals came first.'],
      ['Assessments count from 8 July 2026', 'That is when the team began sending assessments through Ashby. Before it, a candidate could only be added by HM Review or an R1 booking.'],
    ]
  },

  'eff-screening': {
    summary: 'How these numbers are worked out',
    intro: 'What happens to candidates once they reach <strong>R1</strong>, by department &mdash; how many were put into an R1 round, and how many went further.',
    confirmed: 'Settled with Jerin &middot; 29 Aug 2026. Latest: From / To narrows it to the day &middot; 15 Sep 2026.',
    groups: [
      {
        heading: 'The columns',
        items: [
          ['Added at R1', 'The candidate was <strong>actioned at R1</strong>: an <strong>interview was scheduled</strong> at R1, or an <strong>assignment was triggered</strong> while they sat at R1. Somebody with both counts once, when that happened between <strong>From</strong> and <strong>To</strong>.'],
          ['Progressed', 'Of those, the ones who reached <strong>R2 or beyond</strong> &mdash; any later round, Reference Check, Documentation or Offer &mdash; on or after that day.'],
          ['%', 'Progressed &divide; Added at R1.'],
          ['Counted once', 'One count per candidate per role per quarter. Cancelled interviews and assignments do not count at all.'],
          ['Department / Job', 'Department &rarr; Role. Only roles with R1 activity in the period are listed, and of those only jobs with an <strong>opening opened in the selected period</strong>.'],
          ['Chart', 'A <strong>dumbbell</strong>: hollow dot = added at R1, solid dot = progressed past it, and the line between them is the drop-off. The axis runs down left to right on purpose, so it reads added &rarr; progressed. Hover a row to list its roles.'],
        ]
      },
    ],
    warnings: [
      ['HM Review and Online Assessment are not on this panel', 'By design &mdash; this one is about R1. Both still count towards <strong>Momentum</strong>, where they are two of the three ways a candidate enters the funnel.'],
    ]
  },

  'eff-throughput': {
    summary: 'How these numbers are worked out',
    intro: 'The full funnel, stage by stage, <strong>Department &rarr; Job</strong>. Of the people <strong>assessed</strong> at each stage, how many <strong>progressed</strong> to a later one.',
    confirmed: 'Rebuilt with Jerin &middot; 30 Aug 2026. Latest: only jobs with an opening opened in the period, and From / To to the day &middot; 15 Sep 2026.',
    groups: [
      {
        heading: 'Reading the squares',
        items: [
          ['One column per stage', 'Each cell reads <strong>assessed &rarr; progressed</strong>, with the rate below it. <strong>Assessed</strong> means seen at the stage in the period &mdash; an interview held there, an assignment triggered there, or a feedback form where no interview exists. Sitting in the queue does not count. <strong>Progressed</strong> means they then reached a <em>later</em> stage; being rejected or withdrawing does not. <strong>Ref Check, Documentation and Offer are different</strong>: nobody is assessed at an administrative stage, so those three count the candidates <strong>added</strong>. For Offer, progressed means they went on to be <strong>hired</strong>.'],
          ['%', 'Progressed &divide; Assessed. It cannot exceed 100%, because Progressed is a subset of Assessed.'],
          ['R1/OA &rarr; late', 'One span per candidate: assessed at <strong>R1 or Online Assessment</strong>, whichever came first, through to <strong>Ref Check, Documentation or Offer</strong>, whichever they reached first. Counted per person, never one column divided by another.'],
          ['What the colour means', 'The shade is <strong>how many people that square lost</strong> &mdash; assessed there, then never reached a later stage &mdash; on five steps from palest to darkest. <strong>Department</strong> and <strong>Total</strong> squares are blue on a darker band; <strong>job</strong> squares use the same steps in a lighter apricot. Colour ranks what to fix; the number is the rate.'],
          ['A dot', 'Nobody was assessed at that stage in the period. It is not a zero rate.'],
          ['Rows', 'Each department is a row; click it to open the <strong>jobs</strong> inside it. <em>Expand all</em> opens every department. With more than one, <strong>Total</strong> is the last row.'],
          ['Which jobs are listed', 'Only jobs with an <strong>opening opened in the selected period</strong> &mdash; the team does not work jobs whose opening was opened in an earlier quarter &mdash; and of those, only jobs with something to show. An opening with no opened date does not count; those are listed in <strong>Data Hygiene</strong>.'],
          ['The period', 'Follows Year and Quarter. With Quarter on <em>All</em> each cell adds up every quarter of the year, and with Year on <em>All</em> too, every quarter since Q3 2026. <strong>From</strong> and <strong>To</strong> narrow each cell to what happened between them.'],
          ['Stages and Hide zero-pipeline', 'The <strong>Stages</strong> dropdown chooses which columns appear. <em>Hide zero-pipeline</em> drops jobs with no movement in the period.'],
        ]
      },
    ],
    warnings: [
      ['The columns are not a funnel &mdash; do not read them left to right', 'Each stage is measured on its own. One column&rsquo;s <em>progressed</em> will not equal the next column&rsquo;s <em>assessed</em>, for three real reasons: candidates skip stages, <em>progressed</em> means reaching <em>any</em> later stage, and each figure is dated by when the assessment happened. Compare a stage to itself over time, not to its neighbour.'],
      ['Do not add the stage columns together', 'One person assessed at R1, R2 and R3 appears in all three, so a total across stages counts them three times. That is also why <strong>R1/OA &rarr; late</strong> is a single per-candidate span rather than a sum.'],
      ['A role with no movement reads empty, not its history', 'A role with no activity in the period shows dots rather than its all-time numbers.'],
      ['Online Assessment carries small numbers', 'Used, but thinly next to App Review and R1. Treat a single role&rsquo;s OA conversion as indicative, not solid.'],
    ]
  },

  // #145b (Jerin, 19 Sep 2026 - option A). The mirror of 'eff-pipeline', split by pod and recruiter. The one
  // thing it has to explain that the other does not is the untagged row: most of the pipeline has no
  // recruiter, and a reader who does not know that would misread every row under it.
  'rec-pipeline': {
    summary: 'How these numbers are worked out',
    intro: 'The same live snapshot as the Interview Pipeline panel on Overall Efficiency and the Hiring Manager tab &mdash; where candidates stand right now &mdash; split by <strong>pod, then recruiter, then job</strong>. The one table on this page the period does not change, so From and To are hidden here.',
    confirmed: 'Settled with Jerin &middot; 19 Sep 2026. Latest: renamed Pipeline to Interview Pipeline &middot; 27 Sep 2026.',
    groups: [
      {
        heading: 'Reading the table',
        items: [
          ['The numbers', 'How many candidates are in that stage <strong>today</strong>; archived candidates are left out. <strong>Hired</strong> is everyone hired on the role so far, because a hired candidate stays at Hired.'],
          ['In pipeline', 'The stage columns shown, added up &mdash; the people standing somewhere in the process right now. &#9888; Overall Efficiency&rsquo;s version of this table has a column called <strong>Total</strong> instead, meaning every application the role ever had, archived ones included. Compare the <em>stage</em> columns between the two, never those two.'],
          ['Pod / Recruiter / Job', 'Pods, then the recruiters in them, then the roles each is tagged on. A candidate counts for the recruiter tagged on <strong>that candidate</strong>, not on the job &mdash; half the live roles have more than one recruiter, so a job cannot be split any other way.'],
          ['No recruiter tagged', 'The last row: candidates with <strong>nobody tagged on them</strong>, most of them sitting in App Review where nobody has picked them up yet. They are shown rather than dropped so this panel adds up to the same total as the Overall Efficiency one. <strong>Use Data Hygiene to get them tagged.</strong>'],
          ['What Year and Quarter do', 'They decide <strong>which roles are listed</strong>. Each role&rsquo;s own counts do not change with them.'],
          ['Hello Christy', 'The bot route into screening &mdash; an alternative to TA Screen, not a step before it. Low volume, so its column is often nearly empty.'],
          ['Stages and Hide zero-pipeline', 'The <strong>Stages</strong> dropdown chooses which columns appear. <em>Hide zero-pipeline</em> drops anyone with nobody in the stages shown &mdash; which is also how you set App Review aside and see only the stages recruiters actively work.'],
        ]
      },
    ],
    warnings: [
      ['It will not match this tab&rsquo;s other panels', 'Everything else here measures what a recruiter <em>did</em> in a period. This measures where the pipeline <em>is</em>, today, including work nobody is credited for.'],
      ['Recruiter not listed on this tab', 'A second grey row, above the untagged one. These candidates <em>are</em> tagged &mdash; to somebody this tab leaves out, because they have left or have no pod set. They earn no row and no credit, but they are still standing in the process, so they are counted here.'],
      ['Time in Process answers &ldquo;how long&rdquo;', 'This table says how many people are at each stage, never how long they have been there.'],
    ]
  },

  'eff-pipeline': {
    summary: 'How these numbers are worked out',
    intro: 'The same live snapshot the Hiring Manager tab shows, on this tab&rsquo;s Department and Job filters: where candidates stand right now. The one table on this page the period does not change, so From and To are hidden here. A deeper teal behind a number means more people, compared within that stage&rsquo;s column; zeros stay grey.',
    confirmed: 'Settled with Jerin &middot; 24 Aug 2026. Latest: added to this tab &middot; 19 Sep 2026.',
    groups: [
      {
        heading: 'Reading the table',
        items: [
          ['The numbers', 'How many candidates are in that stage <strong>today</strong>; archived candidates are left out. <strong>Hired</strong> is everyone hired on the role so far, because a hired candidate stays at Hired.'],
          ['Total', 'Every application the role ever had, <strong>archived ones included</strong> &mdash; so it is bigger than the stage columns added up. The same table on Recruiter Efficiency calls its first column <em>In pipeline</em> and adds the stages up instead; compare the stage columns between them, never those two.'],
          ['Department / Job', 'Departments, then the roles inside them. Click a department to open it. <em>Expand all</em> opens every department.'],
          ['What Year and Quarter do', 'They decide <strong>which roles are listed</strong> &mdash; only those with an opening in the period. Each role&rsquo;s own counts do not change.'],
          ['Hello Christy', 'The bot route into screening &mdash; an alternative to TA Screen, not a step before it. Low volume, so its column is often nearly empty.'],
          ['Stages and Hide zero-pipeline', 'The <strong>Stages</strong> dropdown chooses which columns appear. <em>Hide zero-pipeline</em> drops roles with nobody in the stages shown.'],
        ]
      },
    ],
    warnings: [
      ['Do not add it to the Throughput numbers', 'Throughput counts movement during a period; this counts people standing still today. Different questions, different totals.'],
      ['Time in Process answers &ldquo;how long&rdquo;', 'This table says how many people are at each stage, never how long they have been there.'],
      ['Online Assessment is thin, not empty', 'It is genuinely used, but its volumes are small next to App Review and R1, so read a single role&rsquo;s OA numbers with care.'],
    ]
  },

  'eff-tis': {
    summary: 'How these numbers are worked out',
    intro: 'How long each step actually takes, <strong>Department &rarr; Job</strong>. Every cell holds two things: the <strong>median days for candidates who finished the stage</strong>, and underneath in amber, <strong>how many are still sitting there</strong> and how long they have waited.',
    confirmed: 'Settled with Jerin &middot; 30 Aug 2026. Latest: From / To narrows it to the day &middot; 15 Sep 2026.',
    groups: [
      {
        heading: 'Reading it',
        items: [
          ['The number on top', 'Median days for candidates who <strong>left</strong> the stage &mdash; how long that step actually took. The only figure here you can compare between quarters. Hover a cell for the average and how many candidates it rests on.'],
          ['The two amber lines below', 'The people <strong>still sitting</strong> in that stage: how many, and the median days they have waited so far. Their clock is still running, so read it as a backlog to clear, not as how long the step takes. The label darkens the longer they have waited.'],
          ['A dash instead of a number', 'Nobody has finished that stage in the period. With an amber figure under it, everyone who arrived is still there.'],
          ['Red', 'Median above 5 days. Colour only &mdash; nothing is filtered out.'],
          ['Department / Job', 'Department &rarr; Job. Only jobs with an <strong>opening opened in the selected period</strong> are listed.'],
          ['TA Screen &rarr; Offer', 'From real stage history &mdash; entered the stage to left the stage &mdash; for candidates who <strong>arrived</strong> between <strong>From</strong> and <strong>To</strong>.'],
          ['App Review<span class=\"defs-tag\">live</span>', 'Entirely a waiting pile: everyone <strong>currently sitting</strong> in App Review, measured as today minus their application date. Nobody in it has finished, so it always shows a dash over an amber figure. Marked with an orange asterisk.'],
          ['Hello Christy', 'The bot route into screening &mdash; an alternative to TA Screen, not a step before it. Low volume, so its column is often empty.'],
        ]
      },
    ],
    warnings: [
      ['Why the two figures are kept apart', 'Pooled into one median the number would measure the calendar, not the process: anyone who never left would count as today minus the day they applied, so an older quarter would always read higher just for being older.'],
      ['One column is not on the same clock as the others', 'App Review is live; every other stage follows the period. Do not read across a row as one candidate&rsquo;s journey.'],
    ]
  },

  'eff-joining': {
    summary: 'How these numbers are worked out',
    intro: 'Everyone who reached an offer, by department, and what became of them. <strong>Offered = Joined + Joining pipeline + Offer drop</strong>, so the row always closes.',
    confirmed: 'Settled with Jerin &middot; 29 Aug 2026. Latest: a drop now means an offer drop &mdash; received an offer, then dropped out &middot; 27 Sep 2026.',
    groups: [
      {
        heading: 'The columns',
        items: [
          ['Offered', 'Joined + Joining pipeline + Offer drop &mdash; everyone who got as far as an offer.'],
          ['Joined', 'People <strong>moved to the Hired stage</strong>, dated by their <strong>start date</strong>, which must fall between <strong>From</strong> and <strong>To</strong>, minus anyone whose opening was raised <strong>before the period starts</strong>.'],
          ['Joining pipeline', 'Everyone in Ref Check, Documentation or Offer, minus anyone on an opening raised before the period starts. The same rule as the Joining Pipeline card on the Hiring Manager tab.'],
          ['Offer drop', 'Received an offer and then dropped out, counted when the day they first reached Ref Check, Documentation or Offer falls between <strong>From</strong> and <strong>To</strong>. Someone who left before any offer is not counted.'],
          ['Joining conversion', '(Joined + Joining pipeline) &divide; Offered &mdash; the share of everyone who reached an offer who has <strong>not</strong> fallen out.'],
          ['Department / Job', 'Department, then the roles inside it. Someone whose offer names a role Ashby&rsquo;s job list does not return still counts, under their department, with <em>(no job recorded)</em> &mdash; so Joining pipeline here matches Position Fulfilment on this tab.'],
          ['Chart', 'One bar per department stacking Joined, Joining pipeline and Offer drop, with <strong>Offered</strong> at the end and <strong>Joining conversion</strong> in its own column. Each section splits into the roles behind it &mdash; hover to list them.'],
        ]
      },
    ],
    warnings: [
      ['This measures drop-out, not joining', 'Joined and Joining pipeline sit on <em>both</em> sides of the fraction, so they cancel: it is arithmetically <strong>1 &minus; Offer drop &divide; Offered</strong>. That is the intended question &mdash; <em>who have we lost?</em>'],
      ['Joining pipeline is live; its neighbours are quarterly', 'It shows who is in closing <strong>today</strong>, so the same people sit inside every quarter&rsquo;s Offered &mdash; kept that way so the column matches the Hiring Manager card.'],
      ['How this compares with the Recruiter tab', 'Its <em>Position Fulfilment</em> tables take no earlier-quarter subtraction on Joined for the Sales and Others pods. Pods do not exist on this tab, so here it is applied to every department &mdash; the same as the Recruiter tab&rsquo;s own Joining Conversion.'],
    ]
  },

  'eff-sourcing': {
    summary: 'How these numbers are worked out',
    intro: 'Where the people who actually <strong>joined</strong> came from, <strong>Department &rarr; Job &rarr; Source type &rarr; Source</strong>. Each share is also drawn as a bar; a source name&rsquo;s bar takes its colour from the chart above.',
    confirmed: 'Settled with Jerin &middot; 30 Aug 2026. Latest: From / To narrows it to the day &middot; 15 Sep 2026.',
    groups: [
      {
        heading: 'Reading it',
        items: [
          ['Joiners', 'People <strong>moved to the Hired stage</strong> for that role, whose <strong>start date</strong> falls between <strong>From</strong> and <strong>To</strong>, counted against the source on their application. With Quarter on <em>All</em> it covers the whole year; the line above the table names the period.'],
          ['Department / Job / Source type / Source name', 'Four levels: the department, the role, the source type (<em>Job Portal</em>) and the source itself (<em>Naukri</em>, <em>LinkedIn</em>).'],
          ['%', 'Share of the level above &mdash; a source&rsquo;s share of its type, a type&rsquo;s share of the role, and so on.'],
          ['(source not recorded)', 'A joiner whose application carries no source, kept here rather than dropped so the panel still adds up. They are named in <strong>Data Hygiene &rarr; Selected Candidates Missing Source</strong>.'],
          ['Chart', 'One bar per source type, split into the sources inside it. The 12 biggest get their own colour; the rest are pooled as <em>All other sources</em>. It reads the same rows as the table, so the two cannot disagree.'],
        ]
      },
    ],
    warnings: [
      ['This counts joiners, not applications', 'Deliberate: a channel can bring tens of thousands of applications and produce almost nobody who starts.'],
      ['Counted by START DATE, and every joiner counts', 'Someone who accepted in June and starts in September counts in Q3, not Q2. <strong>One deliberate difference from Position Fulfilment and Joining Conversion on this tab:</strong> those two leave out people filling a position opened in an earlier quarter, because they ask whether this quarter&rsquo;s demand was met. This panel asks which channels bring us people, so every joiner counts &mdash; which is why its total runs a little higher.'],
    ]
  },

  'interviewer': {
    summary: 'How these numbers are worked out',
    intro: 'Interview load and feedback turnaround per panelist, built from the interviews actually scheduled in Ashby.',
    confirmed: 'Settled with Jerin &middot; 31 Aug 2026. Latest: From / To narrows it to the day &middot; 15 Sep 2026.',
    groups: [
      {
        heading: 'The cards',
        items: [
          ['Total Interviews', 'Interview <strong>events</strong> &mdash; a two-person panel is one event. The line underneath gives the panel places behind them.'],
          ['Panel Slots', 'Shown instead when a Department, Job or Panelist filter is set: <strong>places on panels</strong>, so a panel of two counts twice.'],
          ['Panelists', 'Distinct people who sat on at least one interview in the view.'],
          ['Feedback Coverage and Avg Turnaround cards', 'The same measures as the columns below, across everyone in view, counted once each. Both are <strong>all-time</strong> and cover every interview those people sat that you can see, not only the filtered ones.'],
        ]
      },
      {
        heading: 'The columns',
        items: [
          ['Interviews', 'Places this panelist took on interview panels during the period. A department row adds up its panelists.'],
          ['Feedback Coverage', 'How often this panelist writes up an interview: the share of their interviews with feedback attached, with <strong>feedback received / interviews</strong> in brackets so the rate is never a bare percentage. From Ashby&rsquo;s own flag on each interview.'],
          ['Avg Turnaround', 'Time from an interview ending to the feedback being submitted, in hours under a day and in days above it. All-time; highlighted above 72 hours. A panelist&rsquo;s figure is the average of their per-role averages, a department&rsquo;s the average of its panelists&rsquo;.'],
          ['Department / Panelist / Job', 'Department &rarr; Panelist &rarr; the roles they interviewed for. Somebody who interviews for two departments has a row under each; the chart merges them, so a bar can be larger than any one of their rows.'],
          ['Which jobs are counted', 'Only interviews on jobs with an <strong>opening opened in a quarter the dates touch</strong> &mdash; the team does not work jobs whose opening was opened in an earlier quarter. Nothing reaches back before 1 July 2026.'],
          ['The period', 'The <strong>From</strong> and <strong>To</strong> dates of the tab it sits on. Interviews are counted by the <strong>day</strong> they were held, so a date range counts exactly its days.'],
          ['Chart', 'One bar per panelist for the 15 busiest in view, stacked by month. Inside a date range each month holds only its days between the two dates, so a bar adds up to that person&rsquo;s rows.'],
        ]
      },
    ],
    warnings: [
      ['Only the interview count follows the period', 'Feedback Coverage and Avg Turnaround have no quarter breakdown in the data, so they are all-time and say so in the header. That is why a department can show fewer interviews this quarter than it has feedback outstanding overall.'],
      ['Feedback figures are per person across everything you can see', 'Coverage is recorded per panelist, not per role. A department row rolls up its <strong>distinct</strong> panelists, so nobody is counted twice &mdash; but the figure still covers every interview those people sat anywhere you can see.'],
    ]
  },

  'admin-pods': {
    summary: 'How this page works',
    intro: 'Which pod each recruiter sits in, what they are expected to carry, and who counts in each quarter &mdash; used by <strong>Recruiter Efficiency</strong> and <strong>Overall Efficiency</strong>. Pod and Capacity are stored <strong>per quarter</strong> and copy forward until someone changes them.',
    confirmed: 'Settled with Jerin &middot; 30 Aug 2026. Latest: grouped by pod &middot; 17 Sep 2026.',
    groups: [
      {
        heading: 'Reading it',
        items: [
          ['Pod', 'Groups recruiters on the Recruiter Efficiency tab. A recruiter with <strong>no pod for the quarter is excluded from every row and total</strong> there &mdash; they are listed under Data Hygiene &rarr; Pod Not Set. Use <strong>Others</strong> for anyone who works across pods; it groups and totals like a normal pod.'],
          ['Capacity', 'A Score, not a headcount &mdash; what that recruiter is expected to carry in that quarter. It is <strong>not</strong> the Goal: the Goal comes from the openings they own in Ashby.'],
          ['Type', '<strong>Agency</strong>, <strong>Freelancer</strong> or <strong>Internal</strong>. A label only &mdash; it moves no number, because everyone follows the same credit rule. Ashby&rsquo;s <em>External Recruiter</em> flag sets the default, and anyone can change it here.'],
          ['Started on and Left on', 'Their first and last working day, set once per person rather than per quarter. A blank start means they count from the first quarter on record; a blank end means still here. Someone who left part-way through a quarter still counts for that whole quarter. Ashby does not record these, which is why they are kept here.'],
          ['In quarter', 'Whether they count in the chosen quarter, and why. With both dates blank, the Ashby account decides. Hover it to see which one did.'],
          ['Ashby account', '<strong>Read from Ashby, not editable here.</strong> <em>Enabled</em> means the person holds a recruiter licence; <em>Unknown</em> means no Ashby user matched the name. It only decides who counts for people with no dates set.'],
          ['Groups', 'Recruiters are grouped by <strong>pod</strong> for the chosen quarter, each heading counting its recruiters and adding up their Capacity. Changing someone&rsquo;s pod moves them into that group.'],
          ['Quarter and copy-forward', 'The <strong>Quarter</strong> box picks which quarter you are editing. Pod and Capacity are per quarter; a quarter with no explicit setting inherits the nearest earlier one, and editing one changes only that quarter. Started on, Left on and Type are per person.'],
          ['Show recruiters who were not here this quarter', 'Also lists recruiters outside their dates. Their saved Pod and Capacity are kept either way; this only changes what is listed.'],
        ]
      },
    ],
    warnings: [
      ['Edits are local until you publish', 'Changes apply in <strong>this browser</strong> immediately, and to nobody else. <strong>Publish to team</strong> writes the shared config everyone sees &mdash; one config with <strong>Scoring</strong>, so it sends the changes from both tabs. <strong>Download</strong> saves the file as a fallback.'],
    ]
  },

  'admin-grid': {
    summary: 'How scoring works',
    intro: 'How a role earns its points on <strong>Recruiter Efficiency</strong> and <strong>Overall Efficiency</strong>. The grid is stored <strong>per quarter</strong> and copies forward until someone changes it; <strong>Department &rarr; Family</strong> and <strong>Levels &amp; overrides</strong> are the same in every quarter.',
    confirmed: 'Settled with Jerin &middot; 30 Aug 2026.',
    groups: [
      {
        heading: 'Reading it',
        items: [
          ['A role&rsquo;s Score', '<strong>Family + Level + Complexity</strong> &rarr; the grid &rarr; points. Level comes from the job in Ashby and <strong>Complexity from the opening</strong>; Family is derived from the department and job title.'],
          ['Role Score Grid', 'Each role classification maps to one tier, and each tier to a point value: edit the points in the header and pick one tier per row. A deeper colour means more points. Reports score a role with the grid of the quarter being reported.'],
          ['Quarter and copy-forward', 'The <strong>Quarter</strong> box picks which quarter&rsquo;s grid you are editing. A quarter with no explicit grid inherits the nearest earlier one, and editing one changes only that quarter.'],
        ]
      },
    ],
    warnings: [
      ['Edits are local until you publish', 'Changes apply in <strong>this browser</strong> immediately, and to nobody else. <strong>Publish to team</strong> writes the shared config everyone sees &mdash; one config with <strong>Pod &amp; Capacity</strong>. <strong>Download</strong> saves the file as a fallback.'],
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
          ['Level → Band · Complexity · Leadership override', 'Reference only. L7–L8 score as Leadership and L9 and above as Senior Leadership, in any family. <strong>Complexity is read from the opening</strong>, and an opening with none scores nothing \u2014 it no longer counts as Normal. Tech and NonTech roles with no Level score zero; SME roles score on Complexity alone.'],
        ]
      },
    ],
  },

  'admin-access': {
    summary: 'How access works',
    intro: 'Who can open the dashboard and what they see. Sign-in is the person&rsquo;s <strong>@interviewkickstart.com Google account</strong>, matched on email.',
    groups: [
      {
        heading: 'Reading it',
        items: [
          ['Default access', 'What anyone signed in with an @interviewkickstart.com account gets when their email is not in the list below.'],
          ['Role', '<strong>Admin</strong>: every tab plus Admin. <strong>Full Access</strong>: every tab except Admin. <strong>Restricted</strong>: Overview plus the tabs you grant. <strong>None</strong>: access denied.'],
          ['Tabs', 'Restricted users only: Hiring Manager, Recruiter Efficiency and Overall Efficiency. Overview is always on; Admin can never be granted this way.'],
          ['Depts', 'Restricted users only; empty means all. <strong>Every figure</strong> on the three tabs, Panelists included, narrows to the jobs in those departments. <strong>Overview is never narrowed</strong> &mdash; it is for everyone. &#9888; Treat it as a convenience, not a privacy boundary: the data file behind the dashboard is public, so this changes what the page shows, not what can be read.'],
          ['User type', '<strong>Hiring Manager</strong>, <strong>Recruitment Team</strong>, <strong>Admin</strong> or <strong>Others</strong> &mdash; a label for grouping and filtering. It changes nothing about what they can see: Role, Tabs and Depts decide that.'],
          ['The two filters and the groups', '<strong>Invited</strong> = an invite has been sent &middot; <strong>Not invited</strong> = their access is published but no invite has gone &middot; <strong>Not published yet</strong> = the access shown is not live, so no invite can be sent. The list is grouped by user type, each heading showing how many it holds and how many have been invited.'],
          ['Send invite', 'Sends the invite email to that person <strong>straight away, after you confirm</strong> &mdash; nothing goes out automatically. It gives the dashboard link, says to sign in with their Interview Kickstart Google account, and describes <strong>only that person&rsquo;s access</strong>. Sent from the mailbox that runs the dashboard, signed TA Team, so replies go there. Greyed out until their access is <strong>published</strong>; once sent, the row shows the date and the button becomes <em>Resend invite</em>.'],
        ]
      },
    ],
    warnings: [
      ['Nothing changes for anyone until you publish', '<strong>Publish access</strong> writes the shared file everyone reads. Until then your edits are kept in <strong>this browser</strong> only: they survive a reload, nobody else sees them, and if somebody else publishes access meanwhile they are dropped rather than published over that change. <strong>Download</strong> saves access.json as a fallback.'],
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
    intro: 'The one-page summary. Everything follows Year and Quarter unless it says otherwise.',
    confirmed: 'Settled with Jerin &middot; 30 Aug 2026. Latest: Missed gone, and Joining pipeline now uses the Hiring Manager tab&rsquo;s people rule from one shared place &middot; 27 Sep 2026.',
    groups: [
      {
        heading: 'The cards',
        items: [
          ['Total Positions', 'Positions opened in the period, counted once each in the quarter they were opened. The line underneath splits them into <strong>joined</strong>, <strong>joining pipeline</strong> and <strong>delta</strong>, where delta is Total &minus; Joined &minus; Joining pipeline and can be <strong>negative</strong> &mdash; more people in closing than positions opened, which is true today and shown rather than hidden. <strong>Joining pipeline is the same figure as the Hiring Manager tab&rsquo;s</strong>: both read one rule, so they cannot disagree.'],
          ['Fill Rate', 'Positions joined &divide; positions opened, for the period. A position counts as joined once someone has been <strong>moved to Hired</strong> into it.'],
          ['Applications', 'Candidates who applied in the period.'],
          ['Candidates Interviewed', 'Distinct <strong>people</strong> assessed in the period &mdash; once each, whether they sat one interview or five, within a quarter. A whole year is the quarters added up unless the data carries a year-level count, so somebody interviewed in two quarters can count twice; the card says so when that is what you are looking at. It includes candidates who took an <strong>online assessment</strong> as well as those who met a panel, combined by person rather than added.'],
          ['Total Interviews Managed', 'Shown in place of Candidates Interviewed only when the data has no per-person count: interview events in the period, with the number of panelists underneath.'],
          ['Applications Hired', 'Applications made in the period that are now at <strong>Hired</strong>, with their share of the period&rsquo;s applications underneath. It follows the <strong>application</strong>, so it is neither the positions joined nor the people who started in the period, and will not match either.'],
        ]
      },
      {
        heading: 'The rest of the page',
        items: [
          ['Interview Pipeline', 'Applied &rarr; Screened &rarr; Interviewed &rarr; Offered &rarr; Hired for the period. Each band is how many candidates reached that point, so the bands step down.'],
          ['Positions by Department', 'The same positions as the Total Positions card, by department. The six largest are listed and the rest summed on a final line, so the list always reconciles with the card. <strong>Deep teal is joined, pale slate is joining pipeline, dusty rose is delta</strong> &mdash; the same three bands, in the same order, as the Hiring Manager chart. A <strong>negative</strong> delta draws no band; the figures above the bar still show it. &#9888; A department can show <strong>joining pipeline with no positions opened</strong>, because people in closing are counted whether or not a position was raised for them.'],
          ['Top Jobs by Hired / by Applications', 'The roles with the most hires, and the most applications, in the period. The grey tag under a job is its department, and the line under the title adds up the jobs listed.'],
          ['Top Panelists by Interview Count', 'Who carried the interviewing load. The grey tag under a name is the department they <strong>interviewed for most</strong> &mdash; Ashby gives a person no department, so it comes from the jobs behind their interviews; &ldquo;+1&rdquo; means they also interviewed for another.'],
          ['Rank badges and links', 'The top three in each list wear a filled badge. The link at the foot of a card opens the tab behind it, and shows only if you can open that tab.'],
        ]
      },
    ],
    warnings: [
      ['This card counts people; the Panelists tabs count interviews', 'Candidates Interviewed counts a person once. The <strong>Panelists</strong> panels count <strong>places on panels</strong> &mdash; a candidate seen three times by two people each is 1 here and 6 there. Both are right, so never compare them directly.'],
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
  { id: 'notopic', group: 'Offers & openings', name: 'Openings Missing a Topic', sub: 'On SME roles that use topics elsewhere', scope: 'quarter', unit: 'openings',
    why: 'Anyone hired, or in Reference Check / Documentation / Offer, against one of these sits under “(topic not set)” instead of the topic they were really for — so no single topic can be judged on its own. Only roles where OTHER openings already carry a topic are listed: a role that does not use topics at all is not a gap (Jerin, 23 Sep 2026).', fix: ['Ashby', 'Job', 'Openings', 'Specialization/Topic'] },
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
