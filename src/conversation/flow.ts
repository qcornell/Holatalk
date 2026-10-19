/**
 * Hola Conversation Flow Engine — Quentin's Optimum Script
 * 
 * DUAL MIC ARCHITECTURE:
 *   🎤🟣 Customer Mic (Spanish → English) — listens to customer
 *   🎤🟠 Rep Mic (English → Spanish) — listens to rep (for manual translation)
 * 
 * FLOW PHASES:
 *   1. PITCH PHASE: greeting → ask_service → ask_provider → ask_how_long → 
 *      ask_had_optimum → price_pitch → switching_push
 *      - After each pitch step is spoken/read, Customer Mic auto-listens
 *      - If no response or irrelevant → next screen (or rep taps Next)
 *   
 *   2. ATTEMPT CLOSE: close_offer (quiet state)
 *      - Yes/No moment. NO auto-listening by default.
 *      - YES → Onboarding flow (no auto-listen, prompts guide rep)
 *      - NO → Objection handling (Customer Mic auto-listens for reason)
 *   
 *   3. ONBOARDING (close_won): collect info steps
 *      - No auto-listening. Rep manually uses Customer Mic if needed.
 *   
 *   4. OBJECTION HANDLING:
 *      - System asks rep to find out why → Customer Mic auto-listens
 *      - Hard stop → exit politely, don't push
 *      - Overcomable → give 1-2 Spanish response scripts
 *      - After 1-2 attempts, if still no → prompt to exit
 *
 * KEY RULE: Never auto-listen on both mics at the same time.
 */

import { CompanyConfig } from '../config/types';

export type MicTarget = 'customer' | 'rep' | 'none';

export type FlowPhase = 'pitch' | 'attempt_close' | 'onboarding' | 'objection' | 'exit';

export type ConvoStep = {
  id: string;
  /** What to say in Spanish (spoken aloud) */
  sayEs: string;
  /** English coaching for rep (shown on screen) */
  coachEn: string;
  /** After saying this, what are we listening for? */
  listenFor: 'customer_response' | 'rep_confirmation' | 'none';
  /** Which mic should auto-listen after this step's audio plays? */
  autoListenMic: MicTarget;
  /** Which phase of the flow is this step in? */
  phase: FlowPhase;
  /** Next step if customer responds positively / neutrally */
  nextOnPositive?: string;
  /** Next step if customer objects / says no */
  nextOnNegative?: string;
  /** Next step if customer asks a question */
  nextOnQuestion?: string;
  /** Is this a closing step? */
  isClose?: boolean;
  /** Is this an exit step? */
  isExit?: boolean;
  /** Dynamic — the system should capture this response for use later */
  captureAs?: string;
};

/**
 * Build the guided conversation flow from company config.
 * Returns a map of step ID → ConvoStep
 */
