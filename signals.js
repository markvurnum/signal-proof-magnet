/* Signal Proof — SIGNAL → SERVICES config (single source of truth).
 *
 * A SIGNAL is a shelf: the shared pool of ENQUIRIES (companies whose public
 * announcement = a need). A SERVICE is a provider we email who wants those
 * enquiries; each SERVICE is one campaign + one page wording. Same enquiries,
 * different pitch. The magnet, link builder, uploader and dashboard all read this.
 *
 * Office move is TWO shelves because the moment matters: "about to move"
 * (get it ready before day one) vs "already moved" (get sorted now you're in).
 */

// the 4 providers we email for an office move, worded per stage (soon vs done)
const officeServices = (stage) => {
  const soon = stage === 'soon';
  return {
    it: { label: 'IT / managed IT', audience: 'IT and managed service businesses',
      needTail: soon ? 'their IT set up ready for day one' : 'their IT set up and connected',
      senderDesc: "an office IT setup business that gets a company's new premises fully connected, secured and running",
      emailRefAsk: soon
        ? 'reference their SPECIFIC company and that they are about to move; offer to plan and set up their IT (computers, network, servers, security) so it is ready before they move in'
        : 'reference their SPECIFIC company and that they have just moved premises; offer to get their new premises IT fully set up (computers, network, servers, security) quickly and properly' },
    telecoms: { label: 'Telecoms / connectivity', audience: 'telecoms and connectivity businesses',
      needTail: soon ? 'phones and broadband live before they move in' : 'their phones, broadband and network sorted',
      senderDesc: 'a business telecoms and connectivity provider that sets up phone systems, broadband and networks for new premises',
      emailRefAsk: soon
        ? 'reference their SPECIFIC company and their upcoming move; offer to get their phone system, broadband and connectivity live at the new premises before move-in day'
        : 'reference their SPECIFIC company and that they have just moved premises; offer to sort their phone system, broadband and connectivity at the new premises' },
    software: { label: 'Software / systems', audience: 'software and systems businesses',
      needTail: soon ? 'their systems ready at the new site' : 'their software and systems migrated across',
      senderDesc: 'a software and systems business that migrates and sets up the tools a company runs on when it moves premises',
      emailRefAsk: soon
        ? 'reference their SPECIFIC company and their upcoming move; offer to plan and migrate their software and systems so they are ready at the new site from day one'
        : 'reference their SPECIFIC company and their recent move; offer to migrate and set up their software and systems smoothly at the new premises' },
    insurance: { label: 'Commercial insurance', audience: 'commercial insurance businesses',
      needTail: soon ? 'cover in place for the new premises' : 'their new premises properly insured',
      senderDesc: 'a commercial insurance broker that arranges premises, contents and liability cover when a business moves',
      emailRefAsk: soon
        ? 'reference their SPECIFIC company and their upcoming move; offer to arrange premises, contents and liability cover ready for the new premises'
        : 'reference their SPECIFIC company and their recent move; offer to review and arrange the right cover for their new premises' },
  };
};

