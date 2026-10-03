/**
 * Aanmelden via een link, voor wie al via WhatsApp bij ons is binnengekomen.
 *
 * Waarom dit bestaat: de funnel op de site vraagt iemand om zelf zijn brief te
 * fotograferen, de uitslag te lezen en dan pas te tekenen. Voor een deel van de
 * mensen die wij willen helpen zijn dat te veel stappen op een telefoon, en dan
 * haken ze af terwijl ze wél recht hebben. Het gesprek vangt dat op: een
 * medewerker heeft al vastgesteld dat er iets te halen valt, en wat er dan nog
 * moet gebeuren is één ding - de machtiging, met de gegevens die daarvoor nodig
 * zijn.
 *
 * Dus draait het hier om: de medewerker maakt een link, de aanvrager vult een
 * kort formulier in, en er ontstaat een dossier waar de brief later bij gaat.
 * De berekening, de ingebrekestelling en de rest lopen daarna hun gewone weg
 * door de beheeromgeving.
 *
 * De link is het enige slot op dit formulier: wie hem heeft, mag indienen.
 * Daarom staat er in de opslag alleen een hash, net als bij de andere
 * eenmalige links, verloopt hij, en werkt hij één keer.
 */

import { randomBytes, createHash } from 'node:crypto';

import { bsnKlopt, normaliseerBsn, ibanKlopt, normaliseerIban } from '../public/shared/identiteit.js';
import { parseDatum, vandaag } from '../public/shared/datum.js';
import { BESTUURSORGANEN, zoekZaaktype } from '../public/shared/catalogus.js';

/** De verzameling waarin de links staan. */
export const V_AANMELDLINKS = 'aanmeldlinks';

/**
 * Hoe lang een link werkt.
 *
 * Lang genoeg om een gesprek van vanmiddag morgenochtend af te maken, kort
 * genoeg dat een link die in een oude chat blijft hangen niet een jaar later
 * nog een dossier oplevert.
 */
export const GELDIG_MS = 14 * 24 * 60 * 60 * 1000;

/** Hoeveel open links er maximaal mogen staan; een rem op een vergissing. */
export const MAX_OPEN = 500;

/**
 * De twee soorten links.
 *
 * 'aanmelding' is de korte: een medewerker heeft in het gesprek al vastgesteld
 * dat de termijn voorbij is, en wat er nog moet gebeuren is de machtiging. De
 * brief hangen wij er daarna zelf bij.
 *
 * 'vooraanmelding' is voor wie er nog net te vroeg bij is: de instantie heeft
 * nog tijd om te beslissen. Er valt dan niets te vorderen en er is dus ook
 * niets te beloven - wat wij doen is de datum bewaken en, als die voorbijgaat
 * zonder besluit, namens hem in gebreke stellen. Daarvoor moeten wij wel weten
 * wélke datum, en daarom hangen er bij dit soort link een paar vragen over de
 * zaak aan.
 */
export const LINKSOORTEN = [
  {
    id: 'aanmelding',
    label: 'Aanmelding',
    uitleg: 'De beslistermijn is al voorbij. Alleen de machtiging nog; de brief hangen wij erbij.',
  },
  {
    id: 'vooraanmelding',
    label: 'Vooraanmelding',
    uitleg: 'De instantie heeft nog tijd. Wij bewaken de datum en stellen in gebreke zodra die voorbij is.',
  },
];

const LINKSOORT_IDS = new Set(LINKSOORTEN.map((s) => s.id));

export function geldigeLinksoort(id) {
  return LINKSOORT_IDS.has(String(id || '')) ? String(id) : 'aanmelding';
}

const hash = (token) => createHash('sha256').update(String(token)).digest('base64url');

/** Een token dat niet te raden is en dat wij zelf nooit bewaren. */
function nieuwToken() {
  return randomBytes(24).toString('base64url');
}

// --------------------------------------------------------------- de link ---

/**
 * Maakt een link en geeft het token één keer terug.
 *
 * Daarna is het token weg: in de opslag staat alleen de hash. Raakt die opslag
 * ooit op straat, dan liggen er geen werkende links in.
 *
 * @param {object} opslag
 * @param {{notitie?: string, door?: string, geldigMs?: number}} opties
 *   `notitie` is voor de medewerker zelf: de naam of het telefoonnummer uit het
 *   gesprek, zodat een lijst met open links leesbaar is. De aanvrager ziet hem
 *   nooit.
 */
