/**
 * Persistent config storage using AsyncStorage.
 * Saves user's custom setup so they don't re-enter info on restart.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CompanyConfig } from './types';
import { DEFAULT_CONFIG } from './types';

const STORAGE_KEY = '@hola_d2d_config';

export interface UserSetup {
  repName: string;
  companyName: string;
  // Pitch / Offer
  pitchEs: string;
  pitchEn: string;
  priceMonthly: number;
  hasContract: boolean;
  creditCheck: boolean;
  freeInstall: boolean;
  // Attempt Close
  closeOfferEs: string;
  closeOfferEn: string;
  // Extra Info (optional) — original single field (backward compat)
  extraInfoEn: string;
  extraInfoEs: string;
  // Additional extra info sections added from Review
  extraSections: { en: string; es: string }[];
  // Onboarding — what info to collect
  collectFields: string[];
  // Install instructions
  installInstructionsEs: string;
  installInstructionsEn: string;
  // Closing / done message
  closingDoneEn: string;
  closingDoneEs: string;
  // Objection handling (customizable rejection responses)
  objectionFirstEn: string;   // 1st rejection — soft push
  objectionFirstEs: string;
  objectionFinalEn: string;   // 2nd rejection — polite exit
  objectionFinalEs: string;
  // Probing questions deleted by user in Review
  deletedQuestions: string[];                // e.g. ['ask_how_long', 'ask_how_much']
  // Template tracking (for conditional UI)
  selectedTemplate: string;
  // Section ordering from review (pitch flow order)
  sectionOrder: string[];
  // Setup complete flag
  setupComplete: boolean;
}

export const DEFAULT_SETUP: UserSetup = {
  repName: '',
  companyName: '',
  pitchEs: '',
  pitchEn: '',
  priceMonthly: 25,
  hasContract: false,
  creditCheck: false,
  freeInstall: true,
  closeOfferEs: '',
  closeOfferEn: '',
  extraInfoEn: '',
  extraInfoEs: '',
  extraSections: [],
  collectFields: ['firstName', 'lastName', 'phone', 'email'],
  installInstructionsEs: '',
  installInstructionsEn: '',
  closingDoneEn: '',
  closingDoneEs: '',
  objectionFirstEn: '',
  objectionFirstEs: '',
  objectionFinalEn: '',
  objectionFinalEs: '',
  deletedQuestions: [],
  selectedTemplate: '',
  sectionOrder: [],
  setupComplete: false,
};

/**
 * Save user setup to persistent storage
 */
export async function saveSetup(setup: UserSetup): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(setup));
    console.log('[storage] Setup saved for:', setup.repName);
  } catch (e) {
    console.error('[storage] Save error:', e);
  }
}

/**
 * Load user setup from storage
 * Merges with DEFAULT_SETUP for backward compatibility with older saves.
 */
export async function loadSetup(): Promise<UserSetup | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Merge with defaults so new fields (extraInfoEn, selectedTemplate, etc.) get defaults
    const setup = { ...DEFAULT_SETUP, ...parsed } as UserSetup;
    console.log('[storage] Setup loaded for:', setup.repName);
    return setup;
  } catch (e) {
    console.error('[storage] Load error:', e);
    return null;
  }
}

/**
 * Clear saved setup
 */
export async function clearSetup(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
    console.log('[storage] Setup cleared');
  } catch (e) {
    console.error('[storage] Clear error:', e);
  }
}

// ─── Rep Profile (personal small-talk info) ───

export interface RepProfile {
  kidsCount: number;
  kidsNames: string;
  maritalStatus: 'single' | 'married' | 'complicated' | '';
  marriedDuration: string;
  hometown: string;
  hobbies: string[];
  otherHobby: string;
  jobDuration: string;
  favoriteFood: string;
  favoriteTeam: string;
}

const REP_PROFILE_KEY = '@hola_rep_profile';

export const DEFAULT_REP_PROFILE: RepProfile = {
  kidsCount: 0,
  kidsNames: '',
  maritalStatus: '',
  marriedDuration: '',
  hometown: '',
  hobbies: [],
  otherHobby: '',
  jobDuration: '',
  favoriteFood: '',
  favoriteTeam: '',
};

export async function saveRepProfile(profile: RepProfile): Promise<void> {
  try {
    await AsyncStorage.setItem(REP_PROFILE_KEY, JSON.stringify(profile));
    console.log('[storage] Rep profile saved');
  } catch (e) {
    console.error('[storage] Rep profile save error:', e);
  }
}

export async function loadRepProfile(): Promise<RepProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(REP_PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_REP_PROFILE, ...parsed } as RepProfile;
  } catch (e) {
    console.error('[storage] Rep profile load error:', e);
    return null;
  }
}

/**
 * Convert UserSetup → CompanyConfig for the conversation engine
 */
export function setupToConfig(setup: UserSetup): CompanyConfig {
  return {
    repName: setup.repName || DEFAULT_CONFIG.repName,
    companyName: setup.companyName || DEFAULT_CONFIG.companyName,
    plans: [{
      name: 'Internet',
      speed: '',
      priceMonthly: setup.priceMonthly,
    }],
    policies: {
      hasContract: setup.hasContract,
      creditCheck: setup.creditCheck,
      acceptedIds: DEFAULT_CONFIG.policies.acceptedIds,
      installationFee: setup.freeInstall ? 0 : 50,
    },
    promos: [{
      description: `$${setup.priceMonthly}/mo${setup.hasContract ? '' : ', no contract'}. ${setup.freeInstall ? 'Free installation.' : ''}`,
      descriptionEs: `$${setup.priceMonthly} al mes${setup.hasContract ? '' : ', sin contrato'}. ${setup.freeInstall ? 'Instalación gratis.' : ''}`,
    }],
  };
}
