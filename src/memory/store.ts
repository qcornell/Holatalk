import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RepMemory, InteractionLog, UnmatchedPhrase } from './types';

const MEMORY_KEY = '@hola_rep_memory';

/**
 * Rep Memory Store
 * 
 * Persistent local storage that survives app restarts.
 * Learns from every interaction to improve coaching over time.
 */

/** Load memory from disk */
export async function loadMemory(): Promise<RepMemory | null> {
  try {
    const raw = await AsyncStorage.getItem(MEMORY_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Save memory to disk */
export async function saveMemory(memory: RepMemory): Promise<void> {
  await AsyncStorage.setItem(MEMORY_KEY, JSON.stringify(memory));
}

/** Create fresh memory for a new rep */
export function createFreshMemory(name: string, company: string): RepMemory {
  return {
    profile: {
      name,
      company,
      territory: '',
      preferredLanguage: 'en',
      startDate: new Date().toISOString().split('T')[0],
    },
    config: {
      plans: [],
      policies: {
        hasContract: false,
        creditCheck: false,
        acceptedIds: ['matrícula', 'ITIN', 'pasaporte mexicano', 'ID de estado'],
        installationFee: 0,
        notes: [],
      },
      promos: [],
      customResponses: [],
    },
    patterns: {
      topObjections: [],
      topBuyingSignals: [],
      winningPhrases: [],
      unmatchedPhrases: [],
    },
    stats: {
      totalDoors: 0,
      totalSales: 0,
      closeRate: 0,
      avgTimePerDoor: 0,
      bestHour: '',
      bestDay: '',
      streakCurrent: 0,
      streakBest: 0,
    },
    dailyLogs: [],
  };
}

/**
 * Record an interaction — this is how the app learns.
 * Called after every door.
 */
export async function recordInteraction(
  memory: RepMemory,
  interaction: InteractionLog,
  detectedIntentId: string | null,
): Promise<RepMemory> {
  const today = new Date().toISOString().split('T')[0];

  // Find or create today's log
  let dailyLog = memory.dailyLogs.find(d => d.date === today);
  if (!dailyLog) {
    dailyLog = {
      date: today,
      doorsKnocked: 0,
      sales: 0,
      topObjection: '',
      notes: '',
      interactions: [],
    };
    memory.dailyLogs.push(dailyLog);
  }

  // Add interaction
  dailyLog.interactions.push(interaction);
  dailyLog.doorsKnocked++;

  if (interaction.outcome === 'sale') {
    dailyLog.sales++;
    memory.stats.totalSales++;
    memory.stats.streakCurrent++;
    if (memory.stats.streakCurrent > memory.stats.streakBest) {
      memory.stats.streakBest = memory.stats.streakCurrent;
    }
  } else if (interaction.outcome === 'rejected') {
    memory.stats.streakCurrent = 0;
  }

  memory.stats.totalDoors++;
  memory.stats.closeRate = memory.stats.totalDoors > 0
    ? Math.round((memory.stats.totalSales / memory.stats.totalDoors) * 100)
    : 0;

  // Track objection patterns
  if (detectedIntentId && ['NOT_INTERESTED', 'CONTRACT_FEAR', 'CREDIT_ID_FEAR', 'DECISION_MAKER_ABSENT'].includes(detectedIntentId)) {
    const existing = memory.patterns.topObjections.find(p => p.intentId === detectedIntentId);
    if (existing) {
      existing.count++;
      existing.lastHeard = new Date().toISOString();
    } else {
      memory.patterns.topObjections.push({
        phrase: interaction.customerSaid,
        count: 1,
        lastHeard: new Date().toISOString(),
        intentId: detectedIntentId,
      });
    }
    // Sort by frequency
    memory.patterns.topObjections.sort((a, b) => b.count - a.count);
  }

  // Track buying signals
  if (detectedIntentId === 'BUYING_SIGNAL') {
    const existing = memory.patterns.topBuyingSignals.find(p => p.phrase === interaction.customerSaid);
    if (existing) {
      existing.count++;
    } else {
      memory.patterns.topBuyingSignals.push({
        phrase: interaction.customerSaid,
        count: 1,
        lastHeard: new Date().toISOString(),
        intentId: 'BUYING_SIGNAL',
      });
    }
  }

  // Track unmatched phrases (goldmine for improving the corpus)
  if (!detectedIntentId && interaction.customerSaid.length > 5) {
    const existing = memory.patterns.unmatchedPhrases.find(
      p => p.phrase.toLowerCase() === interaction.customerSaid.toLowerCase()
    );
    if (existing) {
      existing.count++;
      existing.lastHeard = new Date().toISOString();
    } else {
      memory.patterns.unmatchedPhrases.push({
        phrase: interaction.customerSaid,
        count: 1,
        lastHeard: new Date().toISOString(),
      });
    }
    // Keep top 50 unmatched, sorted by frequency
    memory.patterns.unmatchedPhrases.sort((a, b) => b.count - a.count);
    if (memory.patterns.unmatchedPhrases.length > 50) {
      memory.patterns.unmatchedPhrases = memory.patterns.unmatchedPhrases.slice(0, 50);
    }
  }

  // Learn best hour / best day
  const hour = new Date().getHours();
  const day = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  // TODO: track per-hour and per-day close rates for smarter coaching

  await saveMemory(memory);
  return memory;
}

/** Get a quick stats summary for the rep */
export function getStatsSummary(memory: RepMemory): string {
  const { stats } = memory;
  const today = memory.dailyLogs.find(d => d.date === new Date().toISOString().split('T')[0]);
  
  return [
    `📊 Overall: ${stats.totalSales}/${stats.totalDoors} doors (${stats.closeRate}% close rate)`,
    today ? `📅 Today: ${today.sales}/${today.doorsKnocked} doors` : '📅 Today: No doors yet',
    stats.streakCurrent > 1 ? `🔥 Streak: ${stats.streakCurrent} in a row!` : '',
    memory.patterns.topObjections[0] ? `🔴 Top objection: ${memory.patterns.topObjections[0].intentId}` : '',
  ].filter(Boolean).join('\n');
}
