/**
 * "How can a startup get funding?" — the roadmap and the ten guides behind it.
 *
 * Hand-authored, structured content in the same shape `lib/blog.ts` uses, for
 * the same reasons: no CMS, version-controlled prose, and blocks a page can
 * render without a markdown parser.
 *
 * A note on what these are for. A funding section whose educational half is
 * generic filler is worse than one with no educational half — it makes the data
 * half look like SEO bait too. So each guide is written to be the thing a
 * founder would actually want to have read before the meeting: specific numbers
 * where numbers exist, Indian instruments and regulators named where they
 * apply, and the awkward parts (what a liquidation preference does, what a
 * safe-looking term costs) said plainly rather than skipped.
 *
 * Framework-agnostic and client-safe.
 */

export type GuideBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; text: string }
  | { type: "list"; items: string[] }
  | { type: "callout"; text: string };

export type FundingGuide = {
  slug: string;
  title: string;
  /** One sentence; used on the index, the meta description and the card. */
  excerpt: string;
  readingMinutes: number;
  /** Which step of the roadmap this guide belongs to, for cross-linking. */
  step: number;
  body: GuideBlock[];
};

/** The visual roadmap on /funding. Ten steps, each linked to its guide. */
export const FUNDING_ROADMAP: {
  step: number;
  title: string;
  summary: string;
  guideSlug?: string;
}[] = [
  {
    step: 1,
    title: "Validate the idea",
    summary:
      "Find ten people with the problem who will talk to you, and one who will pay before you have built anything. Validation is evidence of demand, not agreement that the idea sounds good.",
  },
  {
    step: 2,
    title: "Build an MVP",
    summary:
      "The smallest thing that lets someone get the outcome they wanted. Scope it to what you can put in front of a user in weeks, not quarters — the point is to learn what you were wrong about.",
  },
  {
    step: 3,
    title: "Get initial traction",
    summary:
      "Usage that repeats without you pushing it. Retention, revenue and referral are the three that survive scrutiny; downloads, signups and waitlist size do not.",
    guideSlug: "what-investors-look-for",
  },
  {
    step: 4,
    title: "Prepare your financials",
    summary:
      "Know your burn, your runway, your unit economics and your cap table to the rupee. You will be asked all four in the first meeting.",
    guideSlug: "how-much-funding-should-a-startup-raise",
  },
  {
    step: 5,
    title: "Build the pitch deck",
    summary:
      "Ten to twelve slides that make the argument in order: problem, insight, product, evidence, market, plan, team, ask.",
    guideSlug: "how-to-create-a-startup-pitch-deck",
  },
  {
    step: 6,
    title: "Identify the right investors",
    summary:
      "Stage, sector and cheque size have to match before anything else matters. A brilliant pitch to a fund that does not write your cheque is a wasted month.",
    guideSlug: "how-to-find-vcs-in-india",
  },
  {
    step: 7,
    title: "Start outreach",
    summary:
      "Warm introductions convert several times better than cold email. Build the list, find the paths, and run the process in parallel rather than one fund at a time.",
    guideSlug: "how-to-approach-angel-investors",
  },
  {
    step: 8,
    title: "Run due diligence",
    summary:
      "Diligence is a document exercise you can be ready for months early. Being ready is itself a signal.",
    guideSlug: "how-to-prepare-for-due-diligence",
  },
  {
    step: 9,
    title: "Negotiate the terms",
    summary:
      "Valuation is the number founders watch and rarely the term that costs them most. Read the preference, the pool and the control rights first.",
    guideSlug: "startup-valuation-basics",
  },
  {
    step: 10,
    title: "Close the round",
    summary:
      "Signed documents, money received, filings made. In India that includes the Companies Act paperwork and, for a foreign investor, the FEMA reporting — none of which is optional.",
    guideSlug: "common-fundraising-mistakes",
  },
];

