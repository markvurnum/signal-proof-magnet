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

  contract: {
    label: 'Won a big contract',
    clientId: 'c584fd7d-37ad-4f8e-baa1-d7bcde2e9ba4', // TEST UK Companies That Won a Big Contract
    freshDays: 280, // contract wins have a long delivery tail; individual-poster leads here are older but enrich cleanly
    intelNoun: 'major contract / framework win announcement',
    loaderMoment: 'UK companies winning contracts',
    needLead: "they've just won a major contract and need",
    signalRow: () => ['Signal', 'Won a big contract'],
    emailAbout: () => ' about their recent contract win',
    defaultService: 'recruitment',
    services: {
      recruitment: { label: 'Recruitment', audience: 'recruiters and talent partners',
        needTail: 'to hire the team to deliver it',
        senderDesc: 'a recruitment business that helps companies quickly hire the team to deliver a big new contract',
        emailRefAsk: 'reference their SPECIFIC contract win; offer to help hire the team to deliver it' },
      ops: { label: 'Project / ops support', audience: 'project delivery and operations consultants',
        needTail: 'the delivery stood up fast',
        senderDesc: 'a project and operations consultancy that helps companies stand up delivery for a major new contract',
        emailRefAsk: 'reference their SPECIFIC contract win; offer project and ops support to stand up delivery at pace' },
      legal: { label: 'Commercial legal', audience: 'commercial solicitors',
        needTail: 'the contract and terms handled',
        senderDesc: 'a commercial law firm that handles the contract, terms and risk on a major new deal',
        emailRefAsk: 'reference their SPECIFIC contract win; offer commercial legal support on the contract, terms and risk' },
      marketing: { label: 'Marketing agency', audience: 'marketing agencies',
        needTail: 'to make the most of the win',
        senderDesc: 'a marketing agency that helps companies amplify a major contract win and attract more work like it',
        emailRefAsk: 'reference their SPECIFIC contract win; offer marketing to amplify it and win more work like it' },
    },
  },

  bcorp: {
    label: 'Going for B Corp / ISO',
    clientId: 'cfea92cc-a294-45bc-8dcd-8b988298e280', // TEST UK Companies Going for B Corp or ISO
    freshDays: 60,
    intelNoun: 'B Corp / ISO / certification announcement',
    loaderMoment: 'UK companies getting certified',
    needLead: "they've just started (or achieved) a certification and need",
    signalRow: () => ['Signal', 'B Corp / ISO journey'],
    emailAbout: () => ' about their B Corp / certification',
    defaultService: 'bcorp',
    services: {
      bcorp: { label: 'B Corp consultancy', audience: 'B Corp and impact consultants',
        needTail: 'help getting through the assessment',
        senderDesc: 'a B Corp consultancy that guides companies through the B Impact Assessment and certification',
        emailRefAsk: 'reference their SPECIFIC company and B Corp journey; offer consultancy to get them through the B Impact Assessment and certified' },
      iso: { label: 'ISO / compliance', audience: 'ISO and compliance consultants',
        needTail: 'the systems and evidence for the standard',
        senderDesc: 'an ISO and compliance consultancy that builds the management systems and evidence to pass ISO audits',
        emailRefAsk: 'reference their SPECIFIC company and certification; offer ISO and compliance help to build the systems and evidence to pass the audit' },
      esg: { label: 'Sustainability / ESG', audience: 'sustainability and ESG consultants',
        needTail: 'to make the impact real and reported',
        senderDesc: 'a sustainability and ESG consultancy that helps certified companies measure, improve and report their impact',
        emailRefAsk: 'reference their SPECIFIC company and certification; offer sustainability and ESG help to measure, improve and report their impact' },
    },
  },

  visibility: {
    label: 'Launched a podcast / book',
    clientId: 'd96f8fe7-9a08-4307-92f3-e3dc5d591420', // TEST UK Founders Launching a Podcast or Book
    freshDays: 120,
    intelNoun: 'podcast, book or speaking announcement',
    loaderMoment: 'UK founders raising their profile',
    needLead: "they've just launched a podcast, book or talk and want",
    audienceNoun: { one: 'UK founder raising their profile', many: 'UK founders raising their profile' },
    signalRow: () => ['Signal', 'Podcast / book / talk'],
    emailAbout: () => ' about their podcast / book / talk',
    defaultService: 'pr',
    services: {
      pr: { label: 'PR / publicity', audience: 'PR and publicity agencies',
        needTail: 'to turn it into press and profile',
        senderDesc: 'a PR agency that turns a podcast, book or talk into press coverage and profile',
        emailRefAsk: 'reference their SPECIFIC podcast, book or talk; offer PR to turn it into coverage and profile' },
      ghost: { label: 'Ghostwriting', audience: 'ghostwriters and content strategists',
        needTail: 'help writing the content behind it',
        senderDesc: 'a ghostwriting business that writes the LinkedIn posts, articles and book content behind a personal brand',
        emailRefAsk: 'reference their SPECIFIC podcast, book or talk; offer ghostwriting to produce the content behind it (LinkedIn, articles, the book)' },
      production: { label: 'Podcast / video production', audience: 'podcast and video production studios',
        needTail: 'it produced and edited to a high standard',
        senderDesc: 'a podcast and video production studio that records, edits and repurposes a show or talks into clips and content',
        emailRefAsk: 'reference their SPECIFIC podcast or talk; offer production help to record, edit and repurpose it into clips and content' },
    },
  },

  acquisition: {
    label: 'Made an acquisition',
    clientId: 'a3390fc7-31ca-45c0-acbe-7f2ae5a6ec1a', // TEST UK Companies That Made an Acquisition
    freshDays: 60,
    intelNoun: 'acquisition / merger announcement',
    loaderMoment: 'UK companies making acquisitions',
    needLead: "they've just made an acquisition and need",
    signalRow: () => ['Signal', 'Made an acquisition'],
    emailAbout: () => ' about their recent acquisition',
    defaultService: 'legal',
    services: {
      legal: { label: 'Commercial legal', audience: 'corporate and commercial solicitors',
        needTail: 'the deal and integration legals handled',
        senderDesc: 'a corporate law firm that handles completion, warranties and the legal side of integrating an acquisition',
        emailRefAsk: 'reference their SPECIFIC acquisition; offer legal support on completion, warranties and the integration' },
      hr: { label: 'HR / integration', audience: 'HR and people consultants',
        needTail: 'the two teams brought together',
        senderDesc: 'an HR and people consultancy that helps merge teams, contracts and culture after an acquisition',
        emailRefAsk: 'reference their SPECIFIC acquisition; offer HR and integration help to bring the teams, contracts and culture together' },
      pr: { label: 'PR', audience: 'PR and communications agencies',
        needTail: 'the announcement handled well',
        senderDesc: 'a PR agency that helps companies announce an acquisition to staff, customers and the market',
        emailRefAsk: 'reference their SPECIFIC acquisition; offer PR to handle the announcement to staff, customers and the market' },
      integration: { label: 'Systems / ops integration', audience: 'operations and systems consultants',
        needTail: 'the systems and operations merged',
        senderDesc: 'an operations consultancy that integrates the systems, processes and operations of an acquired business',
        emailRefAsk: 'reference their SPECIFIC acquisition; offer help to integrate the systems, processes and operations' },
    },
  },

  franchise: {
    label: 'Launching a franchise',
    clientId: 'b68d6e88-0dd0-4e7a-94cb-3dbdf622c701', // TEST UK Businesses Launching a Franchise
    freshDays: 60,
    intelNoun: 'franchise launch announcement',
    loaderMoment: 'UK businesses franchising',
    needLead: "they've just started franchising and need",
    signalRow: () => ['Signal', 'Launching a franchise'],
    emailAbout: () => ' about franchising their business',
    defaultService: 'consultancy',
    services: {
      consultancy: { label: 'Franchise consultancy', audience: 'franchise consultants',
        needTail: 'the model packaged to franchise',
        senderDesc: 'a franchise consultancy that packages a business into a franchise model ready to sell',
        emailRefAsk: 'reference their SPECIFIC business and franchising plans; offer consultancy to package the model ready to franchise' },
      legal: { label: 'Franchise legal', audience: 'franchise solicitors',
        needTail: 'the franchise agreements drawn up',
        senderDesc: 'a franchise law firm that drafts the franchise agreements and legal framework',
        emailRefAsk: 'reference their SPECIFIC franchising plans; offer legal help to draft the franchise agreements and framework' },
      marketing: { label: 'Marketing', audience: 'marketing agencies',
        needTail: 'to recruit the first franchisees',
        senderDesc: 'a marketing agency that helps franchisors attract and recruit their first franchisees',
        emailRefAsk: 'reference their SPECIFIC franchise launch; offer marketing to attract and recruit their first franchisees' },
    },
  },

  grant: {
    label: 'Won a grant / R&D funding',
    clientId: 'c31ad7fa-a375-445b-b801-3eb0538f9f80', // TEST UK Companies That Won a Grant or R&D Funding
    freshDays: 60,
    intelNoun: 'grant / Innovate UK / R&D funding win',
    loaderMoment: 'UK companies winning grants',
    needLead: "they've just won a grant and need",
    signalRow: () => ['Signal', 'Won a grant'],
    emailAbout: () => ' about their recent grant',
    defaultService: 'rdtax',
    services: {
      rdtax: { label: 'R&D tax', audience: 'R&D tax specialists',
        needTail: 'to claim the R&D tax on the project',
        senderDesc: 'an R&D tax consultancy that helps grant-funded companies claim the R&D tax relief on their innovation projects',
        emailRefAsk: 'reference their SPECIFIC grant or project; offer R&D tax help to claim the relief on the innovation work' },
      grants: { label: 'Grant writing', audience: 'grant writers and funding consultants',
        needTail: 'to line up the next round of funding',
        senderDesc: 'a grant-writing consultancy that helps funded companies win the next round of grants and match-funding',
        emailRefAsk: 'reference their SPECIFIC grant; offer grant-writing help to line up the next round of funding and match-funding' },
      marketing: { label: 'Marketing', audience: 'marketing agencies',
        needTail: 'to make the most of the news',
        senderDesc: 'a marketing agency that helps grant-winning companies turn the award into profile and commercial momentum',
        emailRefAsk: 'reference their SPECIFIC grant; offer marketing to turn the award into profile and momentum' },
    },
  },

  location: {
    label: 'Opening a new store / site',
    clientId: '819ed154-b562-4993-b4c3-eb50f24b8016', // TEST UK Businesses Opening a New Store or Site
    freshDays: 150,
    intelNoun: 'new store / restaurant / site opening',
    loaderMoment: 'UK businesses opening new sites',
    needLead: "they're opening a new customer site and need",
    signalRow: () => ['Signal', 'Opening a new site'],
    emailAbout: () => ' about their new site opening',
    defaultService: 'fitout',
    services: {
      fitout: { label: 'Shopfitting / fit-out', audience: 'shopfitters and fit-out companies',
        needTail: 'the space fitted out for opening',
        senderDesc: 'a shopfitting and fit-out business that gets a new retail or hospitality space ready for opening day',
        emailRefAsk: 'reference their SPECIFIC new site; offer shopfitting and fit-out to get the space ready for opening' },
      epos: { label: 'EPOS / payments', audience: 'EPOS and payments providers',
        needTail: 'tills and payments set up',
        senderDesc: 'an EPOS and payments provider that sets up tills, card payments and stock systems for a new site',
        emailRefAsk: 'reference their SPECIFIC new site; offer EPOS and payments setup (tills, card payments, stock)' },
      marketing: { label: 'Local marketing', audience: 'local marketing agencies',
        needTail: 'a busy opening and local awareness',
        senderDesc: 'a local marketing agency that drives footfall and awareness for a new store or venue opening',
        emailRefAsk: 'reference their SPECIFIC new site; offer local marketing to drive footfall and a busy opening' },
      insurance: { label: 'Commercial insurance', audience: 'commercial insurance brokers',
        needTail: 'the new premises insured',
        senderDesc: 'a commercial insurance broker that arranges premises, stock and liability cover for a new customer-facing site',
        emailRefAsk: 'reference their SPECIFIC new site; offer to arrange premises, stock and liability cover' },
    },
  },
};

module.exports = { SIGNALS };