export async function maakAanmeldlink(
  opslag,
  { notitie = '', door = '', soort = 'aanmelding', zaak = null, geldigMs = GELDIG_MS } = {},
) {
  const open = await openstaandeLinks(opslag);
  if (open.length >= MAX_OPEN) {
    const fout = new Error(`Er staan al ${MAX_OPEN} open aanmeldlinks. Ruim er eerst een paar op.`);
    fout.statuscode = 409;
    throw fout;
  }

  const token = nieuwToken();
  const nu = new Date();
  const rij = {
    id: hash(token),
    soort: geldigeLinksoort(soort),
    // Wat de medewerker in het gesprek al heeft genoteerd. Dit is geen geheim
    // en geen gegeven van de aanvrager: het is de zaak zelf, en hoe meer
    // hiervan klopt, hoe korter het formulier wordt.
    zaak: zaak && typeof zaak === 'object' ? valideerZaak(zaak).gegevens : {},
    notitie: String(notitie || '').trim().slice(0, 120),
    door: String(door || '').slice(0, 120),
    aangemaaktOp: nu.toISOString(),
    verlooptOp: new Date(nu.getTime() + geldigMs).toISOString(),
    gebruiktOp: null,
    referentie: null,
    ingetrokkenOp: null,
  };
  await opslag.zetRij(V_AANMELDLINKS, rij.id, rij);
  return { token, link: rij };
}

/** Wat een link mankeert, of null als hij in orde is. */
export function wathapert(rij, nu = Date.now()) {
  if (!rij) return 'onbekend';
  if (rij.ingetrokkenOp) return 'ingetrokken';
  if (rij.gebruiktOp) return 'gebruikt';
  if (new Date(rij.verlooptOp).getTime() < nu) return 'verlopen';
  return null;
}

export const REDENEN = {
  onbekend: 'Deze link kennen wij niet. Controleer of je hem helemaal hebt gekopieerd.',
  ingetrokken: 'Deze link is ingetrokken. Vraag ons om een nieuwe.',
  gebruikt: 'Deze link is al gebruikt. Je aanmelding staat bij ons; je hoeft niets meer te doen.',
  verlopen: 'Deze link is verlopen. Stuur ons een berichtje, dan maken wij een nieuwe.',
};

/** Zoekt de link op bij een token, zonder hem te gebruiken. */
export async function zoekAanmeldlink(opslag, token) {
  if (!token) return null;
  return opslag.rij(V_AANMELDLINKS, hash(token));
}

/** Zet de link op gebruikt. Pas doen als het dossier er echt is. */
export async function sluitAanmeldlink(opslag, token, referentie) {
  const rij = await zoekAanmeldlink(opslag, token);
  if (!rij) return null;
  const bij = { ...rij, gebruiktOp: new Date().toISOString(), referentie: referentie || null };
  await opslag.zetRij(V_AANMELDLINKS, rij.id, bij);
  return bij;
}

export async function trekAanmeldlinkIn(opslag, id) {
  const rij = await opslag.rij(V_AANMELDLINKS, id);
  if (!rij) return null;
  const bij = { ...rij, ingetrokkenOp: new Date().toISOString() };
  await opslag.zetRij(V_AANMELDLINKS, rij.id, bij);
  return bij;
}

/** Alle links die nog iets kunnen doen. */
export async function openstaandeLinks(opslag, nu = Date.now()) {
  const alle = await opslag.rijen(V_AANMELDLINKS);
  return alle.filter((rij) => wathapert(rij, nu) === null);
}

/**
 * De lijst voor de beheeromgeving: open links eerst, daarna wat er mee gebeurd
 * is. Het token staat er niet in en kan er ook niet meer in: dat bestaat na het
 * aanmaken nergens meer.
 */
export async function aanmeldlinkOverzicht(opslag, nu = Date.now()) {
  const alle = await opslag.rijen(V_AANMELDLINKS);
  return alle
    .map((rij) => ({ ...rij, staat: wathapert(rij, nu) || 'open' }))
    .sort((a, b) => {
      if ((a.staat === 'open') !== (b.staat === 'open')) return a.staat === 'open' ? -1 : 1;
      return String(b.aangemaaktOp).localeCompare(String(a.aangemaaktOp));
    })
    .slice(0, 200);
}

/** Links die hun tijd gehad hebben, ruimt de dagelijkse ronde op. */
export async function snoeiAanmeldlinks(opslag, nu = Date.now()) {
  const alle = await opslag.rijen(V_AANMELDLINKS);
  const grens = nu - 90 * 24 * 60 * 60 * 1000;
  let weg = 0;
  for (const rij of alle) {
    const afgedaan = wathapert(rij, nu) !== null;
    const oud = new Date(rij.aangemaaktOp).getTime() < grens;
    if (afgedaan && oud) {
      await opslag.wisRij(V_AANMELDLINKS, rij.id);
      weg += 1;
    }
  }
  return weg;
}

