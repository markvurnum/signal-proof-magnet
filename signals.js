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
};

module.exports = { SIGNALS };
