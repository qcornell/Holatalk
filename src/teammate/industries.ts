/**
 * What the rep sells, picked once at setup. Each industry sets Ana's defaults: what she calls the
 * offer, how prices work, her opening line, the customer questions to fill in, the rep's quick
 * replies and the Convo topics. Ana's sales approach for each lives in teammate-agent/sales_skills.py.
 */

export type IndustryId = 'internet' | 'solar' | 'security' | 'pest' | 'roofing' | 'ministry' | 'fundraiser' | 'other';

/** month: a monthly price. once: paid one time. none: nothing is sold (an invitation). */
export type PricePer = 'month' | 'once' | 'none';

export interface IndustryPack {
  id: IndustryId;
  label: string;
  sub: string;
  /** What is being offered, as the first plan's name */
  planName: string;
  per: PricePer;
  /** A price is needed before Ana can go out (roofing and solar usually quote later) */
  priceRequired: boolean;
  /** Placeholder in the price field */
  pricePlaceholder: string;
  /** Show install fee and contract */
  hasInstall: boolean;
  /** The label for the company field */
  companyLabel: string;
  companyPlaceholder: string;
  factTopics: Record<string, string[]>;
  checkInReplies: string[];
  /** Convo categories that fit (ids from ConvoScreen) */
  convoCats: string[];
}

const ALL_CATS = ['intro', 'home', 'kids', 'weather', 'faith', 'work', 'food', 'hobbies'];
const CHECK_YOU_ARE_REAL = 'Number customers can call to check you are real';

