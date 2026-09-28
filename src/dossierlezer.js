/**
 * Meer dan één brief: wat zegt de stapel samen?
 *
 * Iemand die wacht op een beslissing heeft meestal niet één brief maar drie:
 * de ontvangstbevestiging, een brief waarin de instantie meer tijd vraagt, en
 * soms een brief die hij zelf heeft gestuurd. Welke daarvan de datum bepaalt
 * is precies wat hij niet weet - en het is ook precies wat uit te rekenen is.
 * Daarom vragen wij het niet, maar zoeken wij het op.
 *
 * De regels, in de volgorde waarin ze gelden:
 *
 *   1. **De laatste brief die een datum noemt, wint.** Een instantie die de
 *      beslistermijn verlengt, schuift de datum op. Wie de oude datum blijft
 *      aanhouden, rekent zich rijk en krijgt bij de rechter ongelijk.
 *   2. **De eerste brief bepaalt wanneer het begon.** De ontvangstdatum van de
 *      aanvraag staat in de ontvangstbevestiging, niet in de latere brieven.
 *   3. **Een eigen ingebrekestelling telt mee.** Wie die zelf al stuurde,
 *      hoeft dat niet nog een keer te doen; de termijn van twee weken loopt
 *      dan al vanaf díe datum.
 *   4. **Een beslissing sluit de zaak.** Is er alsnog beslist, dan is de
 *      vraag niet meer "wat kan ik doen" maar "was het te laat".
 *
 * Wat hier níet gebeurt is raden. Gaan de brieven zichtbaar over verschillende
 * zaken, dan zegt dit bestand dat, in plaats van de datums door elkaar te
 * husselen.
 */

import { naarInvoer } from './briefherkenning.js';

/** Wat een brief in het dossier doet, in gewone taal. */
const ROLLEN = {
  ontvangstbevestiging: 'Hierin staat wanneer je aanvraag binnenkwam',
  verlenging: 'Hiermee is de beslisdatum opgeschoven',
  beslissing: 'Hierin is beslist op je aanvraag',
  ingebrekestelling: 'Dit is je eigen melding dat je nog wacht',
  onbekend: 'Hier konden wij geen datum uit halen',
};

/** Oudste eerst; een brief zonder datum gaat achteraan. */
function opDatum(a, b) {
  if (!a.herkenning.briefdatum) return 1;
  if (!b.herkenning.briefdatum) return -1;
  return a.herkenning.briefdatum < b.herkenning.briefdatum ? -1 : 1;
}

/** De eerste waarde die er is, in de gegeven volgorde. */
function eerste(brieven, veld) {
  for (const brief of brieven) {
    if (brief.herkenning[veld]) return brief.herkenning[veld];
  }
  return '';
}

/**
 * @param {Array<{bestandsnaam?: string, herkenning: object}>} ruweBrieven
 * @param {{peildatum?: string}} [opties]
 * @returns {{invoer: object, brieven: Array, opmerkingen: Array, hoofdbrief: object|null}}
 */
