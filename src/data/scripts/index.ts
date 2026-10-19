/**
 * 📁 Sales Scripts Library
 * 
 * Pre-built conversation scripts for different scenarios.
 * These are the "playbooks" the conversation engine uses.
 */

export interface Script {
  id: string;
  name: string;
  /** When to use this script */
  trigger: string;
  /** The lines, in order */
  lines: ScriptLine[];
}

export interface ScriptLine {
  speaker: 'system' | 'rep';
  textEs: string;
  textEn: string;
  /** What to listen for after this line */
  expectResponse: boolean;
}

export const SCRIPTS: Script[] = [
  {
    id: 'cold_open',
    name: 'Cold Open (Standard Door Knock)',
    trigger: 'Default opening when customer answers door',
    lines: [
      { speaker: 'system', textEs: 'Hola, buenas tardes.', textEn: 'Hello, good afternoon.', expectResponse: false },
      { speaker: 'rep', textEs: 'Soy {repName} de {companyName}.', textEn: 'I\'m {repName} from {companyName}.', expectResponse: false },
      { speaker: 'system', textEs: 'Solo quería avisarle que hay un servicio de internet disponible en su área.', textEn: 'Just wanted to let you know there\'s internet service available in your area.', expectResponse: false },
      { speaker: 'system', textEs: '¿Ya tiene servicio de internet o cable?', textEn: 'Do you already have internet or cable?', expectResponse: true },
    ],
  },
  {
    id: 'referral_open',
    name: 'Referral Open (Neighbor Mentioned)',
    trigger: 'When another neighbor referred you or you just installed nearby',
    lines: [
      { speaker: 'system', textEs: 'Hola, buenas tardes.', textEn: 'Hello, good afternoon.', expectResponse: false },
      { speaker: 'rep', textEs: 'Soy {repName} de {companyName}. Acabo de instalar el servicio aquí con su vecino.', textEn: 'I\'m {repName} from {companyName}. I just installed service here with your neighbor.', expectResponse: false },
      { speaker: 'system', textEs: 'Quería ver si le interesa aprovechar la misma promoción.', textEn: 'Wanted to see if you\'re interested in the same promo.', expectResponse: true },
    ],
  },
  {
    id: 'callback_open',
    name: 'Callback Open (Returning)',
    trigger: 'When coming back to a house you visited before',
    lines: [
      { speaker: 'system', textEs: 'Hola, buenas tardes. Pasé hace unos días por lo del servicio de internet.', textEn: 'Hi, good afternoon. I came by a few days ago about the internet service.', expectResponse: false },
      { speaker: 'rep', textEs: 'Soy {repName} de {companyName}. ¿Tuvo oportunidad de pensarlo?', textEn: 'I\'m {repName} from {companyName}. Did you have a chance to think about it?', expectResponse: true },
    ],
  },
  {
    id: 'speed_close',
    name: 'Speed Close (Quick Sale)',
    trigger: 'Customer seems interested from the start, go fast',
    lines: [
      { speaker: 'system', textEs: 'Tenemos internet de alta velocidad a solo ${cheapestPrice} al mes. Sin contrato. Instalación gratis.', textEn: 'High speed internet at just ${cheapestPrice}/mo. No contract. Free install.', expectResponse: false },
      { speaker: 'system', textEs: '¿Tiene su identificación a la mano? Solo toma unos minutos.', textEn: 'Do you have your ID handy? Only takes a few minutes.', expectResponse: true },
    ],
  },
];
