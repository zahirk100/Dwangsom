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
  'funnel-brief': 'Brief geüpload',
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

/** De stappen van de trechter, in volgorde. */
export const TRECHTERSTAPPEN = ['bezoek', 'funnel-start', 'funnel-brief', 'funnel-uitslag',
  'funnel-gegevens', 'funnel-akkoord', 'aanvraag'];

/**
 * Van losse aantallen naar een trechter met het verlies per stap.
 *
 * Twee percentages, want ze beantwoorden twee verschillende vragen. `vanVorige`
 * zegt waar het lek zit - een stap die de helft kwijtraakt is een probleem van
 * die stap. `vanBezoek` zegt wat er onderaan overblijft, en dat is wat een
 * advertentie oplevert.
 */
export function trechterVan(totalen = {}) {
  let vorige = null;
  const bezoek = totalen.bezoek || 0;
  return TRECHTERSTAPPEN.map((stap) => {
    const aantal = totalen[stap] || 0;
    const rij = {
      stap,
      label: GEBEURTENISSEN[stap],
      aantal,
      vanVorige: vorige === null || vorige === 0 ? null : Math.round((aantal / vorige) * 1000) / 10,
      vanBezoek: bezoek ? Math.round((aantal / bezoek) * 1000) / 10 : null,
      // Hoeveel er op déze stap wegliep. Dat is het getal waar je iets aan
      // kunt doen; de percentages zeggen alleen hoe erg het is.
      verloren: vorige === null ? null : Math.max(0, vorige - aantal),
    };
    vorige = aantal;
    return rij;
  });
}

/**
 * Bouwt het overzicht uit de ruwe tellingen.
 *
 * Alles wat hier uitkomt is per dag én per bron beschikbaar. Dat is niet
 * netheid maar de hele reden dat er geteld wordt: "we hadden deze maand 400
 * bezoekers" zegt niets over de advertentie van gisteren, en een trechter over
 * alle bronnen samen verbergt precies het kanaal dat niets oplevert.
 *
 * @param {Array<{dag: string, tellingen: object}>} ruw
 */
export function overzicht(ruw) {
  const totalen = {};
  const perBron = {};
  const perPagina = {};
  const dagen = [];

  for (const { dag, tellingen } of ruw) {
    // Elke dag krijgt alle stappen, ook de nullen: een dag die ontbreekt in de
    // tabel leest als "geen gegevens", een dag met nullen als "niemand kwam".
    const perDag = { dag };
    for (const stap of TRECHTERSTAPPEN) perDag[stap] = 0;
    perDag.bronnen = {};

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
      // Per dag én per bron, zodat je kunt zien of de dip van gisteren aan
      // één kanaal lag of aan alles.
      perDag.bronnen[bron] ||= {};
      perDag.bronnen[bron][gebeurtenis] = (perDag.bronnen[bron][gebeurtenis] || 0) + n;
    }
    dagen.push(perDag);
  }

  // Dezelfde trechter, per bron. Zo zie je niet alleen dát meta minder
  // oplevert dan google, maar ook wáár die bezoekers afhaken.
  const trechterPerBron = {};
  for (const [bron, tellingen] of Object.entries(perBron)) {
    trechterPerBron[bron] = trechterVan(tellingen);
  }

  return {
    dagen,
    totalen,
    perBron,
    perPagina,
    trechter: trechterVan(totalen),
    trechterPerBron,
    stappen: TRECHTERSTAPPEN.map((id) => ({ id, label: GEBEURTENISSEN[id] })),
  };
}