export function buildGuidedFlow(config: CompanyConfig): Map<string, ConvoStep> {
  const { repName, companyName, plans, policies, promos } = config;
  const plan = plans[0];
  const promo = promos[0];

  const steps = new Map<string, ConvoStep>();

  // ═══════════════════════════════════════
  // PHASE 1: PITCH
  // After each step is spoken, Customer Mic auto-listens
  // ═══════════════════════════════════════

  steps.set('greeting', {
    id: 'greeting',
    sayEs: `Hola, soy ${repName} de ${companyName}.`,
    coachEn: `Greet: "Hi, my name is ${repName} with ${companyName}."`,
    listenFor: 'rep_confirmation',
    autoListenMic: 'none', // Rep speaks the greeting, no auto-listen needed
    phase: 'pitch',
    nextOnPositive: 'ask_service',
  });

  steps.set('ask_service', {
    id: 'ask_service',
    sayEs: `¿Tiene servicio de cable o internet?`,
    coachEn: `Ask: "Do you have cable or internet?"`,
    listenFor: 'customer_response',
    autoListenMic: 'customer',
    phase: 'pitch',
    nextOnPositive: 'ask_provider',
    nextOnNegative: 'price_pitch_new',
    nextOnQuestion: 'ask_provider',
  });

  steps.set('ask_provider', {
    id: 'ask_provider',
    sayEs: `¿Con qué compañía?`,
    coachEn: `Ask: "With what company?" (Listen for: T-Mobile, Spectrum, AT&T, etc.)`,
    listenFor: 'customer_response',
    autoListenMic: 'customer',
    phase: 'pitch',
    captureAs: 'provider',
    nextOnPositive: 'ask_how_long',
    nextOnNegative: 'ask_how_long',
    nextOnQuestion: 'ask_how_long',
  });

  steps.set('ask_how_long', {
    id: 'ask_how_long',
    sayEs: `¿Cuánto tiempo tiene con ellos?`,
    coachEn: `Ask: "How long have you been with [provider]?"`,
    listenFor: 'customer_response',
    autoListenMic: 'customer',
    phase: 'pitch',
    nextOnPositive: 'ask_how_much',
    nextOnNegative: 'ask_how_much',
    nextOnQuestion: 'ask_how_much',
  });

  steps.set('ask_how_much', {
    id: 'ask_how_much',
    sayEs: `¿Y cuánto paga cada mes por su servicio?`,
    coachEn: `Ask: "How much is your service each month?" (Use their answer to compare with our price)`,
    listenFor: 'customer_response',
    autoListenMic: 'customer',
    phase: 'pitch',
    captureAs: 'currentPrice',
    nextOnPositive: 'ask_had_optimum',
    nextOnNegative: 'ask_had_optimum',
    nextOnQuestion: 'ask_had_optimum',
  });

  steps.set('ask_had_optimum', {
    id: 'ask_had_optimum',
    sayEs: `¿Alguna vez ha tenido ${companyName}?`,
    coachEn: `Ask: "Have you ever had ${companyName}?"  YES → returning customer pitch. NO → new customer pitch.`,
    listenFor: 'customer_response',
    autoListenMic: 'customer',
    phase: 'pitch',
    nextOnPositive: 'price_pitch_returning',
    nextOnNegative: 'price_pitch_new',
    nextOnQuestion: 'price_pitch_new',
  });

  steps.set('price_pitch_returning', {
    id: 'price_pitch_returning',
    sayEs: `¡Qué bueno! Acabamos de bajar nuestros precios a $${plan.priceMonthly} al mes. Sin contrato, y el precio se queda igual.`,
    coachEn: `"Great! We just lowered our prices to $${plan.priceMonthly}/mo. No contract, price stays the same."`,
    listenFor: 'customer_response',
    autoListenMic: 'customer',
    phase: 'pitch',
    nextOnPositive: 'close_offer',
    nextOnNegative: 'handle_objection',
    nextOnQuestion: 'answer_question',
  });

  steps.set('price_pitch_new', {
    id: 'price_pitch_new',
    sayEs: `Tenemos un servicio de internet muy bueno a solo $${plan.priceMonthly} al mes. Sin contrato, el precio no sube, y es más rápido y confiable que muchos otros servicios.`,
    coachEn: `Pitch: "$${plan.priceMonthly}/mo, no contract, price stays the same. Faster and more reliable."`,
    listenFor: 'customer_response',
    autoListenMic: 'customer',
    phase: 'pitch',
    nextOnPositive: 'close_offer',
    nextOnNegative: 'handle_objection',
    nextOnQuestion: 'answer_question',
  });

  steps.set('answer_question', {
    id: 'answer_question',
    sayEs: `${policies.hasContract ? '' : 'No hay contrato.'} ${policies.creditCheck ? 'Sí se revisa el crédito.' : 'No checamos crédito.'} Instalación gratis. ¿Tiene otra pregunta?`,
    coachEn: `Answer their question. No contract, no credit check, free install. Then move to switching_push.`,
    listenFor: 'customer_response',
    autoListenMic: 'customer',
    phase: 'pitch',
    nextOnPositive: 'switching_push',
    nextOnNegative: 'switching_push',
    nextOnQuestion: 'answer_question',
  });

  steps.set('switching_push', {
    id: 'switching_push',
    sayEs: `Mucha gente se está cambiando porque somos más baratos y más rápidos. La instalación es completamente gratis.`,
    coachEn: `"A lot of people are switching because we're cheaper and faster. Free installation."`,
    listenFor: 'customer_response',
    autoListenMic: 'customer',
    phase: 'pitch',
    nextOnPositive: 'close_offer',
    nextOnNegative: 'handle_objection',
    nextOnQuestion: 'answer_question',
  });

  // ═══════════════════════════════════════
  // PHASE 2: ATTEMPT CLOSE (quiet state)
  // No auto-listening. Yes/No buttons. This is the moment of truth.
  // ═══════════════════════════════════════

  steps.set('close_offer', {
    id: 'close_offer',
    sayEs: `Si le interesa, es posible que no tenga que pagar nada hoy. Solo necesitamos un buen nombre, número de teléfono, y correo electrónico, y le mandamos el módem. Instalación gratis.`,
    coachEn: `🎯 ATTEMPT CLOSE: "If interested, you may not pay anything today. Just need name, number, email. Free install." Wait for Yes/No.`,
    listenFor: 'customer_response',
    autoListenMic: 'customer', // Auto-listen for customer's yes/no after text is read
    phase: 'attempt_close',
    nextOnPositive: 'collect_first_name',
    nextOnNegative: 'objection_why',
    nextOnQuestion: 'answer_question',
    isClose: true,
  });

  // ═══════════════════════════════════════
  // PHASE 3: ONBOARDING (close won)
  // No auto-listening. Prompts guide rep to collect info in Spanish.
  // Rep can manually press Customer Mic if needed for translation.
  // ═══════════════════════════════════════

  steps.set('collect_first_name', {
    id: 'collect_first_name',
    sayEs: `¡Perfecto! ¿Cuál es su primer nombre?`,
    coachEn: `🟢 CLOSING! Ask: "What is the first name?"`,
    listenFor: 'customer_response',
    autoListenMic: 'none', // Onboarding = no auto-listen
    phase: 'onboarding',
    captureAs: 'firstName',
    nextOnPositive: 'collect_last_name',
    nextOnNegative: 'collect_last_name',
    nextOnQuestion: 'collect_last_name',
    isClose: true,
  });

  steps.set('collect_last_name', {
    id: 'collect_last_name',
    sayEs: `¿Apellido?`,
    coachEn: `Ask: "Last name?"`,
    listenFor: 'customer_response',
    autoListenMic: 'none',
    phase: 'onboarding',
    captureAs: 'lastName',
    nextOnPositive: 'collect_phone',
    nextOnNegative: 'collect_phone',
    nextOnQuestion: 'collect_phone',
    isClose: true,
  });

  steps.set('collect_phone', {
    id: 'collect_phone',
    sayEs: `¿Número de teléfono?`,
    coachEn: `Ask: "Telephone number?"`,
    listenFor: 'customer_response',
    autoListenMic: 'none',
    phase: 'onboarding',
    captureAs: 'phone',
    nextOnPositive: 'collect_email',
    nextOnNegative: 'collect_email',
    nextOnQuestion: 'collect_email',
    isClose: true,
  });

  steps.set('collect_email', {
    id: 'collect_email',
    sayEs: `¿Correo electrónico?`,
    coachEn: `Ask: "Email address?"`,
    listenFor: 'customer_response',
    autoListenMic: 'none',
    phase: 'onboarding',
    captureAs: 'email',
    nextOnPositive: 'shipping_info',
    nextOnNegative: 'shipping_info',
    nextOnQuestion: 'shipping_info',
    isClose: true,
  });

  // ═══════════════════════════════════════
  // PAYMENT → AUTOPAY → PIN → SHIPPING/DONE
  // Flow: collect info → payment_check → (pay or skip) → autopay_ask →
  //       (yes: checking/debit) or (no: pay by phone) → collect_pin → shipping → done
  // ═══════════════════════════════════════

  steps.set('payment_check', {
    id: 'payment_check',
    sayEs: `Déjeme verificar si se requiere algún pago.`,
    coachEn: `Check if customer needs to pay today.\n\n💰 PAY — Enter amount and tap Pay\n🆓 NO PAY — Tap Skip if nothing due today`,
    listenFor: 'none',
    autoListenMic: 'none',
    phase: 'onboarding',
    nextOnPositive: 'payment_amount',   // Pay button
    nextOnNegative: 'autopay_ask',      // Skip / No Pay button
    isClose: true,
  });

  steps.set('payment_amount', {
    id: 'payment_amount',
    sayEs: `El pago de hoy es de $${plan.priceMonthly}. ¿Prefiere pagar con tarjeta de débito o con cheque?`,
    coachEn: `💳 Payment is $${plan.priceMonthly} today. Ask: "Debit or checking?"\n\nNext → Autopay setup`,
    listenFor: 'customer_response',
    autoListenMic: 'none',
    phase: 'onboarding',
    nextOnPositive: 'autopay_ask',
    nextOnNegative: 'autopay_ask',
    nextOnQuestion: 'autopay_ask',
    isClose: true,
  });

  steps.set('autopay_ask', {
    id: 'autopay_ask',
    sayEs: `¿Le gustaría configurar el pago automático para que no tenga que preocuparse cada mes?`,
    coachEn: `Ask: "Would you like to set up autopay so you don't have to worry each month?"\n\n👍 YES → checking or debit\n👎 NO → pay by phone/office`,
    listenFor: 'customer_response',
    autoListenMic: 'none',
    phase: 'onboarding',
    nextOnPositive: 'autopay_method',
    nextOnNegative: 'autopay_decline',
    nextOnQuestion: 'autopay_method',
    isClose: true,
  });

  steps.set('autopay_method', {
    id: 'autopay_method',
    sayEs: `Perfecto. ¿Prefiere autopago con cuenta de cheques o tarjeta de débito?`,
    coachEn: `Ask: "Checking account or debit card for autopay?"`,
    listenFor: 'customer_response',
    autoListenMic: 'none',
    phase: 'onboarding',
    nextOnPositive: 'shipping_info',
    nextOnNegative: 'shipping_info',
    nextOnQuestion: 'shipping_info',
    isClose: true,
  });

  steps.set('autopay_decline', {
    id: 'autopay_decline',
    sayEs: `Está bien. Puede llamar para pagar por teléfono o pasar por la oficina cada mes.`,
    coachEn: `No autopay. Tell them: "You can call to pay by phone or stop by the office each month."`,
    listenFor: 'none',
    autoListenMic: 'none',
    phase: 'onboarding',
    nextOnPositive: 'shipping_info',
    isClose: true,
  });

  // NOTE: collect_pin is NOT hardcoded here — it's created dynamically by buildCustomFlow
  // if the user selects "4-Digit PIN" in their setup collectFields.
  // The chain is: autopay → shipping_info (or collect_pin → shipping if user selected pin)

  steps.set('shipping_info', {
    id: 'shipping_info',
    sayEs: `Le mandamos el módem por FedEx, llega en 2 días. Solo viene con un cable para conectar al enchufe de cable en la pared. Escanea el código QR para activarlo.`,
    coachEn: `🎉 CLOSE! "Modem ships FedEx, 2 days. One cable to wall jack. Scan QR to activate."`,
    listenFor: 'none',
    autoListenMic: 'none',
    phase: 'onboarding',
    nextOnPositive: 'done',
    isClose: true,
  });

  steps.set('done', {
    id: 'done',
    sayEs: `¡Listo, ya quedó todo! Le voy a dar mi tarjeta. Cuando llegue el módem, si necesita ayuda para instalarlo, mándeme un mensaje de texto y le puedo contestar en español.`,
    coachEn: `🎉 SALE COMPLETE! "All set! Here's my card. Text me when modem arrives if you need help."`,
    listenFor: 'none',
    autoListenMic: 'none',
    phase: 'onboarding',
    isClose: true,
    isExit: true,
  });

  // ═══════════════════════════════════════
  // PHASE 4: OBJECTION HANDLING
  // Customer Mic auto-listens to capture the reason (Spanish → English)
  // System decides: hard stop → exit, or overcomable → give script
  // After 1-2 attempts if still no → exit
  // ═══════════════════════════════════════

  steps.set('objection_why', {
    id: 'objection_why',
    sayEs: `¿Hay algo que le preocupa? ¿Puedo contestar alguna pregunta?`,
    coachEn: `🗣️ Says: "Is there something concerning you? Can I answer a question?"\n\n👉 TAP CUSTOMER MIC 🟠 TO HEAR THEIR OBJECTION`,
    listenFor: 'customer_response',
    autoListenMic: 'none',
    phase: 'objection',
    nextOnPositive: 'collect_first_name', // Yes = they changed their mind → start onboarding
    nextOnNegative: 'handle_objection',
    nextOnQuestion: 'answer_question',
  });

  steps.set('handle_objection', {
    id: 'handle_objection',
    sayEs: `Lo entiendo completamente. ¿Le puedo dejar mi información por si cambia de opinión? No le cuesta nada.`,
    coachEn: `🗣️ Says: "I completely understand. Can I leave my info in case you change your mind? It costs nothing."`,
    listenFor: 'customer_response',
    autoListenMic: 'customer',
    phase: 'objection',
    nextOnPositive: 'leave_info',
    nextOnNegative: 'thank_exit',
    nextOnQuestion: 'answer_question',
  });

  steps.set('soft_close', {
    id: 'soft_close',
    sayEs: `No hay problema. ¿Hay un mejor momento para pasar de nuevo?`,
    coachEn: `🗣️ Says: "No problem. Is there a better time to come back?"`,
    listenFor: 'customer_response',
    autoListenMic: 'customer',
    phase: 'objection',
    nextOnPositive: 'callback_set',
    nextOnNegative: 'thank_exit',
  });

  // ═══════════════════════════════════════
  // EXIT STEPS
  // ═══════════════════════════════════════

  steps.set('leave_info', {
    id: 'leave_info',
    sayEs: `Aquí le dejo mi información. Si tiene alguna pregunta, me puede llamar cuando quiera. Que tenga un buen día.`,
    coachEn: `🗣️ Says: "Here's my info. Call me anytime if you have questions. Have a great day."`,
    listenFor: 'none',
    autoListenMic: 'none',
    phase: 'exit',
    isExit: true,
  });

  steps.set('callback_set', {
    id: 'callback_set',
    sayEs: `Perfecto, paso de nuevo entonces. Gracias por su tiempo. Que tenga buen día.`,
    coachEn: `🗣️ Says: "Perfect, I'll come back then. Thanks for your time. Have a good day."`,
    listenFor: 'none',
    autoListenMic: 'none',
    phase: 'exit',
    isExit: true,
  });

  steps.set('thank_exit', {
    id: 'thank_exit',
    sayEs: `Está bien, muchas gracias por su tiempo. Que tenga un excelente día.`,
    coachEn: `🗣️ Says: "No problem, thank you for your time. Have a great day!"`,
    listenFor: 'none',
    autoListenMic: 'none',
    phase: 'exit',
    isExit: true,
  });

  return steps;
}

