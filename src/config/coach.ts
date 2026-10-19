import { CompanyConfig } from './types';

/**
 * Dynamic Coach Response Generator
 * 
 * Takes the company config and generates tailored coaching responses
 * that get plugged into the intent engine.
 */

export function generateCoachResponses(config: CompanyConfig) {
  const { repName, companyName, plans, policies, promos } = config;
  const plan = plans[0];
  const idsFormatted = policies.acceptedIds.join(', ');
  const promo = promos[0];

  return {
    /** What the rep says when app wakes up */
    greeting: {
      en: `Say: "Hi, my name is ${repName} with ${companyName}"`,
      es: `Hola, soy ${repName} de ${companyName}.`,
    },

    PRICE_QUESTION: {
      en: `💰 PRICE — $${plan.priceMonthly}/mo. No contract. Price stays the same. Free installation.`,
      es: promo 
        ? `${promo.descriptionEs}`
        : `El internet está a $${plan.priceMonthly} al mes. Sin contrato.`,
    },

    NOT_INTERESTED: {
      en: `🔴 OBJECTION — Don't push. Leave info + card.`,
      es: `¿Le puedo dejar la información? No le cuesta nada revisar.`,
    },

    DECISION_MAKER_ABSENT: {
      en: `👤 ABSENT — Get callback time. Leave your name + company.`,
      es: `¿A qué hora regresa? Con gusto paso de nuevo. Soy ${repName} de ${companyName}.`,
    },

    CONTRACT_FEAR: {
      en: `📋 NO CONTRACT — Cancel anytime, zero penalties. Price stays the same.`,
      es: `No hay contrato. Se puede salir cuando quiera, sin multa. El precio se queda igual.`,
    },

    CREDIT_ID_FEAR: {
      en: `🪪 NO CREDIT CHECK — IDs accepted: ${idsFormatted}.`,
      es: `No checamos crédito. Aceptamos ${idsFormatted}. Su información está segura.`,
    },

    BUYING_SIGNAL: {
      en: `🟢🟢🟢 CLOSE NOW — Get name, number, email. Ship modem via FedEx.`,
      es: `Perfecto. Solo necesito un buen nombre, número de teléfono, y correo electrónico.`,
    },

    PROVIDER_FRUSTRATION: {
      en: `🟡 HOT LEAD — They're unhappy. Pitch $${plan.priceMonthly}/mo, no contract, price stays the same.`,
      es: `Eso es lo que escuchamos mucho. Con ${companyName} el precio es $${plan.priceMonthly} al mes y no sube. Sin contrato.`,
    },
  };
}