export const INDUSTRIES: IndustryPack[] = [
  {
    id: 'internet',
    label: 'Internet & TV',
    sub: 'Fiber, cable, phone',
    planName: 'Internet',
    per: 'month',
    priceRequired: true,
    pricePlaceholder: '35',
    hasInstall: true,
    companyLabel: 'Company',
    companyPlaceholder: 'Optimum',
    factTopics: {
      'Your offer': [
        'Price includes taxes and fees (yes / no, about $ extra / not sure)',
        'Price stays the same for (12 months / 24 months / always / not sure)',
        'Current promo and when it ends',
      ],
      'The rules': [
        'Contract (none / 12 months / 24 months)',
        'Cancellation fee',
        'Credit check (yes / no)',
        'Social Security number needed (yes / no)',
        "IDs accepted (matrícula, passport, ITIN, state ID, driver's license)",
        'Deposit (none / $)',
      ],
      'Install and paying': [
        'Install fee (free / $)',
        'Soonest install (same day / next day / within 3 days / within a week)',
        'How long the install takes',
        'Who must be home (an adult 18 or older)',
        'Drilling or new wires',
        'Autopay (required / optional / not offered)',
        'Autopay discount',
        'Ways to pay (card / debit / bank account / cash at a store / money order)',
        'First bill (when and how much)',
      ],
      Extras: [
        'Router and equipment included, and any equipment fee',
        'Data limit',
        'Spanish customer service number',
        CHECK_YOU_ARE_REAL,
        'Local store',
        'Help switching from their old company, or paying their old cancellation fee',
        "Renters: is the landlord's OK needed",
      ],
    },
    checkInReplies: [
      'Have them enter their date of birth',
      'Have them enter their Social Security number',
      'Explain the ways to pay and their prices',
    ],
    convoCats: ALL_CATS,
  },
  {
    id: 'solar',
    label: 'Solar',
    sub: 'Panels, batteries',
    planName: 'Solar',
    per: 'month',
    priceRequired: false,
    pricePlaceholder: 'Optional',
    hasInstall: false,
    companyLabel: 'Company',
    companyPlaceholder: 'Sunrun',
    factTopics: {
      'Your offer': [
        'Money down (none / $)',
        'Monthly payment, or how much they save',
        'Tax credit or incentives',
        'Free home assessment (yes / no)',
      ],
      'Who qualifies': ['Must own the home (yes / no)', 'Credit check (yes / no)', 'Lowest electric bill that makes sense'],
      'Install': [
        'How long until the panels are on',
        'Roof condition needed',
        'Who pays if the roof needs work first',
        'What happens if they sell or move',
      ],
      Extras: ['Warranty', 'Battery backup', CHECK_YOU_ARE_REAL],
    },
    checkInReplies: ['Ask if they own the home', 'Ask how much their light bill is', 'Set up the free assessment'],
    convoCats: ALL_CATS,
  },
  {
    id: 'security',
    label: 'Home security',
    sub: 'Alarms, cameras',
    planName: 'Home security',
    per: 'month',
    priceRequired: true,
    pricePlaceholder: '39',
    hasInstall: true,
    companyLabel: 'Company',
    companyPlaceholder: 'Vivint',
    factTopics: {
      'Your offer': [
        'Equipment included (cameras, door sensors, doorbell, alarm)',
        'Monitoring (24/7 by a team / they watch it on the app)',
        'Price stays the same for',
        'Current promo and when it ends',
      ],
      'The rules': ['Contract (none / months)', 'Cancellation fee', 'Credit check (yes / no)'],
      'Install': ['Install fee (free / $)', 'Soonest install', 'Drilling or wires', 'Renters allowed (yes / no)'],
      Extras: ['Phone app (yes / no)', 'If they move, can they take it', CHECK_YOU_ARE_REAL],
    },
    checkInReplies: ['Ask if they rent or own', 'Explain what equipment comes with it', 'Explain how the monitoring works'],
    convoCats: ALL_CATS,
  },
  {
    id: 'pest',
    label: 'Pest control',
    sub: 'Home service plans',
    planName: 'Pest control',
    per: 'month',
    priceRequired: true,
    pricePlaceholder: '49',
    hasInstall: true,
    companyLabel: 'Company',
    companyPlaceholder: 'Aptive',
    factTopics: {
      'Your offer': [
        'How often you come (monthly / every 3 months)',
        'Pests covered (roaches, ants, spiders, mice, termites)',
        'First visit price',
        'Current promo and when it ends',
      ],
      Safety: ['Safe for kids and pets (yes / how long to wait)', 'Do they need to leave the house'],
      'The rules': ['Contract (none / months)', 'Cancellation fee', 'Free re-treatment between visits (yes / no)'],
      Extras: ['Inside and outside treated', 'Soonest first visit', CHECK_YOU_ARE_REAL],
    },
    checkInReplies: ['Ask where they see the bugs most', 'Explain it is safe for kids and pets', 'Book the first visit'],
    convoCats: ALL_CATS,
  },
  {
    id: 'roofing',
    label: 'Roofing',
    sub: 'Inspections, repairs',
    planName: 'Roof inspection',
    per: 'once',
    priceRequired: false,
    pricePlaceholder: 'Optional',
    hasInstall: false,
    companyLabel: 'Company',
    companyPlaceholder: 'Your roofing company',
    factTopics: {
      'Your offer': ['Inspection (free / $)', 'Works with insurance claims (yes / no)', 'Financing (yes / no)'],
      'The process': ['How long the inspection takes', 'Do they need to be home', 'How long a new roof takes'],
      Extras: ['Warranty', 'Licensed and insured (yes / no)', CHECK_YOU_ARE_REAL],
    },
    checkInReplies: ['Ask how old the roof is', 'Ask if the last storm hit them', 'Set up the inspection'],
    convoCats: ALL_CATS,
  },
  {
    id: 'ministry',
    label: 'Ministry',
    sub: 'Church invites, outreach',
    planName: 'Invitation',
    per: 'none',
    priceRequired: false,
    pricePlaceholder: '',
    hasInstall: false,
    companyLabel: 'Church or ministry',
    companyPlaceholder: 'Iglesia Nueva Vida',
    factTopics: {
      'Your invitation': ['Event or service, day and time', 'Address', 'Service in Spanish (yes / no)'],
      Families: ["Kids' program", 'Food or breakfast', 'Rides offered (yes / no)'],
      'About you': ['Denomination', 'Pastor', 'Number or website for questions'],
    },
    checkInReplies: ['Ask if they want a text with the address', "Tell them about the kids' program", 'Ask if we can pray for them'],
    convoCats: ['intro', 'home', 'kids', 'weather', 'faith', 'food'],
  },
  {
    id: 'fundraiser',
    label: 'Fundraiser',
    sub: 'School, team, cause',
    planName: 'Cookies',
    per: 'once',
    priceRequired: true,
    pricePlaceholder: '5',
    hasInstall: false,
    companyLabel: 'School, team or group',
    companyPlaceholder: 'Bryan High Band',
    factTopics: {
      'Your offer': ['What the money is for', 'Ways to pay (cash / card / app)', 'Deals (2 for $ / more)'],
      Delivery: ['Do they get it now or later', 'When it arrives'],
      'About you': ['Who is raising money', 'Number or website for questions'],
    },
    checkInReplies: ['Ask how many they want', 'Tell them what the money is for'],
    convoCats: ['intro', 'home', 'kids', 'weather', 'food', 'hobbies'],
  },
  {
    id: 'other',
    label: 'Something else',
    sub: 'Set it up yourself',
    planName: 'Service',
    per: 'month',
    priceRequired: true,
    pricePlaceholder: '30',
    hasInstall: true,
    companyLabel: 'Company',
    companyPlaceholder: 'Your company',
    factTopics: {
      'Your offer': ['Price includes taxes and fees', 'Current promo and when it ends'],
      'The rules': ['Contract (none / months)', 'Cancellation fee', 'Credit check (yes / no)'],
      Extras: [CHECK_YOU_ARE_REAL],
    },
    checkInReplies: ['Have them enter their information', 'Explain the price again'],
    convoCats: ALL_CATS,
  },
];