const SIGNALS = {
  sales: {
    label: 'Hiring & scaling sales',
    clientId: '224bef46-a50f-43fd-b389-f7bb25e1eb7b', // UK Hiring & Scaling Sales Teams
    freshDays: 14,
    intelNoun: 'public hiring post',
    loaderMoment: 'UK hiring signals',
    needLead: "they're hiring and scaling their sales team",
    signalRow: (i) => (i && i.role_hiring ? ['Hiring', i.role_hiring] : null),
    emailAbout: (i) => (i && i.role_hiring ? ' about their ' + i.role_hiring + ' hire' : ''),
    defaultService: 'coaching',
    services: {
      coaching: { label: 'Sales coaching / training', audience: 'coaches, consultants and service-based business owners', needTail: '', senderDesc: 'a sales coaching and training business that helps companies ramp and train new sales hires so they hit quota faster', emailRefAsk: 'reference their SPECIFIC role and company; offer to help their new hire(s) ramp and hit quota faster' },
    },
  },

  'office-moving-soon': {
    label: 'Office move — moving soon',
    clientId: '39477541-1182-4497-b781-aa34661b1b7e', // TEST UK Companies About to Move
    freshDays: 28,
    intelNoun: 'post about an upcoming office move (signed a lease / picking up the keys)',
    loaderMoment: 'UK companies about to move',
    needLead: "they're about to move into new premises and will need",
    signalRow: () => ['Signal', 'Moving soon'],
    emailAbout: () => ' about their upcoming office move',
    defaultService: 'it',
    services: officeServices('soon'),
  },

  'office-moved': {
    label: 'Office move — already moved',
    clientId: '3ddc4301-ffa8-4df7-a5ee-48ca108780e5', // TEST UK Companies Moving to a New Office
    freshDays: 28,
    intelNoun: 'office move / relocation announcement',
    loaderMoment: 'UK office moves',
    needLead: "they've just moved into new premises and need",
    signalRow: () => ['Signal', 'Just moved premises'],
    emailAbout: () => ' about their recent office move',
    defaultService: 'it',
    services: officeServices('done'),
  },

  fund: {
    label: 'Raised investment',
    clientId: 'e2ca1fd2-f260-401f-b422-3bb901b67747', // TEST UK Companies That Raised Funding
    freshDays: 90,
    intelNoun: 'funding announcement (raised a round / secured investment)',
    loaderMoment: 'UK companies that just raised',
    needLead: "they've just raised investment and need",
    signalRow: () => ['Signal', 'Just raised funding'],
    emailAbout: () => ' about their recent funding round',
    defaultService: 'cfo',
    services: {
      cfo: { label: 'Fractional CFO / finance', audience: 'fractional CFOs and finance leaders',
        needTail: 'a finance function to deploy the capital',
        senderDesc: 'a fractional CFO business that helps funded companies build their finance function, budgets and reporting after a raise',
        emailRefAsk: 'reference their SPECIFIC company and recent raise; offer fractional CFO/finance help to deploy the funding well (budgets, reporting, hiring plan)' },
      recruitment: { label: 'Recruitment', audience: 'recruiters and talent partners',
        needTail: 'to hire fast now they are funded',
        senderDesc: 'a recruitment business that helps funded companies build their team quickly after a raise',
        emailRefAsk: 'reference their SPECIFIC company and recent raise; offer to help them hire the roles the funding is meant to fill' },
      marketing: { label: 'Marketing agency', audience: 'marketing agencies',
        needTail: 'to ramp marketing now they are funded',
        senderDesc: 'a marketing agency that helps funded companies turn investment into growth and pipeline',
        emailRefAsk: 'reference their SPECIFIC company and recent raise; offer to ramp their marketing and demand generation now they have capital' },
      legal: { label: 'Commercial legal', audience: 'commercial solicitors and legal advisers',
        needTail: 'the legals handled post-raise',
        senderDesc: 'a commercial law firm that handles the contracts, share agreements and compliance that follow a funding round',
        emailRefAsk: 'reference their SPECIFIC company and recent raise; offer commercial legal support (contracts, shareholder agreements, compliance) after the round' },
      pr: { label: 'PR', audience: 'PR and communications agencies',
        needTail: 'to make the most of the announcement',
        senderDesc: 'a PR agency that helps funded companies amplify their raise and build profile',
        emailRefAsk: 'reference their SPECIFIC company and recent raise; offer PR to amplify the funding news and build ongoing profile' },
    },
  },

  milestone: {
    label: 'Hit a milestone',
    clientId: 'b7b995a8-7934-492c-b7c3-bb92c8c4437b', // TEST UK Companies Hitting a Milestone
    freshDays: 90,
    intelNoun: 'milestone announcement (record year / award / big number)',
    loaderMoment: 'UK companies hitting milestones',
    needLead: "they've just hit a big milestone and want",
    signalRow: () => ['Signal', 'Just hit a milestone'],
    emailAbout: () => ' about their recent milestone',
    defaultService: 'pr',
    services: {
      pr: { label: 'PR', audience: 'PR and communications agencies',
        needTail: 'to amplify the moment',
        senderDesc: 'a PR agency that turns a company milestone (record year, award, big number) into press and profile',
        emailRefAsk: 'reference their SPECIFIC company and milestone; offer PR to turn the moment into coverage and profile' },
      cfo: { label: 'Fractional CFO / exit advisory', audience: 'fractional CFOs and exit advisers',
        needTail: 'to plan the next stage or an exit',
        senderDesc: 'a fractional CFO and exit advisory business that helps growing companies plan their next stage or a future sale',
        emailRefAsk: 'reference their SPECIFIC company and milestone; offer fractional CFO/exit advisory to plan the next stage or an eventual exit' },
      marketing: { label: 'Marketing agency', audience: 'marketing agencies',
        needTail: 'to press the momentum',
        senderDesc: 'a marketing agency that helps companies capitalise on the momentum from a strong result',
        emailRefAsk: 'reference their SPECIFIC company and milestone; offer marketing to press the momentum from a record period' },
    },
  },

  rebrand: {
    label: 'Rebrand / new website / launch',
    clientId: '40f20a9d-7d3d-4c6b-a0d9-84059856e299', // TEST UK Companies Rebranding or Launching
    freshDays: 60,
    intelNoun: 'rebrand, new-website or product/service launch announcement',
    loaderMoment: 'UK companies rebranding or launching',
    needLead: "they've just rebranded or launched and need",
    signalRow: () => ['Signal', 'Rebrand / launch'],
    emailAbout: () => ' about their rebrand / launch',
    defaultService: 'marketing',
    services: {
      marketing: { label: 'Marketing agency', audience: 'marketing agencies',
        needTail: 'to make the new brand land',
        senderDesc: 'a marketing agency that helps companies launch a new brand or website with the campaigns to match',
        emailRefAsk: 'reference their SPECIFIC company and rebrand/launch; offer marketing to make the new brand land and drive traffic' },
      web: { label: 'Web design', audience: 'web design and development studios',
        needTail: 'the new site built properly',
        senderDesc: 'a web design studio that builds and improves websites for companies launching a new brand',
        emailRefAsk: 'reference their SPECIFIC company and new site/rebrand; offer web design and development to get the new site right' },
      seo: { label: 'SEO', audience: 'SEO agencies and consultants',
        needTail: 'the new site to rank',
        senderDesc: 'an SEO business that makes sure a new website ranks and keeps its visibility through a rebrand',
        emailRefAsk: 'reference their SPECIFIC company and new site/rebrand; offer SEO so the new site ranks and keeps its traffic' },
      ads: { label: 'Paid ads', audience: 'paid media and PPC agencies',
        needTail: 'traffic to the new site fast',
        senderDesc: 'a paid ads agency that drives immediate traffic to a newly launched site or brand',
        emailRefAsk: 'reference their SPECIFIC company and launch/rebrand; offer paid ads to drive traffic to the new site straight away' },
    },
  },

  expand: {
    label: 'International expansion (in/out of UK)',
    clientId: '44911081-1633-4008-bb8b-fb79f9e0f5ad', // TEST UK Companies Expanding Abroad
    freshDays: 365,
    intelNoun: 'international expansion announcement (opening in a new market — into or out of the UK)',
    loaderMoment: 'companies expanding into or out of the UK',
    needLead: "they're expanding into a new market and need",
    // mixed inbound/outbound market, so not every card is a UK-HQ'd business
    audienceNoun: { one: 'company expanding into or out of the UK', many: 'companies expanding into or out of the UK' },
    signalRow: () => ['Signal', 'International expansion'],
    emailAbout: () => ' about their international expansion',
    defaultService: 'legal',
    services: {
      legal: { label: 'Commercial legal', audience: 'commercial and international solicitors',
        needTail: 'a local entity and contracts set up',
        senderDesc: 'a commercial law firm that helps companies set up the entity, contracts and compliance when they expand into a new market',
        emailRefAsk: 'reference their SPECIFIC company and expansion; offer legal help to set up the local entity, contracts and compliance in the new market' },
      recruitment: { label: 'Recruitment', audience: 'international recruiters',
        needTail: 'a local team in the new market',
        senderDesc: 'a recruitment business that helps companies hire a local team when they expand into a new market',
        emailRefAsk: 'reference their SPECIFIC company and expansion; offer to help hire the local team in the new market' },
      marketing: { label: 'International marketing', audience: 'marketing agencies with international reach',
        needTail: 'to launch marketing in the new market',
        senderDesc: 'a marketing agency that helps companies launch and localise their marketing when they expand into a new market',
        emailRefAsk: 'reference their SPECIFIC company and expansion; offer marketing to launch and localise in the new market' },
    },
  },
};

module.exports = { SIGNALS };