export const FUNDING_GUIDES: FundingGuide[] = [
  {
    slug: "how-to-create-a-startup-pitch-deck",
    title: "How to create a startup pitch deck",
    excerpt:
      "Ten to twelve slides, in the order that makes the argument. What each one has to prove, and the three that decide whether the rest get read.",
    readingMinutes: 7,
    step: 5,
    body: [
      {
        type: "paragraph",
        text: "A pitch deck is not a description of your company. It is an argument that a specific, large outcome is likely, and that you are the people it will happen to. Every slide either advances that argument or is costing you attention.",
      },
      { type: "heading", text: "The order that works" },
      {
        type: "list",
        items: [
          "Problem — who has it, how often, and what it costs them today. Name a person, not a market segment.",
          "Insight — what you know about this problem that most people do not. This is the slide that makes an investor lean in, and the one most decks skip.",
          "Product — what it does, in one screenshot and one sentence. Not a feature list.",
          "Traction — the evidence. Retention curve, revenue, cohort behaviour. Put it early if it is good.",
          "Market — how you get to a large number from the bottom up. Top-down TAM slides are discounted to zero by anyone who has seen a few hundred decks.",
          "Business model — what you charge, to whom, and what it costs you to serve them.",
          "Competition — who else solves this, including the spreadsheet and the status quo. Positioning, not a checkbox grid you win.",
          "Go-to-market — the specific channel that works, and why it keeps working as you scale it.",
          "Team — why these founders. Relevant, specific, and short.",
          "The ask — how much, over what runway, and the milestones it buys.",
        ],
      },
      { type: "heading", text: "The three slides that decide it" },
      {
        type: "paragraph",
        text: "Traction, insight and team. An investor reading a deck cold is asking three questions in this order: is this working, is there a reason it will keep working, and are these the people. Everything else is context for those answers. If your traction is thin, your insight has to be sharper and your team slide has to earn more.",
      },
      { type: "heading", text: "Practical things that matter more than they should" },
      {
        type: "list",
        items: [
          "One idea per slide, stated in the headline. The headline should carry the point even if nobody reads the body.",
          "Numbers with their denominators. \"40% month-on-month growth\" from a base of ten users is a rounding error, and an investor will assume the worst if you make them ask.",
          "A PDF, not a link that tracks them. Send the thing they can forward to a partner.",
          "An appendix. Detailed cohort tables, the full model and the competitive teardown belong after the ask, ready for the second meeting.",
        ],
      },
      {
        type: "callout",
        text: "Send the deck before the meeting, not after. A partner who has read it arrives with questions about your business; one who has not spends the call being walked through slides.",
      },
    ],
  },

  {
    slug: "how-much-funding-should-a-startup-raise",
    title: "How much funding should a startup raise?",
    excerpt:
      "Size the round to the milestone, not to the market. How runway, burn and the next round's bar decide the number.",
    readingMinutes: 6,
    step: 4,
    body: [
      {
        type: "paragraph",
        text: "The wrong way to arrive at a number is to ask what companies like yours are raising. The right way is to work backwards from the next round: what does the company have to prove to raise it, how long does proving that take, and what does it cost to run for that long plus the months it takes to close?",
      },
      { type: "heading", text: "The formula" },
      {
        type: "paragraph",
        text: "Monthly burn after the raise, multiplied by target runway, plus a margin for the round itself taking time, minus the cash already in the bank. Eighteen months is the usual target: roughly twelve to build the evidence and six to raise on it. The calculator on the funding page does exactly this arithmetic and nothing more.",
      },
      { type: "heading", text: "Why raising more is not obviously better" },
      {
        type: "list",
        items: [
          "Dilution compounds. Every point given up early is a point you do not have to give up later, at a much higher price.",
          "A large round sets the bar for the next one. Raise at a valuation your next eighteen months cannot grow into and the following round is a down round — which is expensive in terms, not just in price.",
          "Money changes behaviour. Teams with two years of runway hire ahead of evidence far more often than teams with twelve months.",
        ],
      },
      { type: "heading", text: "Why raising less is not obviously safer" },
      {
        type: "paragraph",
        text: "The failure mode of a small round is running out mid-experiment, with results that are suggestive but not conclusive, and no leverage. Raising twice in eighteen months costs more founder time than any single round saves in dilution. If the number is close, err upward.",
      },
      {
        type: "callout",
        text: "Be able to answer \"what does this money buy?\" in one sentence, with a milestone in it. \"Eighteen months to ₹2 crore ARR and a repeatable enterprise sales motion\" is an answer. \"Growth and hiring\" is not.",
      },
    ],
  },

  {
    slug: "pre-seed-vs-seed-vs-series-a",
    title: "Pre-seed vs Seed vs Series A",
    excerpt:
      "What each stage is actually buying, what has to be true to raise it, and the cheque sizes these labels tend to mean in India.",
    readingMinutes: 6,
    step: 6,
    body: [
      {
        type: "paragraph",
        text: "Stage names are shorthand for how much risk is left. They are not defined by the amount raised, though the amounts correlate — and in India the same label covers a wider range than it does in the US, so treat the numbers below as the shape of a distribution rather than a rule.",
      },
      { type: "heading", text: "Pre-seed" },
      {
        type: "paragraph",
        text: "Buys the right to find out whether the thing works at all. Usually a team, a prototype and a thesis. Typically ₹50 lakh to ₹3 crore in India, often on a convertible instrument rather than priced equity, from angels, syndicates and a growing set of dedicated pre-seed funds. What is being underwritten is the founders and the problem — there is nothing else to look at.",
      },
      { type: "heading", text: "Seed" },
      {
        type: "paragraph",
        text: "Buys product-market fit. There is a product, there are users, and something in the data is repeating. Typically ₹3 crore to ₹20 crore, usually priced, usually with an institutional lead who takes a board seat or an observer. The question has moved from \"can this be built\" to \"do enough people want it, and will they keep wanting it\".",
      },
      { type: "heading", text: "Series A" },
      {
        type: "paragraph",
        text: "Buys scale. Fit is assumed; what is being funded is the machine that turns money into customers predictably. Typically ₹20 crore to ₹100 crore. The diligence is quantitative and unsentimental: cohort retention, payback period, gross margin, sales efficiency. Series A is where most Indian companies discover which of their metrics were actually a story.",
      },
      { type: "heading", text: "The stages between the stages" },
      {
        type: "paragraph",
        text: "\"Pre-Series A\", \"seed extension\" and \"bridge\" are all real and all mean roughly the same thing: more time to reach the bar for the next priced round. They are common and not a mark against a company — but they are not a stage of their own, which is why this platform records them as undisclosed rather than rounding them up or down to a neighbour.",
      },
      {
        type: "callout",
        text: "Raise at the stage your evidence supports, not the one your peers announce. The mismatch shows up immediately in diligence, and the meeting ends there.",
      },
    ],
  },

  {
    slug: "how-to-approach-angel-investors",
    title: "How to approach angel investors",
    excerpt:
      "Warm paths, the first email, and what an angel is actually deciding in the twenty minutes they give you.",
    readingMinutes: 6,
    step: 7,
    body: [
      {
        type: "paragraph",
        text: "An angel is investing their own money, usually on a part-time basis, usually in something adjacent to what they know. That shapes everything: they decide faster than a fund, they care more about the people, and they are far more responsive to a credible introduction than to a good cold email.",
      },
      { type: "heading", text: "Find the warm path first" },
      {
        type: "list",
        items: [
          "Founders they have already backed. The single highest-converting introduction there is, and the easiest to ask for — a portfolio founder's forward carries their judgement with it.",
          "Operators from their old company. Angels are usually former operators; people from that orbit get read.",
          "Angel networks and syndicates — IAN, Mumbai Angels, LetsVenture and the platform syndicates — where one introduction reaches a group.",
          "Genuine, prior interaction. Someone who has read your writing or used your product is not a cold contact.",
        ],
      },
      { type: "heading", text: "The first email" },
      {
        type: "paragraph",
        text: "Six sentences at most. What you do, in plain language. The one number that makes it interesting. Why you are writing to this person specifically — their portfolio, their operating background, something they have said. The ask: a 20-minute call. Attach the deck; do not make them request it. No attachments-as-teasers, no \"let me know if you would like to see more\".",
      },
      { type: "heading", text: "What they are deciding" },
      {
        type: "paragraph",
        text: "Whether you are unusually good at something that matters here, and whether they would be embarrassed to introduce you to a fund later. Angels take reputational risk when they pass a company on, and that is the real currency of the relationship — an angel cheque is worth far less than the introductions that follow it.",
      },
      {
        type: "callout",
        text: "Ask for advice and you will often get money. Ask for money and you will usually get advice. This is a cliché because it keeps being true — but only when the advice you ask for is specific and you actually want it.",
      },
    ],
  },

  {
    slug: "how-to-find-vcs-in-india",
    title: "How to find VCs in India",
    excerpt:
      "Building a target list that matches on stage, sector and cheque size — and the three filters that remove most of it.",
    readingMinutes: 6,
    step: 6,
    body: [
      {
        type: "paragraph",
        text: "Most fundraising time is wasted on funds that were never going to invest. A fund has a stage, a sector range, a cheque size, a geography and a point in its own fund cycle, and if any of those do not match, nothing about your pitch will fix it. Filter first, pitch second.",
      },
      { type: "heading", text: "The three filters that do most of the work" },
      {
        type: "list",
        items: [
          "Stage. A fund that leads Series A does not write ₹1 crore cheques, whatever its website says about backing founders early.",
          "Cheque size. Find their last five investments and the amounts. If your round is smaller than their smallest cheque, you are asking them to break their model.",
          "Conflict. A fund that has backed a direct competitor will not look at you, and the meeting is worse than useless — you will have briefed a competitor's investor.",
        ],
      },
      { type: "heading", text: "Where to build the list" },
      {
        type: "list",
        items: [
          "Recent rounds in your sector. Who led them, at what size, at what stage. The funding feed on this page exists for exactly this — filter by stage and industry and read the lead investor on each round.",
          "The portfolio pages of funds that led those rounds, to see the pattern rather than the single deal.",
          "Partner-level, not fund-level. You are pitching a person who has to champion you internally; find the partner who has done the most similar deals and write to them.",
        ],
      },
      { type: "heading", text: "The Indian specifics" },
      {
        type: "paragraph",
        text: "Domestic funds registered as SEBI AIFs, global funds investing through offshore vehicles, and corporate venture arms all behave differently on timelines and paperwork. A foreign investor brings FEMA reporting and pricing-guideline constraints; a domestic AIF does not. None of this decides who to pitch, but it decides how long the close takes, and it is worth knowing before you promise a date.",
      },
      {
        type: "callout",
        text: "Run the process in parallel, not in series. Sequential pitching stretches a round across quarters and lets the first \"no\" set the price. A concentrated process creates the only leverage a first-time founder has: simultaneity.",
      },
    ],
  },

  {
    slug: "what-investors-look-for",
    title: "What investors look for",
    excerpt:
      "The four things being assessed underneath every question, and the metrics that survive scrutiny.",
    readingMinutes: 6,
    step: 3,
    body: [
      {
        type: "paragraph",
        text: "Whatever is being asked, the assessment underneath is the same four things: is the market big enough to matter, is there evidence this works, is there a reason it keeps working once others notice, and are these the right people. Different stages weight them differently — pre-seed is almost entirely the fourth, Series A is heavily the second — but all four are always in play.",
      },
      { type: "heading", text: "Evidence that counts" },
      {
        type: "list",
        items: [
          "Retention, shown as a cohort curve that flattens. A curve that flattens above zero is the single most persuasive chart in early-stage fundraising.",
          "Revenue, with its quality attached: recurring or one-off, gross margin, concentration. ₹1 crore of ARR from forty customers is a different company from ₹1 crore from two.",
          "Payback period and how it has moved. Customer acquisition cost recovered in under twelve months, and trending down, is a business; trending up is a subsidy.",
          "Organic pull — referral, inbound, usage growing in accounts you are not touching.",
        ],
      },
      { type: "heading", text: "Evidence that does not" },
      {
        type: "list",
        items: [
          "Registered users, downloads, waitlist size. All measure interest at the moment of lowest cost.",
          "GMV without take rate, or revenue without margin.",
          "Letters of intent and pilots that have not converted.",
          "Awards, accelerator logos and press. Pleasant, and not evidence of demand.",
        ],
      },
      { type: "heading", text: "The team question" },
      {
        type: "paragraph",
        text: "\"Founder-market fit\" means something specific: some reason you will see things about this problem that a smart generalist would not, and some reason you will still be doing it in five years. Prior domain experience is the usual form, but not the only one — obsessive, sustained engagement with the problem reads the same way. What does not read well is a founder who could just as plausibly be running any of four other startups.",
      },
      {
        type: "callout",
        text: "Investors are also assessing whether they can trust your numbers. One overstated metric found in diligence recontaminates every other number in the deck, including the true ones.",
      },
    ],
  },

  {
    slug: "startup-valuation-basics",
    title: "Startup valuation basics",
    excerpt:
      "Where an early-stage number actually comes from, why pre- and post-money is not a detail, and the terms that cost more than the price.",
    readingMinutes: 7,
    step: 9,
    body: [
      {
        type: "paragraph",
        text: "Early-stage valuation is not a calculation. There are no cash flows to discount and no comparables that mean much, so the number is set by what the round needs to be, how much dilution is normal at the stage, and how much competition there is for the deal. Working backwards from those three gets you closer than any model.",
      },
      { type: "heading", text: "How the number is actually arrived at" },
      {
        type: "paragraph",
        text: "A round is usually 10-25% of the company. So a ₹8 crore raise at a standard 20% dilution implies a ₹40 crore post-money valuation, and the negotiation is about moving that percentage. This is why round size and valuation are not independent decisions: change one and the other moves with it.",
      },
      { type: "heading", text: "Pre-money, post-money, and the option pool" },
      {
        type: "list",
        items: [
          "Post-money = pre-money + the amount raised. A ₹40 crore pre-money with an ₹8 crore round is a ₹48 crore post-money, and your ownership is calculated on the post.",
          "The option pool is usually created out of the pre-money — meaning existing shareholders, which is you, pay for all of it. A 10% pool on a ₹40 crore pre-money is ₹4 crore of dilution that does not look like dilution in the headline number.",
          "Ask for the fully-diluted cap table after the round, including the pool. That single table answers what the headline valuation obscures.",
        ],
      },
      { type: "heading", text: "Terms that cost more than the price" },
      {
        type: "list",
        items: [
          "Liquidation preference. A 1x non-participating preference is standard and fine. Participating preferences and multiples above 1x mean the investor takes their money back and then shares the rest — at modest exits, that can be most of the outcome.",
          "Anti-dilution. Broad-based weighted average is normal. Full ratchet transfers the entire cost of a down round to the founders and common holders.",
          "Board composition and reserved matters. Who has to agree before you can hire, borrow, or sell the company.",
          "Drag-along and tag-along, which decide who can force a sale, and on what terms.",
        ],
      },
      { type: "heading", text: "Convertible instruments" },
      {
        type: "paragraph",
        text: "At pre-seed, price is often deferred with a convertible note or a SAFE-style instrument, converting at the next priced round with a discount and usually a cap. The cap is the real valuation negotiation — it sets the worst price the investor will pay. In India, note that a SAFE is not a native instrument under the Companies Act; the common domestic equivalent is a CCPS or a convertible note issued under the relevant RBI and Companies Act provisions, and the structure is worth a lawyer's hour before you sign, not after.",
      },
      {
        type: "callout",
        text: "This page is general information, not legal, tax or financial advice. Term sheets are binding in ways that are not obvious from reading them; get an experienced startup lawyer before you sign one.",
      },
    ],
  },

  {
    slug: "how-to-prepare-for-due-diligence",
    title: "How to prepare for due diligence",
    excerpt:
      "What gets checked, what usually goes wrong, and why being ready is itself a signal.",
    readingMinutes: 6,
    step: 8,
    body: [
      {
        type: "paragraph",
        text: "Diligence begins after the term sheet and typically runs three to eight weeks. It is a verification exercise, not a re-evaluation: the investor has decided they want to invest and is now checking that what you said is true and that nothing in the company is broken. Almost nothing here is a surprise, which means almost all of it can be ready months early.",
      },
      { type: "heading", text: "What gets checked" },
      {
        type: "list",
        items: [
          "Corporate: incorporation documents, the full cap table, share certificates, board and shareholder resolutions, statutory registers, and every prior financing document.",
          "Financial: audited statements, management accounts, the bank statements behind them, revenue recognition, and the GST and TDS filing history.",
          "Legal: customer and vendor contracts, employment agreements, the ESOP plan and its grants, and any litigation.",
          "Intellectual property: who owns the code. Founder and contractor IP assignments are the single most common gap.",
          "Technical: architecture, security posture, key dependencies, and a look at the codebase.",
          "Commercial: reference calls with your customers, which is the part founders underestimate most.",
        ],
      },
      { type: "heading", text: "Where it goes wrong" },
      {
        type: "list",
        items: [
          "A cap table that does not reconcile with the statutory registers — usually an old verbal promise nobody documented.",
          "Contractor-written code with no IP assignment.",
          "Revenue counted differently in the deck than in the accounts. Reported ARR that includes one-off implementation fees is the classic.",
          "Missing board resolutions for past share issuances, which turns into weeks of retrospective paperwork.",
          "An ESOP pool granted informally over email.",
        ],
      },
      { type: "heading", text: "Being ready is a signal" },
      {
        type: "paragraph",
        text: "A founder who answers a diligence list in three days is telling an investor something about how the company is run that no slide can. The reverse is also true, and it is the point at which deals go quiet without ever being formally declined.",
      },
      {
        type: "callout",
        text: "Do a self-diligence pass a quarter before you raise. Find your own gaps while fixing them is cheap and unobserved.",
      },
    ],
  },

  {
    slug: "common-fundraising-mistakes",
    title: "Common fundraising mistakes",
    excerpt:
      "The ten that cost the most time, most of which are process errors rather than pitch errors.",
    readingMinutes: 6,
    step: 10,
    body: [
      {
        type: "paragraph",
        text: "Most failed rounds are not failed pitches. They are process mistakes — starting late, running sequentially, targeting badly — and they are far more avoidable than the quality of the underlying business.",
      },
      { type: "heading", text: "The ten" },
      {
        type: "list",
        items: [
          "Starting with under six months of runway. Investors can see your bank balance in diligence, and a founder who has to close is a founder with no leverage.",
          "Pitching sequentially. It stretches a round over quarters and lets each \"no\" inform the next conversation.",
          "Targeting by brand instead of by fit. The best-known fund at the wrong stage is a worse use of a month than an unglamorous one at the right stage.",
          "Optimising for valuation over terms. A higher price with a participating 2x preference is usually the worse deal, and it is the one founders take.",
          "Overstating a metric. It will be checked. The recovery cost is the whole relationship, not just the number.",
          "No clear ask. \"We are raising ₹8 crore for 18 months to reach ₹3 crore ARR\" beats \"we are raising ₹6-12 crore\" every time.",
          "Ignoring the follow-up. Rounds are won in the second and third meeting, on the material you send between them.",
          "Treating a term sheet as the finish line. It is non-binding almost everywhere that matters, and diligence is still ahead.",
          "Neglecting the company while raising. A round that takes five months while growth flatlines produces a company that is harder to fund than the one that started.",
          "No lawyer, or the wrong one. A generalist commercial lawyer will not catch a bad anti-dilution clause.",
        ],
      },
      {
        type: "callout",
        text: "\"No\" from an investor is rarely about your company being bad. Fund cycle, portfolio conflict, a partner leaving, thesis drift — most of the reasons have nothing to do with you and none of them will be shared.",
      },
    ],
  },

  {
    slug: "how-to-create-an-investor-data-room",
    title: "How to create an investor data room",
    excerpt:
      "The folder structure, what belongs in each, and what to keep out until diligence is signed.",
    readingMinutes: 5,
    step: 8,
    body: [
      {
        type: "paragraph",
        text: "A data room is a structured, access-controlled folder of everything an investor will ask for. Its purpose is speed: the difference between a diligence process that takes three weeks and one that takes eight is almost entirely whether the documents already existed in one place.",
      },
      { type: "heading", text: "The structure" },
      {
        type: "list",
          items: [
          "01 Corporate — certificate of incorporation, MOA and AOA, board and shareholder resolutions, statutory registers, the current cap table.",
          "02 Financials — audited statements, management accounts, the financial model, the bank statements behind the numbers, GST and TDS filings.",
          "03 Legal — customer contracts, vendor agreements, the standard employment agreement, the ESOP plan and grant letters, any litigation.",
          "04 Product and technology — architecture overview, roadmap, security and data-handling summary, the IP assignment record.",
          "05 Commercial — the metrics pack, cohort tables, pipeline, and reference customers you have already asked.",
          "06 Team — the org chart, founder agreements, compensation summary, key hires planned.",
          "07 Previous rounds — every prior financing document, in date order.",
        ],
      },
      { type: "heading", text: "What to hold back until the term sheet" },
      {
        type: "paragraph",
        text: "Named customer contracts, the full employee list with compensation, and detailed technical architecture. Share the summary during the pitch process and the underlying documents once a term sheet is signed. This is normal and nobody will object; a fund that pushes for all of it before committing is doing market research.",
      },
      { type: "heading", text: "Housekeeping" },
      {
        type: "list",
        items: [
          "Consistent, dated file names. \"2026-03-31 Management Accounts.pdf\", not \"final_v3_updated.pdf\".",
          "Per-investor access, so you can see who looked at what and revoke cleanly when a process ends.",
          "One index document at the root listing what is where, and what is deliberately not included yet.",
          "Keep it current between rounds. A data room updated quarterly is a fortnight of work you never have to do under time pressure.",
        ],
      },
      {
        type: "callout",
        text: "Do not put anything in a data room you would not want a competitor to read. Funds are careful, but material moves between people, and the only fully reliable control is what you chose to include.",
      },
    ],
  },
];

/** Lookup by slug for the guide route. */
export function getFundingGuide(slug: string): FundingGuide | undefined {
  return FUNDING_GUIDES.find((guide) => guide.slug === slug);
}

/**
 * Slugs `/funding/[startup-slug]` must never treat as a company.
 *
 * Next.js resolves a static segment ahead of a dynamic sibling, so `/funding/investors`
 * reaches its own page regardless. This list is the other half of that: a
 * company whose name slugified to "investors" would otherwise have a profile
 * page that is unreachable, so the dynamic route refuses these outright rather
 * than rendering a profile nobody can visit.
 */
export const RESERVED_FUNDING_SLUGS = new Set(["investors", "guides", "trends", "calculator"]);