// ----------------------------------------------------------- het formulier -

/**
 * Wat wij vragen, en waarom precies dit.
 *
 * Naam en geboortedatum horen op de machtiging: daarmee weet de instantie wie
 * ons gemachtigd heeft. Het burgerservicenummer is waarmee een instantie een
 * dossier opzoekt; zonder dat nummer kunnen wij geen melding doen die ergens
 * aankomt. Het rekeningnummer is waar de vergoeding heen gaat, en die gaat
 * rechtstreeks naar de aanvrager en niet naar ons.
 *
 * Meer vragen wij niet. Elk extra veld is een reden om te stoppen, en alles
 * wat wij later alsnog nodig hebben, kunnen wij vragen als er een dossier is.
 */
export const VELDEN = ['naam', 'geboortedatum', 'bsn', 'iban'];

const LABELS = {
  naam: 'je naam',
  geboortedatum: 'je geboortedatum',
  bsn: 'je burgerservicenummer',
  iban: 'je rekeningnummer',
};

/** Een handtekening is een plaatje, en alleen een plaatje. */
function handtekeningKlopt(waarde) {
  if (!waarde || typeof waarde !== 'object') return false;
  const afbeelding = String(waarde.afbeelding || '');
  return /^data:image\/png;base64,[A-Za-z0-9+/=]{200,}$/.test(afbeelding);
}

/**
 * Leest het ingevulde formulier na.
 *
 * Alles wat niet klopt komt per veld terug, zodat het scherm het bij het juiste
 * vakje kan zetten. Eén foutmelding bovenaan laat iemand zoeken.
 */
export function valideerAanmelding(body = {}) {
  const fouten = {};
  const schoon = {};

  const naam = String(body.naam || '').trim();
  if (naam.length < 2) fouten.naam = `Vul ${LABELS.naam} in.`;
  else if (naam.length > 120) fouten.naam = 'Deze naam is te lang.';
  else schoon.naam = naam;

  const geboortedatum = String(body.geboortedatum || '').trim();
  const geboortems = parseDatum(geboortedatum);
  if (geboortems === null) {
    fouten.geboortedatum = `Vul ${LABELS.geboortedatum} in, als 01-01-1980.`;
  } else {
    const jaren = (Date.now() - geboortems) / (365.25 * 24 * 60 * 60 * 1000);
    if (jaren < 16) fouten.geboortedatum = 'Je moet 16 jaar of ouder zijn om zelf te tekenen.';
    else if (jaren > 120) fouten.geboortedatum = 'Controleer je geboortedatum.';
    else schoon.geboortedatum = geboortedatum;
  }

  const bsn = normaliseerBsn(body.bsn);
  if (!bsn) fouten.bsn = `Vul ${LABELS.bsn} in.`;
  // De elfproef: een typefout komt er bijna altijd uit, en dan merkt de
  // aanvrager het nu in plaats van over drie weken bij de instantie.
  else if (!bsnKlopt(bsn)) fouten.bsn = 'Dit burgerservicenummer klopt niet. Controleer de negen cijfers.';
  else schoon.bsn = bsn;

  const iban = normaliseerIban(body.iban);
  if (!iban) fouten.iban = `Vul ${LABELS.iban} in.`;
  else if (!ibanKlopt(iban)) fouten.iban = 'Dit rekeningnummer klopt niet. Controleer het nog een keer.';
  else schoon.iban = iban;

  // E-mail is niet verplicht: wie via WhatsApp binnenkwam, heeft ons al. Maar
  // zonder e-mailadres is er geen bevestiging en geen eigen dossier om in te
  // kijken, dus vragen wij het wel.
  const email = String(body.email || '').trim().toLowerCase();
  if (email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) fouten.email = 'Controleer je e-mailadres.';
    else schoon.email = email;
  }

  const telefoon = String(body.telefoon || '').replace(/[^0-9+]/g, '').slice(0, 20);
  if (telefoon) schoon.telefoon = telefoon;

  if (!handtekeningKlopt(body.handtekening)) {
    fouten.handtekening = 'Zet je handtekening in het vak.';
  } else {
    schoon.handtekening = {
      afbeelding: body.handtekening.afbeelding,
      gezetOp: new Date().toISOString(),
    };
  }

  if (body.akkoord !== true) {
    fouten.akkoord = 'Je moet akkoord gaan met de machtiging en de voorwaarden.';
  }

  return { geldig: Object.keys(fouten).length === 0, fouten, gegevens: schoon };
}

