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
    intro: 'Everything on this page is built from Ashby <strong>openings</strong> (the seats) and <strong>offers</strong> (the people). Those two are counted differently, which is the single most common source of confusion here — see <em>Worth knowing</em> at the bottom.',
    confirmed: 'Definitions confirmed with Jerin · 24 Aug 2026',
    groups: [
      {
        heading: 'The six cards at the top',
        items: [
          ['Total Positions', 'How many <strong>seats</strong> were opened in the period you have selected. Each opening counts once, in the quarter it was opened — so a role opened in Q2 keeps counting toward Q2 for as long as it stays open. Seats marked <em>On Hold</em> or <em>Shelved</em>, and seats with no opening date recorded in Ashby, are left out.'],
          ['Joined', 'Seats from that set that have since been closed as <em>hired</em>.'],
          ['Open', 'Seats from that set still to fill.'],
          ['Missed', 'Seats closed with the reason <em>carry forward</em> — the hire did not happen in that quarter and moved to the next one.'],
          ['Joining Pending', 'Counts <strong>people</strong>, not seats: everyone sitting in <em>Ref Check</em>, <em>Documentation</em> or <em>Offer</em> right now, minus anyone whose opening was raised in an earlier quarter. It is a <strong>live</strong> figure — changing the date filter does not change it.'],
          ['Dropped', 'People who got as far as an offer and then left — they declined, they withdrew, or we archived them with the offer still open. Counted in the quarter the work was live, not the quarter the record was closed. The small print underneath is Dropped ÷ (Joined + Joining Pending + Dropped).'],
        ]
      },
      {
        heading: 'Department Summary — the columns',
        items: [
          ['Department', "Ashby's top-level department. Click the row to open the individual roles inside it."],
          ['Total Openings', 'Seats opened in the period, as above.'],
          ['Joined', 'Seats closed as hired.'],
          ['Joining Pending', 'People currently in Ref Check, Documentation or Offer — same rule as the card.'],
          ['Dropped', 'People who reached an offer and left, with their share of all outcomes underneath.'],
          ['Delta', 'Total Openings − Joined − Joining Pending. <strong>This can be negative, and that is allowed.</strong> A negative number means more people are in closing than there are seats recorded — which happens when an offer was never linked to an opening in Ashby. It shrinks as those links get fixed. The bar beside it fills with the shortfall, so the bar and the number always point the same way.'],
          ['Missed', 'Seats carried forward to the next quarter.'],
        ]
      },
      {
        heading: 'The chart',
        items: [
          ['One bar per department', 'The bar length is the seats opened in the period, split into <strong>Joined</strong>, <strong>Open</strong> and <strong>Missed</strong> — the three states every seat is in, so they always add up to Total Openings.'],
          ['Why Joining Pending and Dropped are not on it', 'Those two count people. Stacking them onto a bar made of seats would produce a total that means nothing.'],
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
      ['Seats and people are different units', 'Total Openings, Open and Missed count <strong>seats</strong>. Joining Pending and Dropped count <strong>people</strong>. One seat can have several people in closing against it, so never read across the row as if it were one running total.'],
      ['Joining Pending ignores the date filter', 'It always shows where things stand today. Everything else on this page follows the period you picked.'],
      ['A role only appears if it belongs here', 'It shows up when it had an opening in the period, or when someone is in closing on it. Roles with neither are not this period’s work and are left out.'],
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