/**
 * Simple sentiment classifier for customer responses.
 * Used to determine which branch to follow in the conversation.
 */
export function classifyResponse(text: string): 'positive' | 'negative' | 'question' {
  const lower = text.toLowerCase().trim();
  
  // Questions
  if (lower.includes('?') || lower.includes('cuánto') || lower.includes('qué') || 
      lower.includes('cómo') || lower.includes('cuándo') || lower.includes('dónde') ||
      lower.includes('por qué') || lower.includes('tiene') || lower.includes('hay')) {
    return 'question';
  }

  // Negative / objections
  const negatives = [
    'no', 'no gracias', 'no me interesa', 'estoy bien', 'no quiero',
    'no necesito', 'no ocupo', 'ahorita no', 'no puedo',
    'no tengo tiempo', 'estoy ocupado', 'ocupada', 'vuelva luego',
    'no estoy interesado', 'no estoy interesada', 'nunca',
  ];
  for (const neg of negatives) {
    if (lower === neg || lower.startsWith(neg + ' ') || lower.startsWith(neg + ',')) return 'negative';
  }

  // Positive / buying signals
  const positives = [
    'sí', 'si', 'órale', 'ok', 'está bien', 'bueno', 'dale',
    'háganle', 'me interesa', 'dígame', 'a ver', 'pásele',
    'claro', 'por supuesto', 'suena bien', 'listo', 'ya',
    'tmobile', 't-mobile', 'spectrum', 'at&t', 'xfinity', 'comcast',
    'verizon', 'cox', 'frontier', 'windstream', 'hughesnet',
  ];
  for (const pos of positives) {
    if (lower.includes(pos)) return 'positive';
  }

  // Default to positive (keep the conversation going)
  return 'positive';
}