// ---------------------------------------------------------------- de zaak --

/**
 * De vragen over de zaak zelf.
 *
 * Alleen bij een vooraanmelding, en alleen omdat er anders niets te bewaken
 * valt: zonder te weten wélke aanvraag en van wanneer, weten wij ook niet
 * wanneer de instantie te laat is. Dat is precies de belofte van dit formulier
 * en er staat verder niets tegenover.
 *
 * Wat de medewerker in het gesprek al heeft genoteerd, staat voorgevuld. Is
 * alles al bekend, dan ziet de aanvrager alleen een overzichtje en hoeft hij
 * niets in te vullen.
 */
export const ZAAKVELDEN = ['bestuursorgaan', 'zaaktype', 'basisdatum', 'termijnEinddatum'];

/**
 * Leest de zaakgegevens na. Zonder `verplicht` mag alles leeg zijn: zo kan een
 * medewerker een link maken met alleen de instantie erin en de rest overlaten.
 */
export function valideerZaak(ruw = {}, { verplicht = false } = {}) {
  const fouten = {};
  const gegevens = {};

  const bestuursorgaan = String(ruw.bestuursorgaan || '').trim();
  if (!bestuursorgaan) {
    if (verplicht) fouten.bestuursorgaan = 'Kies bij welke instantie je aanvraag ligt.';
  } else if (!BESTUURSORGANEN.some((b) => b.id === bestuursorgaan)) {
    fouten.bestuursorgaan = 'Kies een instantie uit de lijst.';
  } else {
    gegevens.bestuursorgaan = bestuursorgaan;
  }

  const zaaktype = String(ruw.zaaktype || '').trim();
  const soort = zaaktype ? zoekZaaktype(zaaktype) : null;
  if (!zaaktype) {
    if (verplicht) fouten.zaaktype = 'Kies waar je aanvraag over gaat.';
  } else if (!soort) {
    fouten.zaaktype = 'Kies een soort zaak uit de lijst.';
  } else if (gegevens.bestuursorgaan && soort.bestuursorgaan !== gegevens.bestuursorgaan) {
    // Anders ontstaat er een zaak die nergens bestaat - bijvoorbeeld bijstand
    // bij UWV - en rekent de applicatie met een termijn die niet van toepassing is.
    fouten.zaaktype = 'Dit soort zaak hoort niet bij deze instantie.';
  } else {
    gegevens.zaaktype = soort.id;
    if (!gegevens.bestuursorgaan) gegevens.bestuursorgaan = soort.bestuursorgaan;
  }

  const basis = String(ruw.basisdatum || '').trim();
  const basisms = parseDatum(basis);
  if (!basis) {
    if (verplicht) fouten.basisdatum = 'Vul in wanneer je de aanvraag hebt gedaan.';
  } else if (basisms === null) {
    fouten.basisdatum = 'Vul de datum in als 01-01-2026.';
  } else if (basisms > vandaag()) {
    fouten.basisdatum = 'Deze datum ligt in de toekomst. Controleer hem.';
  } else if (basisms < Date.UTC(2000, 0, 1)) {
    fouten.basisdatum = 'Deze datum ligt wel erg ver terug. Controleer hem.';
  } else {
    gegevens.basisdatum = basis;
  }

  // De datum die de instantie zelf noemt, gaat altijd voor op onze tabel. Hij
  // is niet verplicht: lang niet elke brief noemt er een.
  const einde = String(ruw.termijnEinddatum || '').trim();
  if (einde) {
    const eindems = parseDatum(einde);
    if (eindems === null) {
      fouten.termijnEinddatum = 'Vul de datum in als 01-01-2026.';
    } else if (basisms !== null && eindems < basisms) {
      fouten.termijnEinddatum = 'Deze datum ligt vóór je aanvraag. Controleer hem.';
    } else {
      gegevens.termijnEinddatum = einde;
      gegevens.termijnBekend = true;
    }
  }

  return { geldig: Object.keys(fouten).length === 0, fouten, gegevens };
}

/**
 * De zaak zoals hij na dit formulier in het dossier komt.
 *
 * Wat de medewerker in het gesprek heeft vastgelegd gaat voor. Het formulier
 * vult alleen aan wat er nog niet stond - bij een nieuwe link is dat niets, en
 * bij een oude link van vóór die regel precies de velden die ontbreken.
 */
export function zaakVanLink(rij, ingevuld = {}) {
  const basis = (rij && rij.zaak) || {};
  const eigen = valideerZaak({ ...ingevuld, ...basis }, { verplicht: false });
  return eigen.gegevens;
}
