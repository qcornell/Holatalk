/**
 * Build a conversation flow from UserSetup.
 * Uses the user's custom pitch, close, collect fields, and install instructions.
 * Falls back to defaults from the standard flow when user leaves fields blank.
 *
 * Template-aware: prunes telecom-specific steps for ministry, solar, and sales flows.
 */

import type { UserSetup } from '../config/storage';
import type { CompanyConfig } from '../config/types';
import { setupToConfig } from '../config/storage';
import { buildGuidedFlow } from './flow';
import type { ConvoStep } from './flow';

/**
 * Build a custom flow from user setup.
 * Overrides pitch, close, onboarding, and install steps.
 */
export function buildCustomFlow(setup: UserSetup): Map<string, ConvoStep> {
  const config = setupToConfig(setup);
  const steps = buildGuidedFlow(config);

  // ── Template-specific pruning (before overrides) ──
  pruneFlowForTemplate(steps, setup.selectedTemplate, setup);

  // Remove user-deleted probing questions
  const deletedQuestions = setup.deletedQuestions || [];
  for (const qId of deletedQuestions) {
    // Map review IDs to convo step IDs
    const convoId = qId === 'ask_had_company' ? 'ask_had_optimum' : qId;
    if (steps.has(convoId)) {
      steps.delete(convoId);
    }
  }

  // Remove the returning customer pitch — we only use one pitch (price_pitch_new)
  steps.delete('price_pitch_returning');

  // Override pitch step if user provided custom pitch
  if (setup.pitchEs || setup.pitchEn) {
    const pitchNew = steps.get('price_pitch_new');
    if (pitchNew) {
      if (setup.pitchEs) pitchNew.sayEs = setup.pitchEs;
      if (setup.pitchEn) pitchNew.coachEn = setup.pitchEn;
    }
  }

  // Override close offer if user provided custom close
  if (setup.closeOfferEs || setup.closeOfferEn) {
    const close = steps.get('close_offer');
    if (close) {
      if (setup.closeOfferEs) close.sayEs = setup.closeOfferEs;
      if (setup.closeOfferEn) close.coachEn = `🎯 ATTEMPT CLOSE: ${setup.closeOfferEn}`;
    }
  }

  // Add extra info step (only create the step — wiring happens in applyUserSectionOrder)
  if ((setup.extraInfoEn || setup.extraInfoEs) && setup.selectedTemplate !== 'ministry') {
    steps.set('extra_info_step', {
      id: 'extra_info_step',
      sayEs: setup.extraInfoEs || setup.extraInfoEn,
      coachEn: `ℹ️ EXTRA INFO: ${setup.extraInfoEn}`,
      listenFor: 'customer_response',
      autoListenMic: 'customer',
      phase: 'pitch',
      nextOnPositive: 'done',
      nextOnNegative: 'handle_objection',
      nextOnQuestion: 'handle_objection',
      isClose: false,
    });
  }

  // Add additional extra info sections (extra_0, extra_1, etc.)
  const extras = setup.extraSections || [];
  for (let i = 0; i < extras.length; i++) {
    if (extras[i].en || extras[i].es) {
      steps.set(`extra_info_${i}`, {
        id: `extra_info_${i}`,
        sayEs: extras[i].es || extras[i].en,
        coachEn: `ℹ️ EXTRA INFO ${i + 2}: ${extras[i].en}`,
        listenFor: 'customer_response',
        autoListenMic: 'customer',
        phase: 'pitch',
        nextOnPositive: 'done',
        nextOnNegative: 'handle_objection',
        nextOnQuestion: 'handle_objection',
        isClose: false,
      });
    }
  }

  // Override install instructions
  if (setup.installInstructionsEs || setup.installInstructionsEn) {
    const shipping = steps.get('shipping_info');
    if (shipping) {
      if (setup.installInstructionsEs) shipping.sayEs = setup.installInstructionsEs;
      if (setup.installInstructionsEn) shipping.coachEn = setup.installInstructionsEn;
    }
  }

  // Override closing/done message if user provided one
  if (setup.closingDoneEs || setup.closingDoneEn) {
    const doneStep = steps.get('done');
    if (doneStep) {
      if (setup.closingDoneEs) doneStep.sayEs = setup.closingDoneEs;
      if (setup.closingDoneEn) doneStep.coachEn = `🎉 ${setup.closingDoneEn}`;
    }
  }

  // Override objection responses if user customized them
  if (setup.objectionFirstEn || setup.objectionFirstEs) {
    const obj = steps.get('handle_objection');
    if (obj) {
      if (setup.objectionFirstEs) obj.sayEs = setup.objectionFirstEs;
      obj.coachEn = `🗣️ Says: "${setup.objectionFirstEn || 'I understand. Can I leave my info?'}"`;
    }
  }
  if (setup.objectionFinalEn || setup.objectionFinalEs) {
    const exit = steps.get('thank_exit');
    if (exit) {
      if (setup.objectionFinalEs) exit.sayEs = setup.objectionFinalEs;
      exit.coachEn = `🗣️ Says: "${setup.objectionFinalEn || 'No problem, thank you. Have a great day!'}"`;
    }
  }

  // Build collect steps (just create them — don't wire them yet)
  rebuildOnboardingSteps(steps, setup.collectFields, setup);

  // ── Apply user's section order — this is the SINGLE source of truth for wiring ──
  applyUserSectionOrder(steps, setup);

  return steps;
}