export function leesDossier(ruweBrieven = [], { peildatum = '' } = {}) {
  const brieven = ruweBrieven
    .filter((b) => b && b.herkenning && b.herkenning.leesbaar !== false)
    .map((b, index) => ({ ...b, volgnummer: index }))
    .sort(opDatum);

  const opmerkingen = [];
  if (brieven.length === 0) {
    return { invoer: {}, brieven: [], opmerkingen, hoofdbrief: null };
  }

  const nieuwsteEerst = [...brieven].reverse();

  // De instantie en het soort zaak: wat het vaakst voorkomt. Eén brief die
  // een andere instantie noemt (omdat de naam ergens in een zin staat) hoort
  // de rest niet te overstemmen.
  const vaakste = (veld) => {
    const tellingen = new Map();
    for (const brief of brieven) {
      const waarde = brief.herkenning[veld];
      if (waarde) tellingen.set(waarde, (tellingen.get(waarde) || 0) + 1);
    }
    let beste = '';
    let hoogste = 0;
    for (const [waarde, aantal] of tellingen) {
      if (aantal > hoogste) { beste = waarde; hoogste = aantal; }
    }
    return { waarde: beste, soorten: tellingen.size };
  };

  const orgaan = vaakste('bestuursorgaan');
  const zaak = vaakste('zaaktype');
  if (orgaan.soorten > 1) {
    opmerkingen.push('Deze brieven lijken van verschillende instanties te komen. Wij rekenen met '
      + 'de instantie die het vaakst voorkomt. Gaat het om twee zaken, doe ze dan los van elkaar.');
  }
  if (zaak.soorten > 1) {
    opmerkingen.push('Deze brieven lijken over verschillende aanvragen te gaan. Controleer de '
      + 'uitslag hieronder goed, of doe de zaken los van elkaar.');
  }

  // De aanvraagdatum komt uit de oudste brief die hem noemt; de beslisdatum
  // uit de nieuwste. Dat is de hele kern van deze module.
  const aanvraagdatum = eerste(brieven, 'aanvraagdatum');
  // De datum komt bij voorkeur uit een brief van de instantie zelf. Een eigen
  // ingebrekestelling noemt de datum ook, maar citeert hem alleen; dan hoort
  // niet die brief als bron te worden aangewezen.
  const vanInstantie = (b) => b.herkenning.soortBrief !== 'ingebrekestelling';
  const metBeslisdatum = nieuwsteEerst.find((b) => b.herkenning.beslisdatum && vanInstantie(b))
    || nieuwsteEerst.find((b) => b.herkenning.beslisdatum)
    || null;
  const verlenging = nieuwsteEerst.find((b) => b.herkenning.soortBrief === 'verlenging') || null;
  const beslissing = nieuwsteEerst.find((b) => b.herkenning.soortBrief === 'beslissing') || null;
  const ingebreke = nieuwsteEerst.find((b) => b.herkenning.soortBrief === 'ingebrekestelling') || null;

  const invoer = {
    ...naarInvoer(metBeslisdatum ? metBeslisdatum.herkenning : brieven[0].herkenning),
    bestuursorgaan: orgaan.waarde,
    zaaktype: zaak.waarde,
    organisatienaam: eerste(nieuwsteEerst, 'organisatienaam'),
    basisdatum: aanvraagdatum || eerste(brieven, 'briefdatum'),
    termijnBekend: Boolean(metBeslisdatum),
    termijnEinddatum: metBeslisdatum ? metBeslisdatum.herkenning.beslisdatum : '',
    verdaagd: Boolean(verlenging),
    verdagingEinddatum: verlenging ? verlenging.herkenning.beslisdatum || '' : '',
    besluitGenomen: Boolean(beslissing),
    besluitDatum: beslissing ? beslissing.herkenning.briefdatum || '' : '',
    ingebrekeGesteld: Boolean(ingebreke),
    ingebrekestellingDatum: ingebreke ? ingebreke.herkenning.briefdatum || '' : '',
  };
  if (peildatum) invoer.peildatum = peildatum;

  // Per brief: wat hij oplevert. Dit is wat de aanvrager op het scherm ziet,
  // en het is het antwoord op "welke brief moest ik nou hebben".
  const uitgelicht = brieven.map((brief) => {
    const h = brief.herkenning;
    const bepaalt = [];
    if (brief === metBeslisdatum) bepaalt.push('beslisdatum');
    if (h.aanvraagdatum && h.aanvraagdatum === aanvraagdatum) bepaalt.push('aanvraagdatum');
    if (brief === ingebreke) bepaalt.push('ingebrekestelling');
    if (brief === beslissing) bepaalt.push('besluit');
    return {
      bestandsnaam: brief.bestandsnaam || '',
      soort: h.soortBrief || 'onbekend',
      rol: ROLLEN[h.soortBrief] || ROLLEN.onbekend,
      briefdatum: h.briefdatum || '',
      beslisdatum: h.beslisdatum || '',
      aanvraagdatum: h.aanvraagdatum || '',
      bepaalt,
      meegeteld: bepaalt.length > 0,
    };
  });

  const overbodig = uitgelicht.filter((b) => !b.meegeteld);
  if (overbodig.length > 0 && uitgelicht.length > overbodig.length) {
    opmerkingen.push(overbodig.length === 1
      ? 'Eén brief voegde niets toe aan de berekening. Dat is niet erg: wij bewaren hem bij je zaak.'
      : `${overbodig.length} brieven voegden niets toe aan de berekening. Dat is niet erg: wij bewaren ze bij je zaak.`);
  }

  return { invoer, brieven: uitgelicht, opmerkingen, hoofdbrief: metBeslisdatum || brieven[0] };
}

export { ROLLEN };
