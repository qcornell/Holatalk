/**
 * State Machine for Hola conversation flow.
 * Controls mic auto-listen logic and conversation state transitions.
 */

export type ConvoState =
  | 'PITCH'
  | 'POST_PITCH_LISTEN'
  | 'ATTEMPT_CLOSE'
  | 'ONBOARDING_YES'
  | 'OBJECTION_PROMPT'
  | 'OBJECTION_LISTEN'
  | 'OBJECTION_RESPONSE'
  | 'EXIT';

export type MicMode = 'off' | 'customer_auto' | 'customer_manual' | 'rep_manual';

export interface StateConfig {
  id: ConvoState;
  micMode: MicMode;
  nextStates: Partial<Record<TransitionEvent, ConvoState>>;
  description: string;
}

export type TransitionEvent =
  | 'pitch_complete'
  | 'customer_replied'
  | 'timeout'
  | 'yes'
  | 'no'
  | 'objection_captured'
  | 'response_given'
  | 'exit_now';

/**
 * State Machine Definition
 */
const stateMap: Record<ConvoState, StateConfig> = {
  PITCH: {
    id: 'PITCH',
    micMode: 'off',
    nextStates: {
      pitch_complete: 'POST_PITCH_LISTEN',
    },
    description: 'Rep is pitching. No auto-listen. Rep manually advances.',
  },
  POST_PITCH_LISTEN: {
    id: 'POST_PITCH_LISTEN',
    micMode: 'off',
    nextStates: {
      customer_replied: 'ATTEMPT_CLOSE',
      timeout: 'ATTEMPT_CLOSE',
    },
    description: 'Customer mic auto-listen DISABLED for now. Manual tap only.',
  },
  ATTEMPT_CLOSE: {
    id: 'ATTEMPT_CLOSE',
    micMode: 'off',
    nextStates: {
      yes: 'ONBOARDING_YES',
      no: 'OBJECTION_PROMPT',
    },
    description: 'Customer mic auto-listen DISABLED for now. Yes/No buttons available.',
  },
  ONBOARDING_YES: {
    id: 'ONBOARDING_YES',
    micMode: 'off',
    nextStates: {
      exit_now: 'EXIT',
    },
    description: 'Guided prompts. No auto-listen. Manual customer mic if needed.',
  },
  OBJECTION_PROMPT: {
    id: 'OBJECTION_PROMPT',
    micMode: 'off',
    nextStates: {
      objection_captured: 'OBJECTION_LISTEN',
      yes: 'ONBOARDING_YES',
      no: 'OBJECTION_LISTEN',
    },
    description: 'Rep asks "Why?". Yes = changed mind → onboarding. No = capture objection.',
  },
  OBJECTION_LISTEN: {
    id: 'OBJECTION_LISTEN',
    micMode: 'off',
    nextStates: {
      objection_captured: 'OBJECTION_RESPONSE',
      exit_now: 'EXIT',
    },
    description: 'Customer mic auto-listens for objection (Spanish → English).',
  },
  OBJECTION_RESPONSE: {
    id: 'OBJECTION_RESPONSE',
    micMode: 'off',
    nextStates: {
      response_given: 'OBJECTION_LISTEN',
      exit_now: 'EXIT',
    },
    description: 'System gives 1 Spanish response script. 1-2 attempts max.',
  },
  EXIT: {
    id: 'EXIT',
    micMode: 'off',
    nextStates: {},
    description: 'Stop pushing. Guide rep to exit politely.',
  },
};

export class ConvoStateMachine {
  private currentState: ConvoState;
  private attemptCount: number = 0;
  private maxAttempts: number = 2;

  constructor(initialState: ConvoState = 'PITCH') {
    this.currentState = initialState;
  }

  getState(): ConvoState {
    return this.currentState;
  }

  getConfig(): StateConfig {
    return stateMap[this.currentState];
  }

  getMicMode(): MicMode {
    return this.getConfig().micMode;
  }

  transition(event: TransitionEvent): ConvoState | null {
    const config = this.getConfig();
    const nextState = config.nextStates[event];

    if (!nextState) {
      console.warn(`[StateMachine] No transition for event "${event}" in state "${this.currentState}"`);
      return null;
    }

    console.log(`[StateMachine] ${this.currentState} --[${event}]--> ${nextState}`);
    this.currentState = nextState;

    // Reset attempt count when entering OBJECTION_RESPONSE
    if (nextState === 'OBJECTION_RESPONSE') {
      this.attemptCount = 0;
    }

    // Increment attempt count when giving objection response
    if (nextState === 'OBJECTION_LISTEN' && event === 'response_given') {
      this.attemptCount++;
      if (this.attemptCount >= this.maxAttempts) {
        console.log('[StateMachine] Max attempts reached. Transitioning to EXIT.');
        this.currentState = 'EXIT';
        return 'EXIT';
      }
    }

    return nextState;
  }

  reset() {
    this.currentState = 'PITCH';
    this.attemptCount = 0;
  }

  shouldAutoListen(): boolean {
    return this.getMicMode() === 'customer_auto';
  }

  getAutoListenTarget(): 'customer' | null {
    if (this.getMicMode() === 'customer_auto') return 'customer';
    return null;
  }
}

export default ConvoStateMachine;