/**
 * Map review section IDs to the actual convo step IDs they control.
 */
function getConvoStepIds(sectionId: string, setup: UserSetup): string[] {
  switch (sectionId) {
    case 'greeting': return ['greeting'];
    case 'ask_service': return ['ask_service'];
    case 'ask_provider': return ['ask_provider'];
    case 'ask_how_long': return ['ask_how_long'];
    case 'ask_how_much': return ['ask_how_much'];
    case 'ask_had_company': return ['ask_had_optimum'];
    case 'pitch': return ['price_pitch_new'];
    case 'close': return ['close_offer'];
    case 'extra': return ['extra_info_step'];
    case 'collect': return setup.collectFields.map(f => `collect_${f}`);
    case 'install': return ['shipping_info'];
    case 'closing': return ['done'];
    default:
      // Handle extra_N sections (extra_0, extra_1, etc.)
      if (sectionId.startsWith('extra_')) {
        const idx = sectionId.split('_')[1];
        return [`extra_info_${idx}`];
      }
      return [];
  }
}

/**
 * Build the default section order based on template (used when user hasn't reordered).
 */
function getDefaultSectionOrder(setup: UserSetup): string[] {
  const order: string[] = ['greeting'];
  const template = setup.selectedTemplate;

  if (template === 'telecom') {
    order.push('ask_service', 'ask_provider', 'ask_how_long', 'ask_how_much', 'ask_had_company');
  } else if (template === 'solar') {
    order.push('ask_service');
  }
  // ministry + sales skip probing

  order.push('pitch', 'close');
  if (setup.extraInfoEn) order.push('extra');
  // Additional extra sections
  const extras = setup.extraSections || [];
  for (let i = 0; i < extras.length; i++) {
    if (extras[i].en) order.push(`extra_${i}`);
  }
  if (setup.collectFields.length > 0) order.push('collect');
  if (setup.installInstructionsEn) order.push('install');
  order.push('closing'); // always end with done

  return order;
}

/**
 * Re-wire the ENTIRE step chain based on the user's chosen order.
 * This is the SINGLE source of truth — no other function should wire nextOnPositive
 * for the main happy-path flow.
 */
function applyUserSectionOrder(steps: Map<string, ConvoStep>, setup: UserSetup) {
  // Use saved order if available, otherwise build default
  const order = (setup.sectionOrder && setup.sectionOrder.length > 0)
    ? setup.sectionOrder
    : getDefaultSectionOrder(setup);

  // Build the ordered chain of convo step IDs
  const chain: string[] = [];
  for (const sectionId of order) {
    const ids = getConvoStepIds(sectionId, setup);
    for (const id of ids) {
      if (steps.has(id)) chain.push(id);
    }
  }

  // Ensure 'done' is at the end if not already there
  if (chain.length > 0 && chain[chain.length - 1] !== 'done' && steps.has('done')) {
    // Remove any existing 'done' in the middle of chain
    const doneIdx = chain.indexOf('done');
    if (doneIdx !== -1) chain.splice(doneIdx, 1);
    chain.push('done');
  }

  if (chain.length < 2) return;

  console.log('[buildCustomFlow] Final chain:', chain.join(' → '));

  // Wire each step's nextOnPositive to the NEXT step in the chain
  for (let i = 0; i < chain.length - 1; i++) {
    const current = steps.get(chain[i]);
    const nextId = chain[i + 1];
    if (!current) continue;

    current.nextOnPositive = nextId;

    // Also wire nextOnNegative and nextOnQuestion for simple forward-flow steps
    // (but keep objection/question routing for steps that need it)
    if (current.nextOnQuestion && !['handle_objection', 'answer_question', 'objection_why'].includes(current.nextOnQuestion)) {
      current.nextOnQuestion = nextId;
    }
    // Collect steps should always chain forward regardless of sentiment
    if (current.id.startsWith('collect_')) {
      current.nextOnNegative = nextId;
      current.nextOnQuestion = nextId;
    }
  }

  // Last step is exit
  const lastStep = steps.get(chain[chain.length - 1]);
  if (lastStep) {
    lastStep.isExit = true;
  }
}

