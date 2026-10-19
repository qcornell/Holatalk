/**
 * 📁 Buying Signals & Hot Lead Indicators
 * 
 * When you hear these: STOP TALKING and CLOSE.
 * Or if hot lead: push harder, they're almost there.
 */

export interface Signal {
  id: string;
  type: 'buying' | 'hot_lead' | 'callback';
  triggers: string[];
  spanglish: string[];
  meaningEn: string;
  actionEn: string;
  actionEs: string;
}

export const SIGNALS: Signal[] = [

  // ═══════════════════════════════════════
  // 🟢 BUYING SIGNALS — CLOSE NOW
  // ═══════════════════════════════════════
  { id: 'SIG_HAGANLE', type: 'buying', triggers: ['pues háganle', 'háganle', 'hágale', 'pues dele'], spanglish: ['let\'s do it'], meaningEn: 'Ready to buy!', actionEn: '🟢 CLOSE NOW — Get ID, confirm address!', actionEs: 'Perfecto. Solo necesito su identificación y confirmamos su dirección.' },
  { id: 'SIG_ORALE', type: 'buying', triggers: ['órale sí', 'órale', 'ándale pues', 'va pues', 'sale pues'], spanglish: ['ok let\'s go'], meaningEn: 'Agreement!', actionEn: '🟢 CLOSE NOW!', actionEs: 'Excelente. Vamos a empezar con su información.' },
  { id: 'SIG_DONDE_FIRMO', type: 'buying', triggers: ['¿dónde firmo?', 'firmo'], spanglish: ['where do I sign?'], meaningEn: 'Ready to sign!', actionEn: '🟢🟢🟢 CLOSE IMMEDIATELY!', actionEs: 'Aquí mismo. Solo necesito su identificación.' },
  { id: 'SIG_QUE_OCUPO', type: 'buying', triggers: ['¿qué ocupo?', '¿qué necesitan de mí?', '¿qué necesito?'], spanglish: ['what do you need from me?'], meaningEn: 'Asking what to provide = buying!', actionEn: '🟢 They want to buy! List what you need.', actionEs: 'Solo necesito una identificación y confirmar su dirección.' },
  { id: 'SIG_INTERESA', type: 'buying', triggers: ['sí me interesa', 'me interesa', 'me convence', 'me convenció', 'suena bien'], spanglish: ['sounds good', 'i\'m interested'], meaningEn: 'Expressed interest!', actionEn: '🟢 Interest confirmed — move to close!', actionEs: 'Perfecto, le va a encantar el servicio. ¿Tiene su identificación a la mano?' },
  { id: 'SIG_PASELE', type: 'buying', triggers: ['pásele', 'pase', 'entre'], spanglish: ['come in'], meaningEn: 'Inviting you inside!', actionEn: '🟢 They\'re inviting you in — this is a sale!', actionEs: 'Gracias. Solo necesito unos minutos.' },
  { id: 'SIG_ID_READY', type: 'buying', triggers: ['espéreme, deje traigo mi id', 'deje traigo mi id', 'deje busco mi identificación', 'ahorita le traigo'], spanglish: ['let me get my ID'], meaningEn: 'Getting their ID = DONE DEAL', actionEn: '🟢🟢🟢 SALE! They\'re getting their ID. Wait patiently.', actionEs: 'Claro, aquí lo espero. No se preocupe.' },
  { id: 'SIG_CUANDO', type: 'buying', triggers: ['¿cuándo empiezan?', '¿cuándo instalan?', '¿lo pueden hacer ahorita?', '¿cuándo lo ponen?'], spanglish: ['when can you install?'], meaningEn: 'Asking about installation = buying!', actionEn: '🟢 Logistics question = sold! Give install timeline.', actionEs: 'Podemos programar la instalación esta misma semana.' },

  // ═══════════════════════════════════════
  // 🟡 HOT LEAD — PUSH HARDER
  // ═══════════════════════════════════════
  { id: 'SIG_BASURA', type: 'hot_lead', triggers: ['mi internet es una basura', 'es una basura', 'es un asco', 'pésimo servicio'], spanglish: ['my internet sucks'], meaningEn: 'Hates current provider!', actionEn: '🟡 Validate their frustration, then pitch!', actionEs: 'Eso es lo que escuchamos mucho. Con nosotros le garantizamos la velocidad.' },
  { id: 'SIG_PRICE_HIKE', type: 'hot_lead', triggers: ['me subieron el precio', 'me subieron sin avisar', 'cada vez pago más'], spanglish: ['they raised my price'], meaningEn: 'Price-hiked. Angry.', actionEn: '🟡 Perfect opening! Quote your locked price.', actionEs: 'Con nosotros el precio que le doy es el que paga. Sin sorpresas.' },
  { id: 'SIG_SLOW', type: 'hot_lead', triggers: ['es muy lento', 'no me dan la velocidad', 'siempre se traba', 'se cae cada rato', 'no jala'], spanglish: ['it\'s so slow', 'el wifi no jala'], meaningEn: 'Speed issues. Want better.', actionEn: '🟡 Pitch your speed guarantee!', actionEs: 'Le garantizamos la velocidad. Si no le cumplimos, cancela sin costo.' },
  { id: 'SIG_NO_SUPPORT', type: 'hot_lead', triggers: ['nunca contestan', 'llamo y no me ayudan', 'el servicio al cliente es malo'], spanglish: ['they never answer'], meaningEn: 'Bad support. Frustrated.', actionEn: '🟡 Pitch your customer service!', actionEs: 'Nosotros tenemos soporte en español las 24 horas. Siempre le vamos a contestar.' },

  // ═══════════════════════════════════════
  // 📅 CALLBACK — SCHEDULE RETURN
  // ═══════════════════════════════════════
  { id: 'SIG_CALLBACK', type: 'callback', triggers: ['pase mañana', 'venga después', 'regrese más tarde', 'pase otro día', 'ahorita no puedo'], spanglish: ['come back later'], meaningEn: 'Not now but maybe later.', actionEn: '📅 Get a specific time. "What time works best?"', actionEs: '¿A qué hora le queda mejor? Paso con gusto.' },
];

/** Find matching signal from customer speech */
export function findSignal(text: string): Signal | null {
  const lower = text.toLowerCase().trim();
  for (const sig of SIGNALS) {
    for (const trigger of sig.triggers) {
      if (lower.includes(trigger.toLowerCase())) return sig;
    }
    for (const sp of sig.spanglish) {
      if (lower.includes(sp.toLowerCase())) return sig;
    }
  }
  return null;
}
