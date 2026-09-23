/**
 * Wat er op de site gebeurt, geteld en verder niets.
 *
 * Dit is bewust géén bezoekersvolgsysteem. Er wordt **geteld**, niet
 * bijgehouden: er is geen cookie, geen sessie-id, geen ip-adres, geen
 * useragent en geen enkel spoor dat naar één bezoeker terugleidt. Wat er in
 * de opslag komt is een getal per dag per gebeurtenis per bron, en meer niet.
 *
 * Dat is geen voorzichtigheid om de voorzichtigheid. Wie hier op
 * `/uwv-wia` komt, vertelt daarmee iets over zijn gezondheid. Dat is een
 * bijzonder persoonsgegeven, en dat hoort niet in een analysesysteem en al
 * helemaal niet bij een advertentieplatform. Door alleen op te tellen kan het
 * er ook niet per ongeluk in terechtkomen.
 *
 * Omdat er niets op het apparaat van de bezoeker wordt gezet of gelezen, is
 * hiervoor geen cookiebanner nodig. Zodra er wél een pixel van een derde bij
 * komt, verandert dat - zie docs/meten.md.
 *
 * De lijst gebeurtenissen hieronder is gesloten. De meetroute is openbaar
 * (hij moet vanuit de browser aan te roepen zijn), dus zonder die lijst kan
 * iemand er van buitenaf willekeurige tellers in schrijven en zijn je cijfers
 * waardeloos.
 */

/** Wat we tellen. Alles wat hier niet in staat, wordt geweigerd. */
export const GEBEURTENISSEN = {
  bezoek: 'Bezoek aan een pagina',
  'funnel-start': 'Funnel geopend',
  'funnel-brief': 'Brief geüpload of gegevens ingevuld',
  'funnel-uitslag': 'Uitslag getoond',
  'funnel-gegevens': 'Gegevens ingevuld',
  'funnel-akkoord': 'Machtiging getekend',
  aanvraag: 'Aanvraag ingediend',
};

/** De bronnen die we uit elkaar willen houden. */
export const BRONNEN = ['meta', 'google', 'organisch', 'direct', 'overig'];

const MAX_BRON = 24;

/**
 * Van een ruwe herkomst naar een van de vaste bronnen.
 *
 * Vrije tekst uit een url zou hier zó in de tellers belanden, en dan heb je
 * honderd varianten van "facebook". Alles wat niet herkend wordt, is `overig`.
 */
export function normaliseerBron(ruw, verwijzer = '') {
  const waarde = String(ruw || '').toLowerCase().trim().slice(0, MAX_BRON);
  if (waarde) {
    if (/(meta|facebook|fb|instagram|ig)/.test(waarde)) return 'meta';
    if (/(google|adwords|gads|youtube)/.test(waarde)) return 'google';
    if (BRONNEN.includes(waarde)) return waarde;
    return 'overig';
  }
  const host = String(verwijzer || '').toLowerCase();
  if (!host) return 'direct';
  if (/(facebook|instagram)\./.test(host)) return 'meta';
  if (/(google|bing|duckduckgo|ecosia)\./.test(host)) return 'organisch';
  if (/nubeslist\.nl/.test(host)) return 'direct';
  return 'overig';
}

/**
 * Een pagina terugbrengen tot iets wat je kunt tellen.
 *
 * Alleen het pad, zonder queryreeks: daar kan van alles in staan wat we niet
 * willen bewaren. En alleen paden die we kennen, zodat een willekeurige url
 * geen eigen teller krijgt.
 */
export function normaliseerPagina(pad, bekend = []) {
  const schoon = String(pad || '/').split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';
  if (schoon === '/') return 'start';
  const zonder = schoon.replace(/^\//, '');
  return bekend.includes(schoon) ? zonder : 'overig';
}

/** De sleutel waaronder een telling in de opslag komt. */
export function veld(gebeurtenis, bron, pagina = '') {
  return pagina ? `${gebeurtenis}|${bron}|${pagina}` : `${gebeurtenis}|${bron}`;
}

/** 'YYYY-MM-DD' van vandaag, in UTC. */
export function vandaagSleutel(nu = new Date()) {
  return nu.toISOString().slice(0, 10);
}

/** Is dit een gebeurtenis die wij tellen? */
export function geldigeGebeurtenis(naam) {
  return Object.prototype.hasOwnProperty.call(GEBEURTENISSEN, naam);
}

/**
 * De laatste `dagen` dagen als datumsleutels, oudste eerst.
 */
export function laatsteDagen(dagen, nu = new Date()) {
  const uit = [];
  for (let i = dagen - 1; i >= 0; i--) {
    uit.push(new Date(nu.getTime() - i * 86400000).toISOString().slice(0, 10));
  }
  return uit;
}

/**
 * Bouwt het overzicht uit de ruwe tellingen.
 *
 * @param {Array<{dag: string, tellingen: object}>} ruw
 * @returns {{dagen: Array, totalen: object, perBron: object, perPagina: object, trechter: Array}}
 */
export function overzicht(ruw) {
  const totalen = {};
  const perBron = {};
  const perPagina = {};
  const dagen = [];

  for (const { dag, tellingen } of ruw) {
    const perDag = { dag, bezoek: 0, 'funnel-start': 0, aanvraag: 0 };
    for (const [sleutel, aantal] of Object.entries(tellingen || {})) {
      const [gebeurtenis, bron, pagina] = sleutel.split('|');
      if (!geldigeGebeurtenis(gebeurtenis)) continue;
      const n = Number(aantal) || 0;
      totalen[gebeurtenis] = (totalen[gebeurtenis] || 0) + n;
      perBron[bron] ||= {};
      perBron[bron][gebeurtenis] = (perBron[bron][gebeurtenis] || 0) + n;
      if (pagina && gebeurtenis === 'bezoek') {
        perPagina[pagina] = (perPagina[pagina] || 0) + n;
      }
      if (gebeurtenis in perDag) perDag[gebeurtenis] += n;
    }
    dagen.push(perDag);
  }

  // De trechter: van bezoek tot ingediende aanvraag, met het verlies per stap.
  const volgorde = ['bezoek', 'funnel-start', 'funnel-uitslag', 'funnel-gegevens', 'aanvraag'];
  let vorige = null;
  const trechter = volgorde.map((stap) => {
    const aantal = totalen[stap] || 0;
    const rij = {
      stap,
      label: GEBEURTENISSEN[stap],
      aantal,
      // Het percentage ten opzichte van de vorige stap zegt waar het lek zit;
      // ten opzichte van het bezoek zegt wat er onderaan overblijft.
      vanVorige: vorige === null || vorige === 0 ? null : Math.round((aantal / vorige) * 1000) / 10,
      vanBezoek: totalen.bezoek ? Math.round((aantal / totalen.bezoek) * 1000) / 10 : null,
    };
    vorige = aantal;
    return rij;
  });

  return { dagen, totalen, perBron, perPagina, trechter };
}
