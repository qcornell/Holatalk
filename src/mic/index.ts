/**
 * Dual Mic Logic
 * Only one mic can auto-listen at a time.
 * Customer mic (Spanish → English) and Rep mic (English → Spanish).
 */

import type { MicMode } from '../state';

export type MicTarget = 'customer' | 'rep';

export interface MicController {
  currentTarget: MicTarget;
  isAutoListening: boolean;
  canAutoListen: (mode: MicMode) => boolean;
  startAutoListen: (target: MicTarget) => void;
  stopAutoListen: () => void;
  startManualListen: (target: MicTarget) => void;
  stopManualListen: () => void;
}

export class DualMicController implements MicController {
  currentTarget: MicTarget = 'customer';
  isAutoListening: boolean = false;
  private isManualListening: boolean = false;

  canAutoListen(mode: MicMode): boolean {
    // Only auto-listen if not already listening (manual or auto)
    if (this.isAutoListening || this.isManualListening) return false;

    // Only customer mic ever auto-listens
    return mode === 'customer_auto';
  }

  startAutoListen(target: MicTarget) {
    if (this.isAutoListening || this.isManualListening) {
      console.warn('[MicController] Already listening. Cannot start auto-listen.');
      return;
    }

    console.log(`[MicController] Auto-listen started: ${target} mic`);
    this.currentTarget = target;
    this.isAutoListening = true;
  }

  stopAutoListen() {
    console.log('[MicController] Auto-listen stopped');
    this.isAutoListening = false;
  }

  startManualListen(target: MicTarget) {
    // Manual tap always wins — force-stop any stale auto-listen
    if (this.isAutoListening) {
      console.log('[MicController] Force-stopping stale auto-listen for manual tap');
      this.isAutoListening = false;
    }

    if (this.isManualListening) {
      console.warn('[MicController] Already manual listening. Resetting.');
      this.isManualListening = false;
    }

    console.log(`[MicController] Manual listen started: ${target} mic`);
    this.currentTarget = target;
    this.isManualListening = true;
  }

  stopManualListen() {
    console.log('[MicController] Manual listen stopped');
    this.isManualListening = false;
  }

  reset() {
    this.isAutoListening = false;
    this.isManualListening = false;
    this.currentTarget = 'customer';
  }

  getStatus() {
    return {
      target: this.currentTarget,
      isAuto: this.isAutoListening,
      isManual: this.isManualListening,
      isListening: this.isAutoListening || this.isManualListening,
    };
  }
}

export const micController = new DualMicController();