// ─────────────────────────────────────────────────────
// Template-specific flow pruning
// ─────────────────────────────────────────────────────

function pruneFlowForTemplate(steps: Map<string, ConvoStep>, template: string, setup: UserSetup) {
  switch (template) {
    case 'ministry':
      pruneForMinistry(steps, setup);
      break;
    case 'solar':
      pruneForSolar(steps, setup);
      break;
    case 'sales':
      pruneForSales(steps, setup);
      break;
    case 'telecom':
    default:
      // Keep everything as-is — this is the default flow
      break;
  }
}

/**
 * Safely remove a step from the map and rewire any steps that pointed to it.
 * If a step's nextOnPositive/nextOnNegative/nextOnQuestion pointed to the removed step,
 * it gets updated to point to `fallback` instead.
 */
function removeStepAndRewire(steps: Map<string, ConvoStep>, stepId: string, fallback: string) {
  // Find what the removed step pointed to (prefer its own nextOnPositive as better fallback)
  const removed = steps.get(stepId);
  const target = removed?.nextOnPositive || fallback;

  steps.delete(stepId);

  // Rewire all references
  for (const [, s] of steps) {
    if (s.nextOnPositive === stepId) s.nextOnPositive = target;
    if (s.nextOnNegative === stepId) s.nextOnNegative = target;
    if (s.nextOnQuestion === stepId) s.nextOnQuestion = target;
  }
}

// ── MINISTRY ──
function pruneForMinistry(steps: Map<string, ConvoStep>, setup: UserSetup) {
  // Remove telecom-specific steps
  const toRemove = [
    'ask_service', 'ask_provider', 'ask_how_long', 'ask_how_much', 'ask_had_optimum',
    'price_pitch_returning',
    'switching_push', 'answer_question',
    'payment_check', 'payment_amount', 'autopay_ask', 'autopay_method', 'autopay_decline',
    'shipping_info',
  ];

  for (const id of toRemove) {
    removeStepAndRewire(steps, id, 'close_offer');
  }

  // Simplify the done step
  const doneStep = steps.get('done');
  if (doneStep && !setup.closingDoneEn) {
    doneStep.sayEs = `¡Gracias! Esperamos verle allí. Que Dios le bendiga.`;
    doneStep.coachEn = `🎉 "Thank you! We hope to see you there. God bless you."`;
  }

  // Note: all wiring (greeting→pitch→close→collect→done) is handled by applyUserSectionOrder.
  // We just need to prune steps here. No manual nextOnPositive wiring needed.
}

// ── SOLAR ──
function pruneForSolar(steps: Map<string, ConvoStep>, setup: UserSetup) {
  const toRemove = [
    'ask_provider', 'ask_how_long', 'ask_how_much', 'ask_had_optimum',
    'price_pitch_returning',
    'payment_check', 'payment_amount', 'autopay_ask', 'autopay_method', 'autopay_decline',
  ];

  // Rewire ask_service to be about electricity
  const askService = steps.get('ask_service');
  if (askService) {
    askService.sayEs = '¿Quién es su proveedor de electricidad?';
    askService.coachEn = 'Ask: "Who is your electricity provider?"';
  }

  // Keep answer_question but remove telecom references
  const answerQ = steps.get('answer_question');
  if (answerQ) {
    answerQ.sayEs = 'No hay costo inicial. Le hacemos una evaluación gratis para ver cuánto puede ahorrar. ¿Tiene otra pregunta?';
    answerQ.coachEn = 'Answer their question. No upfront cost, free assessment.';
  }

  // Update switching_push for solar context
  const switchPush = steps.get('switching_push');
  if (switchPush) {
    switchPush.sayEs = 'Muchos vecinos ya se cambiaron a solar y están ahorrando bastante en su recibo de luz. La evaluación es completamente gratis.';
    switchPush.coachEn = '"Many neighbors have switched to solar. Assessment is free."';
  }

  for (const id of toRemove) {
    removeStepAndRewire(steps, id, 'close_offer');
  }

  const doneStep = steps.get('done');
  if (doneStep && !setup.closingDoneEn) {
    doneStep.sayEs = '¡Listo, ya quedó todo! Un técnico le va a contactar para programar la evaluación gratis. Que tenga un buen día.';
    doneStep.coachEn = '🎉 "All set! A technician will contact you to schedule the free assessment."';
  }
}

