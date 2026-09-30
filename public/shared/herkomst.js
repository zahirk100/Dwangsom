/**
 * Waar een bezoeker vandaan komt.
 *
 * Gedeeld tussen de browser en de server, want ze weten allebei een stuk van
 * het antwoord. De browser ziet de hele url waarop iemand binnenkomt; de
 * server ziet alleen wat de browser doorgeeft en bepaalt wat er uiteindelijk
 * in de teller mag. Eén lijst kanalen, op één plek.
 *
 * Waarom dit meer is dan "lees utm_source": advertentieplatforms zetten dat
 * veld niet zelf. Google plakt `gclid` achter de link, Meta plakt `fbclid`,
 * en verder niets. Zonder die twee te herkennen belandt een betaalde klik
 * uit Google onder "organisch" (want de verwijzer is google.com) en een klik
 * uit Meta onder "direct" (want de app in Facebook stuurt meestal helemaal
 * geen verwijzer mee). Je ziet dan wél bezoekers, maar niet dat je ervoor
 * betaald hebt, en dus ook niet of de advertentie iets oplevert.
 */

/**
 * De kanalen die we uit elkaar houden. Gesloten lijst: alles wat er niet in
 * staat wordt `overig`. Zonder die grens krijg je honderd varianten van
 * "facebook" in je cijfers en kun je er niets meer mee.
 */
export const BRONNEN = [
  'meta-ads',     // betaald via Meta: Facebook en Instagram
  'google-ads',   // betaald via Google, inclusief YouTube
  'andere-ads',   // betaald elders: TikTok, Microsoft, LinkedIn
  'organisch',    // via een zoekmachine, onbetaald
  'sociaal',      // via een bericht of profiel, onbetaald
  'direct',       // rechtstreeks ingetypt, of vanaf de site zelf
  'overig',
];

const MAX_BRON = 24;

/** De klik-parameters die de platforms zelf achter hun links plakken. */
const KLIKMERKEN = [
  [/^(gclid|gbraid|wbraid|gclsrc|gad_source|gad_campaignid)$/, 'google-ads'],
  [/^(fbclid|igshid)$/, 'meta-ads'],
  [/^(ttclid|msclkid|twclid|li_fat_id|epik|sccid)$/, 'andere-ads'],
];

/** Namen waarmee mensen hun eigen campagnes taggen. */
const PLATFORMEN = [
  [/(meta|facebook|instagram|^fb$|^ig$)/, 'meta-ads'],
  [/(google|adwords|gads|youtube)/, 'google-ads'],
  [/(tiktok|bing|microsoft|linkedin|snapchat|pinterest|twitter|^x$)/, 'andere-ads'],
];

/** Verwijzers, voor wie zonder enige markering binnenkomt. */
const VERWIJZERS = [
  [/(google|bing|duckduckgo|ecosia|yahoo|startpage|brave)\./, 'organisch'],
  [/(facebook|instagram|linkedin|tiktok|reddit|youtube|twitter|t\.co|x\.com)/, 'sociaal'],
  [/nubeslist\.nl/, 'direct'],
];

/** Media die juist zeggen dat het géén advertentie is. */
const ONBETAALD = /(organic|referral|email|mail|nieuwsbrief|sms|push|social-organic)/;
/** Daarvan de kanalen die we zelf in de hand hebben; die zijn niet "direct". */
const EIGEN_KANAAL = /(email|mail|nieuwsbrief|sms|push)/;
const BETAALD = /(cpc|ppc|paid|ads|display|banner|retargeting)/;

const schoon = (waarde) => String(waarde || '').toLowerCase().trim().slice(0, MAX_BRON);

/**
 * Het kanaal waarlangs dit bezoek binnenkwam.
 *
 * @param {object} bezoek
 * @param {URLSearchParams|string} [bezoek.zoek] de queryreeks van de pagina
 * @param {string} [bezoek.verwijzer] alleen de host van de verwijzer
 * @returns {string} één van BRONNEN
 */
export function kanaal({ zoek = '', verwijzer = '' } = {}) {
  let vraag;
  try {
    vraag = typeof zoek === 'string' ? new URLSearchParams(zoek) : zoek;
  } catch { vraag = new URLSearchParams(); }
  const lees = (naam) => {
    try { return schoon(vraag.get(naam)); } catch { return ''; }
  };

  const medium = lees('utm_medium');
  const eigen = lees('bron') || lees('utm_source');

  // 1. De klik-parameter van het platform zelf. Die staat er alleen als er op
  //    een advertentie is geklikt, dus dit is het hardste bewijs dat er is.
  //    Wel pas nadat utm_medium heeft kunnen zeggen dat het onbetaald is: een
  //    fbclid blijft soms aan een link plakken als iemand hem doorstuurt.
  if (!ONBETAALD.test(medium)) {
    try {
      for (const sleutel of vraag.keys()) {
        for (const [patroon, kanaalNaam] of KLIKMERKEN) {
          if (patroon.test(sleutel.toLowerCase())) return kanaalNaam;
        }
      }
    } catch { /* een rare queryreeks mag niets kosten */ }
  }

  // 2. Een tag die we zelf aan de advertentie hebben gehangen.
  if (eigen && !ONBETAALD.test(medium)) {
    if (BRONNEN.includes(eigen)) return eigen;
    for (const [patroon, kanaalNaam] of PLATFORMEN) {
      if (patroon.test(eigen)) return kanaalNaam;
    }
    return BETAALD.test(medium) ? 'andere-ads' : 'overig';
  }

  // 3. Een kanaal dat we zelf in de hand hebben en dat geen advertentie is.
  //    Dat is geen "direct" bezoek: we weten precies waar het vandaan komt,
  //    het heeft alleen niets gekost.
  if (EIGEN_KANAAL.test(medium)) return 'overig';
  if (eigen && BRONNEN.includes(eigen)) return eigen;

  // 4. Niets bruikbaars meegekregen: dan zegt de verwijzer het, of niemand.
  const host = String(verwijzer || '').toLowerCase();
  if (!host) return 'direct';
  for (const [patroon, kanaalNaam] of VERWIJZERS) {
    if (patroon.test(host)) return kanaalNaam;
  }
  return 'overig';
}

/**
 * Wat de server van de browser aanneemt.
 *
 * De browser heeft het kanaal al bepaald, want alleen daar is de hele url
 * bekend. De server gelooft dat alleen als het een kanaal uit de lijst is;
 * anders valt hij terug op wat hij zelf kan zien. Zo komt er nooit vrije tekst
 * uit een url in de tellers terecht.
 */
export function normaliseerBron(ruw, verwijzer = '') {
  const waarde = schoon(ruw);
  if (BRONNEN.includes(waarde)) return waarde;
  return kanaal({ zoek: waarde ? `bron=${encodeURIComponent(waarde)}` : '', verwijzer });
}
