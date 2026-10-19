/**
 * Company/Rep configuration — the customizable 10%
 * Everything the intent engine needs to generate coached responses.
 */

export interface PlanInfo {
  name: string;
  speed: string;
  priceMonthly: number;
  features?: string[];
}

export interface CompanyConfig {
  /** Rep's first name */
  repName: string;
  /** Company name */
  companyName: string;
  /** Available plans */
  plans: PlanInfo[];
  /** Company policies */
  policies: {
    hasContract: boolean;
    contractLength?: string;
    earlyTerminationFee?: number;
    creditCheck: boolean;
    acceptedIds: string[];    // ['matrícula', 'ITIN', 'pasaporte', 'ID estatal']
    installationFee: number;  // 0 = free
  };
  /** Current promos */
  promos: {
    description: string;
    descriptionEs: string;
    expiresAt?: string;
  }[];
  /** Custom phrase overrides (company-specific Q&A) */
  customPhrases?: {
    trigger: string;       // Spanish phrase to detect
    responseEn: string;    // English coaching for rep
    responseEs: string;    // Spanish for rep to say (or speaker mode)
  }[];
}

/** Default config for testing / demo */
export const DEFAULT_CONFIG: CompanyConfig = {
  repName: 'Quentin',
  companyName: 'Optimum',
  plans: [
    { name: 'Internet', speed: '300 Mbps', priceMonthly: 25 },
  ],
  policies: {
    hasContract: false,
    creditCheck: false,
    acceptedIds: ['matrícula', 'ITIN', 'pasaporte mexicano', 'ID de estado'],
    installationFee: 0,
  },
  promos: [
    {
      description: '$25/mo, no contract, price stays the same. Free installation.',
      descriptionEs: '$25 al mes, sin contrato, y el precio no sube. Instalación gratis.',
    },
  ],
};