// ── SALES (Cookie/Fundraiser) ──
function pruneForSales(steps: Map<string, ConvoStep>, setup: UserSetup) {
  const toRemove = [
    'ask_service', 'ask_provider', 'ask_how_long', 'ask_how_much', 'ask_had_optimum',
    'price_pitch_returning',
    'switching_push', 'answer_question',
    'payment_check', 'payment_amount', 'autopay_ask', 'autopay_method', 'autopay_decline',
    'shipping_info',
  ];

  for (const id of toRemove) {
    removeStepAndRewire(steps, id, 'close_offer');
  }

  const doneStep = steps.get('done');
  if (doneStep && !setup.closingDoneEn) {
    doneStep.sayEs = '¡Muchas gracias por su apoyo! Que tenga un excelente día.';
    doneStep.coachEn = '🎉 "Thank you so much for your support! Have a great day."';
  }
}

// ─────────────────────────────────────────────────────
// Onboarding field questions
// ─────────────────────────────────────────────────────

// Field ID → question in Spanish / English coaching
const FIELD_QUESTIONS: Record<string, { sayEs: string; coachEn: string; captureAs: string }> = {
  firstName: { sayEs: '¡Perfecto! ¿Cuál es su primer nombre?', coachEn: '🟢 CLOSING! Ask: "What is the first name?"', captureAs: 'firstName' },
  lastName: { sayEs: '¿Apellido?', coachEn: 'Ask: "Last name?"', captureAs: 'lastName' },
  phone: { sayEs: '¿Número de teléfono?', coachEn: 'Ask: "Phone number?"', captureAs: 'phone' },
  email: { sayEs: '¿Correo electrónico?', coachEn: 'Ask: "Email address?"', captureAs: 'email' },
  address: { sayEs: '¿Cuál es su dirección?', coachEn: 'Ask: "What is your address?"', captureAs: 'address' },
  ssn: { sayEs: '¿Cuál es su número de seguro social o ITIN?', coachEn: 'Ask: "SSN or ITIN?"', captureAs: 'ssn' },
  pin: { sayEs: '¿Qué número de 4 dígitos quiere como PIN para su cuenta?', coachEn: 'Ask: "What 4-digit PIN for the account?"', captureAs: 'pin' },
  dob: { sayEs: '¿Cuál es su fecha de nacimiento?', coachEn: 'Ask: "Date of birth?"', captureAs: 'dob' },
};

function rebuildOnboardingSteps(steps: Map<string, ConvoStep>, fields: string[], setup: UserSetup) {
  if (fields.length === 0) return;

  // Remove ALL existing collect steps
  const existingCollect = [
    'collect_first_name', 'collect_last_name', 'collect_phone', 'collect_email', 'collect_pin',
    'collect_firstName', 'collect_lastName', 'collect_address', 'collect_ssn', 'collect_dob',
  ];
  existingCollect.forEach(id => steps.delete(id));

  // Create collect steps — chaining between them only (internal collect chain)
  // The wiring INTO and OUT OF the collect block is handled by applyUserSectionOrder
  for (let i = 0; i < fields.length; i++) {
    const fieldId = fields[i];
    const q = FIELD_QUESTIONS[fieldId];
    if (!q) continue;

    const stepId = `collect_${fieldId}`;
    const nextId = i < fields.length - 1
      ? `collect_${fields[i + 1]}`
      : 'done'; // placeholder — applyUserSectionOrder will overwrite this

    steps.set(stepId, {
      id: stepId,
      sayEs: q.sayEs,
      coachEn: q.coachEn,
      listenFor: 'customer_response',
      autoListenMic: 'none',
      phase: 'onboarding',
      captureAs: q.captureAs,
      nextOnPositive: nextId,
      nextOnNegative: nextId,
      nextOnQuestion: nextId,
      isClose: true,
    });
  }

  // Wire objection_why → first collect step (when customer changes their mind)
  const firstCollectId = `collect_${fields[0]}`;
  const objWhy = steps.get('objection_why');
  if (objWhy && steps.has(firstCollectId)) {
    objWhy.nextOnPositive = firstCollectId;
  }
}