export function industry(id: string | undefined): IndustryPack {
  return INDUSTRIES.find((i) => i.id === id) ?? INDUSTRIES[0];
}

/** What follows a price: "/mo" (" al mes" in Spanish) for monthly prices, nothing for one-time ones. */
export function priceWord(per: PricePer, es = false): string {
  if (per !== 'month') return '';
  return es ? ' al mes' : '/mo';
}

/**
 * Ana's default opening line, in Spanish, from what the rep entered. Only uses facts the rep gave:
 * install and contract words appear only when set.
 */
export function defaultPitch(opts: {
  industry: IndustryId;
  company: string;
  planName: string;
  price: number;
  freeInstall?: boolean;
  noContract?: boolean;
}): string {
  const p = opts.price > 0 ? (Number.isInteger(opts.price) ? `$${opts.price}` : `$${opts.price.toFixed(2)}`) : '';
  const extras = [opts.freeInstall ? 'la instalación es gratis' : '', opts.noContract ? 'no hay contrato' : '']
    .filter(Boolean)
    .join(' y ');
  const extra = extras ? ` ${extras.charAt(0).toUpperCase()}${extras.slice(1)}.` : '';
  const de = opts.company.trim() ? ` de ${opts.company.trim()}` : '';
  switch (opts.industry) {
    case 'internet':
      return (
        `Ofrecemos internet aquí en el área${p ? ` por solo ${p} al mes` : ''}.${extra} Si le interesa, normalmente ` +
        'solo necesitamos su nombre, un número de teléfono y su correo, y se lo dejamos listo. ¿Ya tiene internet en casa?'
      );
    case 'solar':
      return (
        'Estamos ayudando a los vecinos a bajar lo que pagan de luz con paneles solares' +
        `${p ? `, desde ${p} al mes` : ''}. ¿Usted es dueño de la casa?`
      );
    case 'security':
      return (
        `Estamos ofreciendo seguridad para la casa, con cámaras y alarma${p ? `, por ${p} al mes` : ''}.${extra} ` +
        '¿Ya tiene algo de seguridad en casa?'
      );
    case 'pest':
      return (
        `Estamos dando servicio de control de plagas aquí en su vecindario${p ? ` por ${p} al mes` : ''}.${extra} ` +
        '¿Ha visto cucarachas, hormigas o arañas en la casa?'
      );
    case 'roofing':
      return 'Estamos revisando los techos aquí en el vecindario después de las tormentas. ¿Cuántos años tiene su techo?';
    case 'ministry':
      return `Estamos invitando a los vecinos a nuestra iglesia${de}. ¿Tiene una iglesia a la que asiste?`;
    case 'fundraiser':
      return (
        `Estamos recaudando fondos${de}. ${opts.planName.trim() ? `Vendemos ${opts.planName.trim().toLowerCase()}` : 'Estamos vendiendo'}` +
        `${p ? ` a ${p}` : ''}. ¿Nos quiere apoyar?`
      );
    default:
      return (
        `Estamos ofreciendo ${opts.planName.trim().toLowerCase() || 'nuestro servicio'} aquí en el área` +
        `${p ? ` por ${p} al mes` : ''}.${extra} ¿Le puedo hacer una pregunta rápida?`
      );
  }
}
